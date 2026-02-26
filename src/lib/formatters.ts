// ── Pretty Printer Registry ────────────────────────────────────────
// Extensible type formatters for std library types in WASM memory.
// Add new formatters here without touching the core memory reader.

import type { MemoryValue } from './memory-reader'

export interface FormatterContext {
    view: DataView
    bytes: Uint8Array
    address: number
    name: string
    typeName: string
    size: number
    depth: number
    getTypeSize: (type: string) => number
    tagHeap: (ptr: number, type: string) => void
    readVar: (name: string, type: string, size: number, address: number, depth: number) => MemoryValue | null
}

export interface TypeFormatter {
    match: (typeName: string) => boolean
    format: (ctx: FormatterContext) => MemoryValue | null
}

export const StdStringFormatter: TypeFormatter = {
    // Matches all possible DWARF names for std::string
    match: (type) => {
        const t = type.replace(/\s+/g, '')
        return t === 'std::string' || t === 'string' || t.includes('basic_string')
    },
    format: (ctx) => {
        const { view, bytes, address, name, size, tagHeap } = ctx
        let value = '"<invalid>"'
        let isPointer = false
        let pointsTo: number | undefined = undefined

        // WASI libc++ Alternate String Layout (wasm32 little-endian):
        // 12 bytes total. The is_long flag is the MSB of the LAST byte (offset 11).
        // Short string: MSB of byte[11] is 0. Size = byte[11] & 0x7F. Data at bytes[0..10].
        // Long string:  MSB of byte[11] is 1. Cap at +0, Size at +4, Data pointer at +8.
        if (size >= 12 && address + 11 < view.byteLength) {
            const lastByte = bytes[address + 11]
            const isLong = (lastByte & 0x80) !== 0

            if (!isLong) {
                // Short mode: size is in the last byte (stripped of flag)
                const strSize = lastByte & 0x7F
                if (strSize <= 11 && address + strSize <= view.byteLength) {
                    value = `"${new TextDecoder().decode(bytes.subarray(address, address + strSize))}"`
                }
            } else {
                // Long mode: Capacity at +0, Size at +4, Data Pointer at +8
                const strSize = view.getUint32(address + 4, true)
                const ptr = view.getUint32(address + 8, true)
                if (ptr > 0 && ptr + strSize <= bytes.length && strSize < 100000) {
                    value = `"${new TextDecoder().decode(bytes.subarray(ptr, ptr + strSize))}"`
                    tagHeap(ptr, 'std::string::data')
                    isPointer = true
                    pointsTo = ptr
                }
            }
        }
        return {
            name, type: 'std::string', address, value, rawValue: 0, size,
            isPointer, pointsTo, pointeeType: 'std::string::data', isStruct: false,
        }
    }
}

export const StdVectorFormatter: TypeFormatter = {
    // Matches std::vector
    match: (type) => type.replace(/\s+/g, '').includes('vector<'),
    format: (ctx) => {
        const { view, address, name, typeName, size, getTypeSize, tagHeap, readVar } = ctx

        // Extract the inner type T from std::vector<T>
        const match = typeName.match(/<([^>]+)/)
        const elementType = match ? match[1].trim() : 'unknown'
        const elementSize = getTypeSize(elementType) || 4

        if (address + 12 > view.byteLength) return null

        const begin = view.getUint32(address, true)
        const end = view.getUint32(address + 4, true)
        const cap = view.getUint32(address + 8, true)

        const length = begin === 0 || elementSize === 0 ? 0 : (end - begin) / elementSize
        const capacity = begin === 0 || elementSize === 0 ? 0 : (cap - begin) / elementSize

        // Read elements inline into the stack frame
        const members: MemoryValue[] = []
        if (begin > 0 && length > 0 && length < 1000) {
            // Tag as internal so it doesn't show up as a separate standalone heap box
            tagHeap(begin, `std::vector::data`)

            const count = Math.min(length, 50)
            for (let i = 0; i < count; i++) {
                const elAddr = begin + i * elementSize
                if (ctx.depth < 10) {
                    const elVal = readVar(`[${i}]`, elementType, elementSize, elAddr, ctx.depth + 1)
                    if (elVal) members.push(elVal)
                }
            }
            if (length > 50) {
                members.push({ name: '...', type: '', address: 0, value: `(+${length - 50} more)`, rawValue: 0, size: 0, isPointer: false })
            }
        }

        return {
            name, type: `std::vector<${elementType}>`, address,
            value: `size=${length} cap=${capacity}`, rawValue: begin, size,
            isPointer: false,
            isStruct: true,
            members,
        }
    }
}

// THE REGISTRY: Add future types (maps, unique_ptr) here!
export const PRETTY_PRINTERS = [StdStringFormatter, StdVectorFormatter]
