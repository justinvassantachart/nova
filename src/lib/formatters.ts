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
        const { view, address, name, typeName, size, getTypeSize, tagHeap } = ctx

        // Extract the inner type T from std::vector<T>
        const match = typeName.match(/<([^,]+)/)
        const elementType = match ? match[1].trim() : 'unknown'
        const elementSize = getTypeSize(elementType) || 4

        if (address + 12 > view.byteLength) return null

        const begin = view.getUint32(address, true)
        const end = view.getUint32(address + 4, true)
        const cap = view.getUint32(address + 8, true)

        const length = begin === 0 || elementSize === 0 ? 0 : (end - begin) / elementSize
        const capacity = begin === 0 || elementSize === 0 ? 0 : (cap - begin) / elementSize

        // Instruct the Heap engine to format the vector's memory block as an Array
        if (begin > 0) tagHeap(begin, `${elementType}[]`)

        // Render as a true struct with _M_begin, _M_end, _M_cap for precise arrow placement
        return {
            name, type: `std::vector<${elementType}>`, address,
            value: `size=${length} cap=${capacity}`, rawValue: begin, size,
            isPointer: false,
            isStruct: true,
            members: [
                { name: '_M_begin', type: `${elementType}*`, address: address, value: begin === 0 ? 'nullptr' : `0x${begin.toString(16).padStart(6, '0')}`, rawValue: begin, size: 4, isPointer: begin > 0, pointsTo: begin > 0 ? begin : undefined, pointeeType: `${elementType}[]` },
                { name: '_M_end', type: `${elementType}*`, address: address + 4, value: end === 0 ? 'nullptr' : `0x${end.toString(16).padStart(6, '0')}`, rawValue: end, size: 4, isPointer: false },
                { name: '_M_cap', type: `${elementType}*`, address: address + 8, value: cap === 0 ? 'nullptr' : `0x${cap.toString(16).padStart(6, '0')}`, rawValue: cap, size: 4, isPointer: false },
            ],
        }
    }
}

// THE REGISTRY: Add future types (maps, unique_ptr) here!
export const PRETTY_PRINTERS = [StdStringFormatter, StdVectorFormatter]
