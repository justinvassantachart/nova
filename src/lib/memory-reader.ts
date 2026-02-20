// ── Memory Reader ──────────────────────────────────────────────────
// Reads WASM linear memory while the executor worker is paused to extract
// stack variable values and heap allocation contents. Uses DWARF info
// for type-aware reading with scope and time-travel filtering.
//
// Features:
// - Multi-frame call stack processing
// - Topological heap type inference (linked list traversal)
// - Extensible Pretty Printer dispatch for std::string, std::vector
// - Array inference via tagHeap (used by std::vector formatter)
// - Struct expansion with recursive member reading

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
    if (types[typeName]) return types[typeName];
    if (typeName.startsWith('struct ')) return types[typeName.replace('struct ', '')];
    if (typeName.startsWith('class ')) return types[typeName.replace('class ', '')];
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
    if (cleanType.endsWith('*')) return 4;
    if (['char', 'bool', 'int8_t', 'uint8_t'].includes(cleanType)) return 1;
    if (['short', 'int16_t', 'uint16_t'].includes(cleanType)) return 2;
    if (['int', 'long', 'float', 'int32_t', 'uint32_t'].includes(cleanType)) return 4;
    if (['long long', 'double', 'int64_t', 'uint64_t'].includes(cleanType)) return 8;

    // WebAssembly libc++ specific footprint sizes
    if (cleanType === 'std::string' || cleanType === 'string') return 12;
    if (cleanType.startsWith('std::vector') || cleanType.startsWith('vector<')) return 12;

    const def = getStructDef(dwarfInfo.types, cleanType);
    return def ? def.size : 4;
}

