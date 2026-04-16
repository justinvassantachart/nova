//   Memory Reader  //
// Reads WASM linear memory while the executor worker is paused to extract
// stack variable values and heap allocation contents. Uses DWARF info
// for type-aware reading with scope and time-travel filtering.

import type { DwarfInfo, StructInfo } from '@/engine/dwarf-types'
import { PRETTY_PRINTERS } from './formatters'

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

function getStructDef(types: Record<string, StructInfo>, typeName: string) {
    if (!typeName) return undefined;
    if (types[typeName]) return types[typeName];
    
    let clean = typeName.replace(/^(struct|class)\s+/, '').trim();
    if (types[clean]) return types[clean];

    const spaceless = clean.replace(/\s+/g, '');

    // Try matching after beautifying both sides (handles __2:: vs std:: mismatches)
    const beautified = beautifyTypeName(clean).replace(/\s+/g, '');
    for (const [key, def] of Object.entries(types)) {
        if (beautifyTypeName(key).replace(/\s+/g, '') === beautified) return def;
    }

    const stripNs = (name: string) => {
        const bracketIdx = name.indexOf('<');
        if (bracketIdx === -1) {
            const parts = name.split('::');
            return parts[parts.length - 1];
        }
        const prefix = name.substring(0, bracketIdx);
        const parts = prefix.split('::');
        return parts[parts.length - 1] + name.substring(bracketIdx);
    };

    const requestedNoNs = stripNs(spaceless); // e.g. "Set<int>"

    // 1. Try exact matches ignoring namespaces
    for (const [key, def] of Object.entries(types)) {
        const keyClean = key.replace(/^(struct|class)\s+/, '').replace(/\s+/g, '');
        if (keyClean === spaceless) return def;
        
        const keyNoNs = stripNs(keyClean);
        if (keyNoNs === requestedNoNs) return def;
    }

    // 2. Try prefix matches (handles trailing default args: Set<int, less<int>>)
    if (requestedNoNs.includes('<')) {
        const prefix = requestedNoNs.substring(0, requestedNoNs.length - 1) + ',';
        for (const [key, def] of Object.entries(types)) {
            const keyNoNs = stripNs(key.replace(/^(struct|class)\s+/, '').replace(/\s+/g, ''));
            if (keyNoNs.startsWith(prefix)) return def;
        }
    }

    // 3. NUCLEAR MATCH: Match Base Name + First Template Argument
    const reqBaseMatch = requestedNoNs.match(/^([^<]+)<([^,>]+)/); // ["Set<int", "Set", "int"]
    if (reqBaseMatch) {
        const reqBase = reqBaseMatch[1];
        const reqFirstArg = reqBaseMatch[2];
        for (const [key, def] of Object.entries(types)) {
            const keyNoNs = stripNs(key.replace(/^(struct|class)\s+/, '').replace(/\s+/g, ''));
            const keyBaseMatch = keyNoNs.match(/^([^<]+)<([^,>]+)/);
            if (keyBaseMatch && keyBaseMatch[1] === reqBase && keyBaseMatch[2] === reqFirstArg) {
                return def;
            }
        }
    }

    return undefined;
}

function beautifyTypeName(typeName: string): string {
    return typeName
        .replace(/(const|volatile|restrict)\s+/g, '')
        .replace(/\s+(const|volatile|restrict)/g, '')
        .replace(/std::(?:__1|__2)::/g, 'std::')
        .replace(/,\s*std::allocator<[^>]+>\s*/g, '')
        .trim();
}

