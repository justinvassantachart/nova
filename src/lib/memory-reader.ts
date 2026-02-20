// ── Memory Reader ──────────────────────────────────────────────────
// Reads WASM linear memory while the executor worker is paused to extract
// stack variable values and heap allocation contents. Uses DWARF info
// for type-aware reading with scope and time-travel filtering.

import type { DwarfInfo, VariableInfo } from '@/engine/dwarf-types'

/** A readable value extracted from WASM memory */
export interface MemoryValue {
    name: string
    type: string
    address: number
    value: string | number
    rawValue: number          // always the numeric raw value
    size: number
    isPointer: boolean
    pointsTo?: number        // address this pointer points to
    pointeeType?: string
}

/** A heap allocation from wrapping malloc */
export interface HeapAllocation {
    ptr: number
    size: number
    label: string            // e.g. "0x00011040"
    members: MemoryValue[]   // parsed struct/array members
}

/** Full memory snapshot */
export interface MemorySnapshot {
    stackVariables: MemoryValue[]
    heapAllocations: HeapAllocation[]
}

/**
 * Read memory values from a WASM memory buffer using DWARF variable info.
 * Called when the executor worker is frozen (Atomics.wait) so memory is stable.
 *
 * Scope filter: only shows variables that belong to `currentFunc`.
 * Time-travel filter: hides variables declared ON or AFTER `currentLine`.
 */
export function readMemorySnapshot(
    memoryBuffer: ArrayBuffer | null,
    dwarfInfo: DwarfInfo,
    allocations: { ptr: number; size: number }[],
    stackPointer: number,
    currentLine: number | null,
    currentFunc: string | null,
): MemorySnapshot {
    const stackVariables: MemoryValue[] = []
    const heapAllocations: HeapAllocation[] = []

    if (!memoryBuffer || memoryBuffer.byteLength === 0) {
        return { stackVariables, heapAllocations }
    }

    const view = new DataView(memoryBuffer)
    const bytes = new Uint8Array(memoryBuffer)

    // Read stack variables using DWARF variable info (now an array!)
    for (const varInfo of dwarfInfo.variables) {
        // Skip internal/compiler-generated variables
        if (varInfo.name.startsWith('__') || varInfo.name.startsWith('.')) continue

        // SCOPE FILTER: Hide variables from other functions
        if (currentFunc && varInfo.funcName !== currentFunc) continue

        // TIME-TRAVEL FILTER: Hide variables declared ON or AFTER current line
        // This ensures variables "pop" into the UI only AFTER their declaration
        if (currentLine !== null && varInfo.declLine > 0 && varInfo.declLine >= currentLine) continue

        try {
            const mv = readVariable(view, bytes, varInfo.name, varInfo, stackPointer)
            if (mv) stackVariables.push(mv)
        } catch {
            // Variable address out of bounds — skip
        }
    }

    // Read heap allocations
    for (const alloc of allocations) {
        const ha: HeapAllocation = {
            ptr: alloc.ptr,
            size: alloc.size,
            label: `0x${alloc.ptr.toString(16).padStart(8, '0')}`,
            members: [],
        }

        // Read the allocation contents based on size
        try {
            const wordsToRead = Math.min(Math.floor(alloc.size / 4), 8)
            for (let i = 0; i < wordsToRead; i++) {
                const addr = alloc.ptr + i * 4
                if (addr + 4 <= memoryBuffer.byteLength) {
                    const val = view.getInt32(addr, true)
                    ha.members.push({
                        name: `0x${addr.toString(16).padStart(8, '0')}`,
                        type: 'i32',
                        address: addr,
                        value: val,
                        rawValue: val,
                        size: 4,
                        isPointer: false,
                    })
                }
            }
        } catch {
            // Out of bounds
        }

        heapAllocations.push(ha)
    }

    return { stackVariables, heapAllocations }
}

/** Read a single variable value from WASM memory */
function readVariable(
    view: DataView,
    _bytes: Uint8Array,
    name: string,
    varInfo: VariableInfo,
    stackPointer: number,
): MemoryValue | null {
    // DWARF stackOffset is relative to the stack pointer.
    // Absolute address = Stack Pointer + Offset
    if (varInfo.stackOffset === undefined) return null
    const address = stackPointer + varInfo.stackOffset

    // If out of bounds, still return with "???" so the UI draws the box
    if (address <= 0 || address + varInfo.size > view.byteLength) {
        return {
            name, type: varInfo.type, address,
            value: '???', rawValue: 0, size: varInfo.size, isPointer: varInfo.isPointer,
        }
    }

    let value: string | number = '???'
    let rawValue = 0
    let pointsTo: number | undefined

    try {
        if (varInfo.isPointer) {
            // Read 4-byte pointer (WASM32)
            pointsTo = view.getUint32(address, true)
            rawValue = pointsTo
            value = `0x${pointsTo.toString(16).padStart(8, '0')}`
        } else {
            switch (varInfo.size) {
                case 1: rawValue = view.getInt8(address); value = rawValue; break
                case 2: rawValue = view.getInt16(address, true); value = rawValue; break
                case 4:
                    if (varInfo.type === 'float') {
                        rawValue = view.getFloat32(address, true)
                        value = rawValue
                    } else {
                        rawValue = view.getInt32(address, true)
                        value = rawValue
                    }
                    break
                case 8:
                    if (varInfo.type === 'double') {
                        rawValue = view.getFloat64(address, true)
                        value = rawValue
                    } else {
                        rawValue = Number(view.getBigInt64(address, true))
                        value = rawValue
                    }
                    break
                default:
                    rawValue = view.getInt32(address, true)
                    value = rawValue
            }
        }
    } catch {
        value = '???'
    }

    return {
        name, type: varInfo.type, address, value, rawValue, size: varInfo.size,
        isPointer: varInfo.isPointer, pointsTo, pointeeType: varInfo.pointeeType,
    }
}
