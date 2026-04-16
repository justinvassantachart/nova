//   Memory Reader  //
// Reads WASM linear memory while the executor worker is paused to extract
// stack variable values and heap allocation contents. Uses DWARF info
// for type-aware reading with scope and time-travel filtering.

import type { DwarfInfo, StructInfo } from '@/engine/dwarf-types'
import { PRETTY_PRINTERS } from './formatters'
import { parseCppType, stringifyCppType, getBaseTypeNoNamespaces, canonicalizeTypeName } from './type-parser'

export interface MemoryValue {
    name: string; type: string; address: number; value: string | number; rawValue: number;
    size: number; isPointer: boolean; pointsTo?: number; pointeeType?: string;
    isStruct?: boolean; members?: MemoryValue[];
}

export interface HeapAllocation {
    ptr: number; size: number; typeName: string; label: string; members: MemoryValue[];
}

export interface CallFrameSnapshot {
    id: string; funcName: string; sp: number; line: number; variables: MemoryValue[]; isActive: boolean;
}

export interface MemorySnapshot {
    frames: CallFrameSnapshot[]; heapAllocations: HeapAllocation[];
}

function stripNs(canonicalName: string): string {
    return canonicalName.replace(/(?:[a-zA-Z_0-9]+::)+/g, '');
}

export function getStructDef(types: Record<string, StructInfo>, typeName: string) {
    if (!typeName) return undefined;
    if (types[typeName]) return types[typeName];

    let clean = typeName.replace(/^(struct|class)\s+/, '').trim();
    if (types[clean]) return types[clean];

    const reqCanon = canonicalizeTypeName(clean);
    const reqNoNs = stripNs(reqCanon);

    // 1st pass: exact structural match
    for (const [key, def] of Object.entries(types)) {
        const keyCanon = canonicalizeTypeName(key.replace(/^(struct|class)\s+/, ''));
        if (keyCanon === reqCanon) return def;
    }

    // 2nd pass: structural match ignoring namespaces
    for (const [key, def] of Object.entries(types)) {
        const keyCanon = canonicalizeTypeName(key.replace(/^(struct|class)\s+/, ''));
        if (stripNs(keyCanon) === reqNoNs) return def;
    }

    // 3rd pass: Match base name + exact first N template arguments (ignoring trailing defaults)
    const reqAst = parseCppType(clean);
    if (reqAst && reqAst.templateArgs.length > 0) {
        const reqBase = stripNs(reqAst.baseName);
        for (const [key, def] of Object.entries(types)) {
            const keyAst = parseCppType(key.replace(/^(struct|class)\s+/, ''));
            if (keyAst && stripNs(keyAst.baseName) === reqBase) {
                let match = true;
                for (let i = 0; i < reqAst.templateArgs.length; i++) {
                    if (i >= keyAst.templateArgs.length || stripNs(stringifyCppType(keyAst.templateArgs[i], true)) !== stripNs(stringifyCppType(reqAst.templateArgs[i], true))) {
                        match = false;
                        break;
                    }
                }
                if (match) return def;
            }
        }
    }

    return undefined;
}

export function getResolvedTypeSize(dwarfInfo: DwarfInfo, typeName: string): number {
    const ast = parseCppType(typeName);

    if (ast.pointerCount > 0 || ast.isReference || ast.isRValueReference) return 4;

    if (ast.arrayDims.length > 0) {
        const baseAst = { ...ast, arrayDims: [] };
        const baseSize = getResolvedTypeSize(dwarfInfo, stringifyCppType(baseAst)) || 4;
        let totalElements = 1;
        for (const dim of ast.arrayDims) {
            totalElements *= (dim === 0 ? 1 : dim);
        }
        return baseSize * totalElements;
    }

    const cleanType = getBaseTypeNoNamespaces(ast);
    if (['char', 'bool', 'int8_t', 'uint8_t', 'unsigned char', 'signed char'].includes(cleanType)) return 1;
    if (['short', 'unsigned short', 'int16_t', 'uint16_t'].includes(cleanType)) return 2;
    if (['int', 'unsigned', 'unsigned int', 'long', 'unsigned long', 'float', 'int32_t', 'uint32_t'].includes(cleanType)) return 4;
    if (['long long', 'unsigned long long', 'double', 'long double', 'int64_t', 'uint64_t'].includes(cleanType)) return 8;
    if (cleanType === 'string' || cleanType === 'basic_string') return 12;
    if (cleanType === 'vector') return 12;

    const def = getStructDef(dwarfInfo.types, typeName);
    return def ? def.size : 4;
}