export function readMemorySnapshot(
    memoryBuffer: ArrayBuffer | null, dwarfInfo: DwarfInfo,
    callStack: { id: string; func: string; sp: number; line: number; frameSize: number }[],
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

    // 1. Read raw heap allocations FIRST so we know which pointers are still alive
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

    // 2. Seed the type map from the persistent cache, pruning freed addresses
    const heapTypesMap = new Map<number, string>()
    for (const [ptrStr, typeName] of Object.entries(knownHeapTypes)) {
        const ptr = Number(ptrStr)
        if (activePtrs.has(ptr)) {
            heapTypesMap.set(ptr, typeName)
        }
    }

    // 3. Evaluate variables — this may discover new heap types via pointer analysis
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
                const address = frameBase + varInfo.stackOffset
                const mv = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, varInfo.name, varInfo.type, varInfo.size, address, varInfo.isPointer, varInfo.pointeeType)
                if (mv) frames[i].variables.push(mv)
            } catch { }
        }
    }



    // 4. Iterative Type Mapping (Crucial for Linked Lists & Arrays!)
    let discovered = true;
    const typedAllocations = new Map<number, HeapAllocation>();

    while (discovered) {
        discovered = false;
        for (const { ptr, size } of rawAllocations) {
            if (typedAllocations.has(ptr)) continue;

            const inferredType = heapTypesMap.get(ptr);

            // Array Inference (used dynamically by std::vector formatter)
            if (inferredType && inferredType.endsWith('[]')) {
                discovered = true;
                const elType = inferredType.slice(0, -2);
                const elSize = getResolvedTypeSize(dwarfInfo, elType) || 4;
                const ha: HeapAllocation = {
                    ptr, size, typeName: inferredType,
                    label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [],
                };

                const count = Math.min(Math.floor(size / elSize), 50); // limit to 50 items
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

            // Native Structs & Linked Lists
            const structDef = inferredType ? getStructDef(dwarfInfo.types, inferredType) : undefined;
            if (structDef) {
                discovered = true;
                const ha: HeapAllocation = {
                    ptr, size, typeName: structDef.name,
                    label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [],
                };

                for (const member of structDef.members) {
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

    // 5. Fill unmapped heap blocks with raw memory data & push to output
    for (const { ptr, size } of rawAllocations) {
        if (!typedAllocations.has(ptr)) {
            const ha: HeapAllocation = {
                ptr, size, typeName: `${size} bytes`,
                label: `0x${ptr.toString(16).padStart(6, '0')}`, members: [],
            };
            const words = Math.min(Math.floor(size / 4), 8);
            for (let k = 0; k < words; k++) {
                const mAddr = ptr + k * 4;
                if (mAddr + 4 <= memoryBuffer.byteLength) {
                    const val = view.getInt32(mAddr, true);
                    ha.members.push({
                        name: `+${k * 4}`, type: 'i32', address: mAddr,
                        value: val, rawValue: val, size: 4, isPointer: false,
                    });
                }
            }
            typedAllocations.set(ptr, ha);
        }

        // Don't render raw string character arrays as heap boxes
        if (heapTypesMap.get(ptr) !== 'std::string::data') {
            heapAllocations.push(typedAllocations.get(ptr)!);
        }
    }

    // 6. Serialize the type map back for persistent storage
    const nextKnownTypes: Record<number, string> = {}
    for (const [ptr, typeName] of heapTypesMap.entries()) {
        nextKnownTypes[ptr] = typeName
    }

    return { snapshot: { frames, heapAllocations }, nextKnownTypes }
}

function readVariable(
    view: DataView, bytes: Uint8Array, dwarfInfo: DwarfInfo, heapTypesMap: Map<number, string>, activePtrs: Set<number>,
    name: string, typeName: string, size: number, address: number, isPointer: boolean, pointeeType?: string, depth = 0
): MemoryValue | null {
    if (address <= 0 || address + size > view.byteLength || depth > 10) return null;
    const cleanType = beautifyTypeName(typeName);

    // 1. Run Extensible Pretty Printers First
    for (const printer of PRETTY_PRINTERS) {
        if (printer.match(cleanType)) {
            const formatted = printer.format({
                view, bytes, address, name, typeName: cleanType, size, depth,
                getTypeSize: (t) => getResolvedTypeSize(dwarfInfo, t),
                tagHeap: (ptr, type) => { if (activePtrs.has(ptr)) heapTypesMap.set(ptr, type) },
                readVar: (n, t, s, a, d) => readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, n, t, s, a, false, undefined, d),
            });
            if (formatted) return formatted;
        }
    }

    let value: string | number = '???'; let rawValue = 0;
    let pointsTo: number | undefined; let isStruct = false; let members: MemoryValue[] | undefined;

    try {
        if (isPointer || cleanType.endsWith('*')) {
            pointsTo = view.getUint32(address, true);
            rawValue = pointsTo;
            const actualPointee = pointeeType ? beautifyTypeName(pointeeType) : (cleanType.endsWith('*') ? cleanType.slice(0, -1).trim() : 'unknown');

            // Only tag the heap for active (non-freed) pointers
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
        // 2. Struct Expansion
        else if (getStructDef(dwarfInfo.types, cleanType)) {
            isStruct = true; value = `{...}`; members = [];
            const structDef = getStructDef(dwarfInfo.types, cleanType)!;
            for (const member of structDef.members) {
                const mAddr = address + member.offset;
                if (mAddr + member.size <= view.byteLength) {
                    const mVal = readVariable(view, bytes, dwarfInfo, heapTypesMap, activePtrs, member.name, member.type, member.size, mAddr, member.isPointer, member.pointeeType, depth + 1);
                    if (mVal) members.push(mVal);
                }
            }
        }
        // 3. Primitives
        else {
            if (size === 1) { rawValue = view.getInt8(address); value = cleanType === 'char' ? `'${String.fromCharCode(rawValue)}'` : rawValue; }
            else if (size === 2) { rawValue = view.getInt16(address, true); value = rawValue; }
            else if (size === 4) { if (cleanType === 'float') { rawValue = view.getFloat32(address, true); value = Number(rawValue.toFixed(4)); } else { rawValue = view.getInt32(address, true); value = rawValue; } }
            else if (size === 8) { if (cleanType === 'double') { rawValue = view.getFloat64(address, true); value = Number(rawValue.toFixed(4)); } else { rawValue = Number(view.getBigInt64(address, true)); value = rawValue; } }
        }
    } catch { }

    return { name, type: cleanType, address, value, rawValue, size, isPointer: !!pointsTo, pointsTo, pointeeType, isStruct, members };
}
