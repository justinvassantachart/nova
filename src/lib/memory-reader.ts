// ── Memory Reader ──────────────────────────────────────────────────
// Reads WASM linear memory while the executor worker is paused to extract
// stack variable values and heap allocation contents. Uses DWARF info
// for type-aware reading with scope and time-travel filtering.
//
// Multi-frame: processes every frame in the call stack independently.
// Heap: reads the native C++ __nova_allocs array directly from RAM
// (synchronous — no async postMessage race conditions).

import type { DwarfInfo, VariableInfo } from '@/engine/dwarf-types'

/** A readable value extracted from WASM memory */
export interface MemoryValue {
    name: string
    type: string
    address: number
    value: string | number
    rawValue: number
    size: number
    isPointer: boolean
    pointsTo?: number
    pointeeType?: string
}

/** A heap allocation from the native C++ tracking array */
export interface HeapAllocation {
    ptr: number
    size: number
    label: string
    members: MemoryValue[]
}

/** A single call frame with its own variables */
export interface CallFrameSnapshot {
    id: string
    funcName: string
    sp: number
    line: number
    variables: MemoryValue[]
    isActive: boolean
}

/** Full memory snapshot */
export interface MemorySnapshot {
    frames: CallFrameSnapshot[]
    heapAllocations: HeapAllocation[]
}

/**
 * Read memory values from a WASM memory buffer using DWARF variable info.
 * Called when the executor worker is frozen (Atomics.wait) so memory is stable.
 *
 * Multi-frame: processes every frame in the call stack independently.
 * Heap: reads __nova_allocs directly from RAM via heapPointers.
 */
export function readMemorySnapshot(
    memoryBuffer: ArrayBuffer | null,
    dwarfInfo: DwarfInfo,
    callStack: { id: string; func: string; sp: number; line: number }[],
    heapPointers: { countPtr: number; allocsPtr: number },
): MemorySnapshot {
    const frames: CallFrameSnapshot[] = callStack.map(f => ({
        id: f.id, funcName: f.func, sp: f.sp, line: f.line, variables: [], isActive: false,
    }))
    if (frames.length > 0) frames[frames.length - 1].isActive = true

    const heapAllocations: HeapAllocation[] = []
    if (!memoryBuffer || memoryBuffer.byteLength === 0) return { frames, heapAllocations }

    const view = new DataView(memoryBuffer)
    const bytes = new Uint8Array(memoryBuffer)

    // Process EVERY active function in the recursion stack independently
    for (let i = 0; i < callStack.length; i++) {
        const frame = callStack[i]
        const isTopFrame = (i === callStack.length - 1)

        for (const varInfo of dwarfInfo.variables) {
            if (varInfo.name.startsWith('__') || varInfo.name.startsWith('.')) continue
            if (varInfo.funcName !== frame.func) continue
            if (isTopFrame && varInfo.declLine > 0 && varInfo.declLine >= frame.line) continue

            try {
                const mv = readVariable(view, bytes, varInfo.name, varInfo, frame.sp)
                if (mv) frames[i].variables.push(mv)
            } catch { /* Variable address out of bounds — skip */ }
        }
    }

    // ── Synchronous Native Heap Read ───────────────────────────────
    // Read the C++ __nova_allocs array directly from RAM. No async postMessage!
    if (heapPointers.countPtr > 0 && heapPointers.allocsPtr > 0) {
        try {
            const count = view.getInt32(heapPointers.countPtr, true)

            for (let j = 0; j < count && j < 1024; j++) {
                const allocPtr = view.getUint32(heapPointers.allocsPtr + j * 8, true)
                const allocSize = view.getUint32(heapPointers.allocsPtr + j * 8 + 4, true)

                const ha: HeapAllocation = {
                    ptr: allocPtr,
                    size: allocSize,
                    label: `0x${allocPtr.toString(16).padStart(8, '0')} (${allocSize}B)`,
                    members: [],
                }

                const wordsToRead = Math.min(Math.floor(allocSize / 4), 8)
                for (let k = 0; k < wordsToRead; k++) {
                    const addr = allocPtr + k * 4
                    if (addr + 4 <= memoryBuffer.byteLength) {
                        const val = view.getInt32(addr, true)
                        ha.members.push({
                            name: `0x${addr.toString(16).padStart(8, '0')}`,
                            type: 'i32', address: addr, value: val, rawValue: val,
                            size: 4, isPointer: false,
                        })
                    }
                }
                heapAllocations.push(ha)
            }
        } catch { /* Out of bounds */ }
    }

    return { frames, heapAllocations }
}

/** Read a single variable value from WASM memory */
function readVariable(
    view: DataView,
    _bytes: Uint8Array,
    name: string,
    varInfo: VariableInfo,
    frameSp: number,
): MemoryValue | null {
    if (varInfo.stackOffset === undefined) return null
    const address = frameSp + varInfo.stackOffset

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