export function readMemorySnapshot(
    memoryBuffer: ArrayBuffer | null, dwarfInfo: DwarfInfo,
    callStack: { id: string; func: string; sp: number; line: number }[],
    heapPointers: { countPtr: number; allocsPtr: number },
    knownHeapTypes: Record<number, string> = {}
): { snapshot: MemorySnapshot; nextKnownTypes: Record<number, string> } {
    const frames: CallFrameSnapshot[] = callStack.map(f => ({
        id: f.id, funcName: f.func, sp: f.sp, line: f.line, variables: [], isActive: false,
    }))
    if (frames.length > 0) frames[frames.length - 1].isActive = true

    const heapAllocations: HeapAllocation[] = []
    if (!memoryBuffer || memoryBuffer.byteLength === 0) {
        return { snapshot: { frames, heapAllocations }, nextKnownTypes: knownHeapTypes }
    }

    const view = new DataView(memoryBuffer)
    const bytes = new Uint8Array(memoryBuffer)

    const rawAllocations: { ptr: number; size: number }[] = []
    const activePtrs = new Set<number>()

    if (heapPointers.countPtr > 0 && heapPointers.allocsPtr > 0) {
        try {
            const count = view.getInt32(heapPointers.countPtr, true)
            for (let j = 0; j < count && j < 1024; j++) {
                const ptr = view.getUint32(heapPointers.allocsPtr + j * 8, true)
                const size = view.getUint32(heapPointers.allocsPtr + j * 8 + 4, true)
                rawAllocations.push({ ptr, size })
                activePtrs.add(ptr)
            }
        } catch { }
    }

    const heapTypesMap = new Map<number, string>()
    for (const [ptrStr, typeName] of Object.entries(knownHeapTypes)) {
        const ptr = Number(ptrStr)
        if (activePtrs.has(ptr)) {
            heapTypesMap.set(ptr, typeName)
        }
    }

    for (let i = 0; i < callStack.length; i++) {
        const frame = callStack[i]
        const isTopFrame = (i === callStack.length - 1)
        const frameBase = frame.sp

        for (const varInfo of dwarfInfo.variables) {
            if (varInfo.name.startsWith('__') || varInfo.name.startsWith('.')) continue
            if (varInfo.funcName !== frame.func) continue
            if (isTopFrame && varInfo.declLine > 0 && varInfo.declLine >= frame.line) continue

            try {
                if (varInfo.stackOffset === undefined) continue
                let address = frameBase + varInfo.stackOffset

                if (varInfo.isDeref) {
                    if (address > 0 && address + 4 <= view.byteLength) {
                        address = view.getUint32(address, true)
                    } else {
                        continue
                    }
                }

                const mv = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, varInfo.name, varInfo.type, varInfo.size, address, varInfo.isPointer, varInfo.pointeeType)
                if (mv) frames[i].variables.push(mv)
            } catch { }
        }
    }

    let discovered = true;
    const typedAllocations = new Map<number, HeapAllocation>();

    while (discovered) {
        discovered = false;
        for (const { ptr, size } of rawAllocations) {
            if (typedAllocations.has(ptr)) continue;

            const inferredType = heapTypesMap.get(ptr);
            const ast = inferredType ? parseCppType(inferredType) : null;

            // Handle bounded array types via AST arrayDims
            if (ast && ast.arrayDims.length > 0) {
                discovered = true;
                const count = ast.arrayDims[0];
                const elAst = { ...ast, arrayDims: ast.arrayDims.slice(1) };
                const elType = stringifyCppType(elAst);
                const elSize = getResolvedTypeSize(dwarfInfo, elType) || 4;

                const ha: HeapAllocation = { ptr, size, typeName: inferredType!, label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [] };

                let renderCount = count;
                if (renderCount === 0) renderCount = Math.floor(size / elSize);

                const maxCount = Math.min(renderCount || 0, 50);

                for (let k = 0; k < maxCount; k++) {
                    const mAddr = ptr + k * elSize;
                    if (mAddr + elSize <= ptr + size && mAddr + elSize <= view.byteLength) {
                        const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, `[${k}]`, elType, elSize, mAddr, elAst.pointerCount > 0);
                        if (mVal) ha.members.push(mVal);
                    }
                }
                if (renderCount > maxCount) ha.members.push({ name: '...', type: '', address: 0, value: `(+${renderCount - maxCount} more)`, rawValue: 0, size: 0, isPointer: false });

                typedAllocations.set(ptr, ha);
                continue;
            }

            // Handle unbounded array types (type ending with [])
            if (inferredType && inferredType.endsWith('[]')) {
                discovered = true;
                const elType = inferredType.slice(0, -2);
                const elSize = getResolvedTypeSize(dwarfInfo, elType) || 4;

                const ha: HeapAllocation = { ptr, size, typeName: inferredType, label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [] };
                const count = Math.min(Math.floor(size / elSize), 50);

                for (let k = 0; k < count; k++) {
                    const mAddr = ptr + k * elSize;
                    if (mAddr + elSize <= ptr + size && mAddr + elSize <= view.byteLength) {
                        const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, `[${k}]`, elType, elSize, mAddr, elType.endsWith('*'));
                        if (mVal) ha.members.push(mVal);
                    }
                }

                typedAllocations.set(ptr, ha);
                continue;
            }

            const structDef = inferredType ? getStructDef(dwarfInfo.types, inferredType) : undefined;
            if (structDef) {
                discovered = true;
                const ha: HeapAllocation = { ptr, size, typeName: structDef.name, label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [] };

                for (const member of structDef.members) {
                    if (['version', '_version', 'removeFlag', '_removeFlags'].includes(member.name)) continue;
                    const mAddr = ptr + member.offset;
                    if (mAddr + member.size <= ptr + size && mAddr + member.size <= view.byteLength) {
                        const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, member.name, member.type, member.size, mAddr, member.isPointer, member.pointeeType);
                        if (mVal) ha.members.push(mVal);
                    }
                }

                typedAllocations.set(ptr, ha);
            }
        }
    }

    for (const { ptr, size } of rawAllocations) {
        if (!typedAllocations.has(ptr)) {
            const ha: HeapAllocation = { ptr, size, typeName: `${size} bytes`, label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [] };

            const words = Math.min(Math.floor(size / 4), 8);
            for (let k = 0; k < words; k++) {
                const mAddr = ptr + k * 4;
                if (mAddr + 4 <= memoryBuffer.byteLength) {
                    const val = view.getInt32(mAddr, true);
                    ha.members.push({ name: `+${k * 4}`, type: 'i32', address: mAddr, value: val, rawValue: val, size: 4, isPointer: false });
                }
            }
            typedAllocations.set(ptr, ha);
        }

        const heapType = heapTypesMap.get(ptr) || ''
        
        // Hide internal C++ and Stanford library structures (e.g., std::__tree_node, std::vector::data)
        // so they don't clutter the user's heap visualization.
        // Note: We use a regex instead of `.includes('Node')` to prevent hiding user-defined struct Nodes.
        const isInternalLibStruct = heapType.endsWith('::data') || 
                                    heapType.endsWith('::node') || 
                                    heapType.includes('tree::node') || 
                                    heapType.match(/__\w*node/i);

        if (!isInternalLibStruct) {
            heapAllocations.push(typedAllocations.get(ptr)!);
        }
    }

    const nextKnownTypes: Record<number, string> = {}
    for (const [ptr, typeName] of heapTypesMap.entries()) nextKnownTypes[ptr] = typeName
    return { snapshot: { frames, heapAllocations }, nextKnownTypes }
}

