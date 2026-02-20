// ── Memory Reader ──────────────────────────────────────────────────
// Reads WASM linear memory while the executor worker is paused to extract
// stack variable values and heap allocation contents. Uses DWARF info
// for type-aware reading.

import type { DwarfInfo, VariableInfo } from '@/engine/dwarf-types'

/** A readable value extracted from WASM memory */
export interface MemoryValue {
    name: string
    type: string
    address: number
    value: string | number
    size: number
    isPointer: boolean
    pointsTo?: number      // address this pointer points to
    pointeeType?: string
}

/** A heap allocation from wrapping malloc */
export interface HeapAllocation {
    ptr: number
    size: number
    label: string          // e.g. "malloc(24)"
    members: MemoryValue[] // parsed struct members
}

/** Full memory snapshot */
export interface MemorySnapshot {
    stackVariables: MemoryValue[]
    heapAllocations: HeapAllocation[]
}

/**
 * Read memory values from a WASM memory buffer using DWARF variable info.
 * This should be called when the executor worker is frozen (Atomics.wait)
 * so the memory is stable.
 */
export function readMemorySnapshot(
    memoryBuffer: ArrayBuffer | null,
    dwarfInfo: DwarfInfo,
    allocations: { ptr: number; size: number }[],
): MemorySnapshot {
    const stackVariables: MemoryValue[] = []
    const heapAllocations: HeapAllocation[] = []

    if (!memoryBuffer || memoryBuffer.byteLength === 0) {
        return { stackVariables, heapAllocations }
    }

    const view = new DataView(memoryBuffer)
    const bytes = new Uint8Array(memoryBuffer)

    // Read stack variables using DWARF variable info
    for (const [name, varInfo] of Object.entries(dwarfInfo.variables)) {
        // Skip internal/compiler-generated variables
        if (name.startsWith('__') || name.startsWith('.')) continue

        try {
            const mv = readVariable(view, bytes, name, varInfo)
            if (mv) stackVariables.push(mv)
        } catch {
            // Variable address out of bounds
        }
    }

    // Read heap allocations
    for (const alloc of allocations) {
        const ha: HeapAllocation = {
            ptr: alloc.ptr,
            size: alloc.size,
            label: `malloc(${alloc.size})`,
            members: [],
        }

        // Try to read the first few words of the allocation
        try {
            const wordsToRead = Math.min(Math.floor(alloc.size / 4), 8)
            for (let i = 0; i < wordsToRead; i++) {
                const addr = alloc.ptr + i * 4
                if (addr + 4 <= memoryBuffer.byteLength) {
                    const val = view.getInt32(addr, true)
                    ha.members.push({
                        name: `[${i}]`,
                        type: 'i32',
                        address: addr,
                        value: val,
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
): MemoryValue | null {
    // The stackOffset from DWARF is relative to the frame base.
    // For a simplified view, we use it as an absolute address indicator.
    const address = Math.abs(varInfo.stackOffset)

    // Ensure address is within memory bounds
    if (address + varInfo.size > view.byteLength || address === 0) {
        return null
    }

    let value: string | number
    let pointsTo: number | undefined

    if (varInfo.isPointer) {
        // Read 4-byte pointer (WASM32)
        pointsTo = view.getUint32(address, true)
        value = `0x${pointsTo.toString(16).padStart(8, '0')}`
    } else {
        switch (varInfo.size) {
            case 1: value = view.getInt8(address); break
            case 2: value = view.getInt16(address, true); break
            case 4:
                if (varInfo.type === 'float') value = view.getFloat32(address, true)
                else value = view.getInt32(address, true)
                break
            case 8:
                if (varInfo.type === 'double') value = view.getFloat64(address, true)
                else value = Number(view.getBigInt64(address, true))
                break
            default:
                value = view.getInt32(address, true)
        }
    }

    return {
        name,
        type: varInfo.type,
        address,
        value,
        size: varInfo.size,
        isPointer: varInfo.isPointer,
        pointsTo,
        pointeeType: varInfo.pointeeType,
    }
}