export function getResolvedTypeSize(dwarfInfo: DwarfInfo, typeName: string): number {
    const cleanType = beautifyTypeName(typeName);
    if (cleanType.endsWith('*') || cleanType.endsWith('&')) return 4; 

    const arrayMatch = cleanType.match(/^(.*?)((?:\[\d+\])+)$/);
    if (arrayMatch) {
        const baseType = arrayMatch[1].trim();
        const dimsStr = arrayMatch[2];
        const baseSize = getResolvedTypeSize(dwarfInfo, baseType) || 4;
        let totalElements = 1;
        for (const match of dimsStr.matchAll(/\[(\d+)\]/g)) {
            totalElements *= parseInt(match[1], 10);
        }
        return baseSize * totalElements;
    }

    if (['char', 'bool', 'int8_t', 'uint8_t'].includes(cleanType)) return 1;
    if (['short', 'int16_t', 'uint16_t'].includes(cleanType)) return 2;
    if (['int', 'long', 'float', 'int32_t', 'uint32_t'].includes(cleanType)) return 4;
    if (['long long', 'double', 'int64_t', 'uint64_t'].includes(cleanType)) return 8;

    if (cleanType === 'std::string' || cleanType === 'string') return 12;
    if (cleanType.startsWith('std::vector') || cleanType.startsWith('vector<')) return 12;

    const def = getStructDef(dwarfInfo.types, cleanType);
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
            const boundedArrayMatch = inferredType ? inferredType.match(/^(.*?)((?:\[\d+\])+)$/) : null;

            if (boundedArrayMatch) {
                discovered = true;
                const baseType = boundedArrayMatch[1].trim();
                const dims = boundedArrayMatch[2];
                const firstDimMatch = dims.match(/^\[(\d+)\](.*)$/)!;
                const count = parseInt(firstDimMatch[1], 10);
                const elType = baseType + firstDimMatch[2];
                const elSize = getResolvedTypeSize(dwarfInfo, elType) || 4;

                const ha: HeapAllocation = { ptr, size, typeName: inferredType!, label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [] };
                const maxCount = Math.min(count, 50);
                
                for (let k = 0; k < maxCount; k++) {
                    const mAddr = ptr + k * elSize;
                    if (mAddr + elSize <= ptr + size && mAddr + elSize <= view.byteLength) {
                        const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, `[${k}]`, elType, elSize, mAddr, elType.endsWith('*'));
                        if (mVal) ha.members.push(mVal);
                    }
                }
                if (count > maxCount) ha.members.push({ name: '...', type: '', address: 0, value: `(+${count - maxCount} more)`, rawValue: 0, size: 0, isPointer: false });

                typedAllocations.set(ptr, ha);
                continue;
            }

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
        if (!heapType.endsWith('::data') && !heapType.endsWith('::node') && !heapType.includes('tree::node') && !heapType.includes('Node')) {
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

    const cleanType = beautifyTypeName(typeName);

    for (const printer of PRETTY_PRINTERS) {
        if (printer.match(cleanType)) {
            try {
                const formatted = printer.format({
                    view, bytes, address, name, typeName: cleanType, size, depth,
                    getTypeSize: (t) => getResolvedTypeSize(dwarfInfo, t),
                    getStructMembers: (t) => getStructDef(dwarfInfo.types, beautifyTypeName(t))?.members,
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
        if (cleanType.endsWith('&')) {
            let ptrVal = 0;
            try { ptrVal = view.getUint32(address, true); } catch { return null; }
            if (ptrVal > 0) {
                const baseType = cleanType.replace(/&+$/, '').trim();
                const baseSize = getResolvedTypeSize(dwarfInfo, baseType) || 4;
                const resolved = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, name, baseType, baseSize, ptrVal, baseType.endsWith('*'), undefined, depth + 1);
                if (resolved) { resolved.type = cleanType; return resolved; }
            } else return { name, type: cleanType, address, value: 'nullptr (invalid ref)', rawValue: 0, size: 4, isPointer: true, pointsTo: 0, isStruct: false };
        }

        const arrayMatch = cleanType.match(/^(.*?)((?:\[\d+\])+)$/);

        // 1. Pointers
        if (isPointer || cleanType.endsWith('*')) {
            pointsTo = view.getUint32(address, true); rawValue = pointsTo;
            const actualPointee = pointeeType ? beautifyTypeName(pointeeType) : (cleanType.endsWith('*') ? cleanType.slice(0, -1).trim() : 'unknown');

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
        else if (arrayMatch && !cleanType.endsWith('&')) {
            const baseType = arrayMatch[1].trim(); const dimsStr = arrayMatch[2];
            const firstDimMatch = dimsStr.match(/^\[(\d+)\](.*)$/);
            if (firstDimMatch) {
                const count = parseInt(firstDimMatch[1], 10);
                const elementType = baseType + firstDimMatch[2];
                isStruct = true; value = `[${count}]`; members = [];
                const elementSize = getResolvedTypeSize(dwarfInfo, elementType) || (count > 0 ? Math.floor(size / count) : 0);
                if (elementSize > 0) {
                    const renderCount = Math.min(count, 50);
                    for (let k = 0; k < renderCount; k++) {
                        const mAddr = address + k * elementSize;
                        if (mAddr + elementSize <= view.byteLength) {
                            const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, `[${k}]`, elementType, elementSize, mAddr, elementType.endsWith('*'), undefined, depth + 1);
                            if (mVal) members.push(mVal);
                        }
                    }
                    if (count > 50) members.push({ name: '...', type: '', address: 0, value: `(+${count - 50} more)`, rawValue: 0, size: 0, isPointer: false });
                }
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
            if (size === 1) { rawValue = view.getInt8(address); value = cleanType === 'char' ? `'${String.fromCharCode(rawValue)}'` : rawValue; }
            else if (size === 2) { rawValue = view.getInt16(address, true); value = rawValue; }
            else if (size === 4) { if (cleanType === 'float') { rawValue = view.getFloat32(address, true); value = Number(rawValue.toFixed(4)); } else { rawValue = view.getInt32(address, true); value = rawValue; } }
            else if (size === 8) { if (cleanType === 'double') { rawValue = view.getFloat64(address, true); value = Number(rawValue.toFixed(4)); } else { rawValue = Number(view.getBigInt64(address, true)); value = rawValue; } }
            else { value = `[${size} bytes]`; } // Graceful fallback instead of throwing ???
        }
    } catch { }

    return { name, type: cleanType, address, value, rawValue, size, isPointer: !!pointsTo, pointsTo, pointeeType, isStruct, members };
}