function readVariable(
    view: DataView, bytes: Uint8Array, dwarfInfo: DwarfInfo, heapTypesMap: Map<number, string>, activePtrs: Set<number>,
    name: string, typeName: string, size: number, address: number, isPointer: boolean, pointeeType?: string, depth = 0
): MemoryValue | null {
    if (address <= 0 || address + size > view.byteLength || depth > 10) return null;

    const ast = parseCppType(typeName);
    const cleanType = stringifyCppType(ast);

    for (const printer of PRETTY_PRINTERS) {
        if (printer.match(cleanType, ast)) {
            try {
                const formatted = printer.format({
                    view, bytes, address, name, typeName: cleanType, ast, size, depth,
                    getTypeSize: (t) => getResolvedTypeSize(dwarfInfo, t),
                    getStructMembers: (t) => getStructDef(dwarfInfo.types, t)?.members,
                    tagHeap: (ptr, type) => { if (activePtrs.has(ptr)) heapTypesMap.set(ptr, type) },
                    readVar: (n, t, s, a, d) => readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, n, t, s, a, false, undefined, d),
                });
                if (formatted) return formatted;
            } catch { /* Fallthrough on formatter failure */ }
        }
    }

    let value: string | number = '???'; let rawValue = 0;
    let pointsTo: number | undefined; let isStruct = false; let members: MemoryValue[] | undefined;

    try {
        if (ast.isReference || ast.isRValueReference) {
            let ptrVal = 0;
            try { ptrVal = view.getUint32(address, true); } catch { return null; }
            if (ptrVal > 0) {
                const baseAst = { ...ast, isReference: false, isRValueReference: false };
                const baseType = stringifyCppType(baseAst);
                const baseSize = getResolvedTypeSize(dwarfInfo, baseType) || 4;
                const resolved = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, name, baseType, baseSize, ptrVal, baseAst.pointerCount > 0, undefined, depth + 1);
                if (resolved) { resolved.type = cleanType; return resolved; }
            } else return { name, type: cleanType, address, value: 'nullptr (invalid ref)', rawValue: 0, size: 4, isPointer: true, pointsTo: 0, isStruct: false };
        }

        // 1. Pointers
        if (isPointer || ast.pointerCount > 0) {
            pointsTo = view.getUint32(address, true); rawValue = pointsTo;
            let actualPointee = 'unknown';
            if (pointeeType) {
                actualPointee = canonicalizeTypeName(pointeeType);
            } else if (ast.pointerCount > 0) {
                const pointeeAst = { ...ast, pointerCount: ast.pointerCount - 1 };
                actualPointee = stringifyCppType(pointeeAst);
            }

            if (pointsTo > 0 && actualPointee !== 'unknown' && actualPointee !== 'void' && actualPointee !== 'char') {
                if (activePtrs.has(pointsTo)) heapTypesMap.set(pointsTo, actualPointee);
            }
            value = pointsTo === 0 ? 'nullptr' : `0x${pointsTo.toString(16).padStart(6, '0')}`;
            if (pointsTo > 0 && (actualPointee === 'char' || actualPointee === 'const char')) {
                let end = pointsTo;
                while (end < bytes.length && bytes[end] !== 0 && end - pointsTo < 50) end++;
                value = `"${new TextDecoder().decode(bytes.subarray(pointsTo, end))}"`
            }
        }
        // 2. Arrays
        else if (ast.arrayDims.length > 0) {
            const count = ast.arrayDims[0];
            const elementAst = { ...ast, arrayDims: ast.arrayDims.slice(1) };
            const elementType = stringifyCppType(elementAst);
            isStruct = true; value = `[${count || 0}]`; members = [];
            const elementSize = getResolvedTypeSize(dwarfInfo, elementType) || (count > 0 ? Math.floor(size / count) : 0);
            if (elementSize > 0) {
                const renderCount = Math.min(count || Math.floor(size / elementSize), 50);
                for (let k = 0; k < renderCount; k++) {
                    const mAddr = address + k * elementSize;
                    if (mAddr + elementSize <= view.byteLength) {
                        const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, `[${k}]`, elementType, elementSize, mAddr, elementAst.pointerCount > 0, undefined, depth + 1);
                        if (mVal) members.push(mVal);
                    }
                }
                if ((count || Math.floor(size / elementSize)) > 50) members.push({ name: '...', type: '', address: 0, value: `(+${(count || Math.floor(size / elementSize)) - 50} more)`, rawValue: 0, size: 0, isPointer: false });
            }
        }
        // 3. Struct Expansion
        else if (getStructDef(dwarfInfo.types, cleanType)) {
            isStruct = true; value = `{...}`; members = [];
            const structDef = getStructDef(dwarfInfo.types, cleanType)!;

            for (const member of structDef.members) {
                // Ignore these internally so they don't clog up the UI
                if (['version', '_version', 'removeFlag', '_removeFlags'].includes(member.name)) continue;

                const mAddr = address + member.offset;
                if (mAddr + member.size <= view.byteLength) {
                    const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, member.name, member.type, member.size, mAddr, member.isPointer, member.pointeeType, depth + 1);
                    if (mVal) members.push(mVal);
                }
            }
        }
        // 4. Primitives & Opaque Fallback
        else {
            const baseTypeNoNs = getBaseTypeNoNamespaces(ast);
            if (size === 1) { rawValue = view.getInt8(address); value = baseTypeNoNs === 'char' ? `'${String.fromCharCode(rawValue)}'` : rawValue; }
            else if (size === 2) { rawValue = view.getInt16(address, true); value = rawValue; }
            else if (size === 4) { if (baseTypeNoNs === 'float') { rawValue = view.getFloat32(address, true); value = Number(rawValue.toFixed(4)); } else { rawValue = view.getInt32(address, true); value = rawValue; } }
            else if (size === 8) { if (baseTypeNoNs === 'double') { rawValue = view.getFloat64(address, true); value = Number(rawValue.toFixed(4)); } else { rawValue = Number(view.getBigInt64(address, true)); value = rawValue; } }
            else { value = `[${size} bytes]`; } // Graceful fallback instead of throwing ???
        }
    } catch { }

    return { name, type: cleanType, address, value, rawValue, size, isPointer: !!pointsTo, pointsTo, pointeeType, isStruct, members };
}
