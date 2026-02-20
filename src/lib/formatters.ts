// lib/formatters.ts
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
    readVar: (name: string, type: string, size: number, address: number, depth: number) => MemoryValue | null
}

export interface TypeFormatter {
    match: (typeName: string) => boolean
    format: (ctx: FormatterContext) => MemoryValue
}

export const StdStringFormatter: TypeFormatter = {
    // Matches std::string and libc++ internal basic_string
    match: (type) => type === 'std::string' || type.startsWith('std::__1::basic_string'),
    format: (ctx) => {
        const { view, bytes, address, name, typeName, size } = ctx
        let value = '"<invalid>"'

        // libc++ Small String Optimization (SSO) Logic
        if (size >= 12) {
            const isLong = bytes[address] & 1
            if (!isLong) {
                const strSize = bytes[address] >> 1
                if (address + 1 + strSize <= view.byteLength) {
                    value = `"${new TextDecoder().decode(bytes.subarray(address + 1, address + 1 + strSize))}"`
                }
            } else {
                const strSize = view.getUint32(address + 4, true)
                const ptr = view.getUint32(address + 8, true)
                if (ptr > 0 && ptr + strSize <= bytes.length && strSize < 10000) {
                    value = `"${new TextDecoder().decode(bytes.subarray(ptr, ptr + strSize))}"`
                }
            }
        }
        return { name, type: 'std::string', address, value, rawValue: 0, size, isPointer: false }
    }
}

export const StdVectorFormatter: TypeFormatter = {
    // Matches std::vector
    match: (type) => type.startsWith('std::vector') || type.startsWith('std::__1::vector'),
    format: (ctx) => {
        const { view, address, name, typeName, size, depth, getTypeSize, readVar } = ctx

        // Extract the inner type T from std::vector<T>
        const match = typeName.match(/<([^,]+)/)
        const elementType = match ? match[1].trim() : 'unknown'
        const elementSize = getTypeSize(elementType) || 4

        const begin = view.getUint32(address, true)
        const end = view.getUint32(address + 4, true)

        const members: MemoryValue[] = []
        const length = begin === 0 ? 0 : (end - begin) / elementSize

        const maxRender = Math.min(length, 20)
        for (let i = 0; i < maxRender; i++) {
            const elAddr = begin + i * elementSize
            const elVal = readVar(`[${i}]`, elementType, elementSize, elAddr, depth + 1)
            if (elVal) members.push(elVal)
        }

        if (length > maxRender) {
            members.push({
                name: '...', type: '', address: 0, value: `(+ ${length - maxRender} elements)`,
                rawValue: 0, size: 0, isPointer: false
            })
        }

        return {
            name, type: `std::vector<${elementType}>`, address, value: `size=${length}`,
            rawValue: length, size, isPointer: false, isStruct: true, members
        }
    }
}

// THE REGISTRY: Add future types (maps, unique_ptr) here!
export const PRETTY_PRINTERS = [StdStringFormatter, StdVectorFormatter]
