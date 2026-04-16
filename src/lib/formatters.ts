//   Pretty Printer Registry  //
// Extensible type formatters for std library types in WASM memory.
// Add new formatters here without touching the core memory reader.

import type { MemoryValue } from './memory-reader'
import type { StructMember } from '@/engine/dwarf-types'

export interface FormatterContext {
    view: DataView
    bytes: Uint8Array
    address: number
    name: string
    typeName: string
    size: number
    depth: number
    getTypeSize: (type: string) => number
    getStructMembers: (type: string) => StructMember[] | undefined
    tagHeap: (ptr: number, type: string) => void
    readVar: (name: string, type: string, size: number, address: number, depth: number) => MemoryValue | null
}

export interface TypeFormatter {
    match: (typeName: string) => boolean
    format: (ctx: FormatterContext) => MemoryValue | null
}

export const StdStringFormatter: TypeFormatter = {
    match: (type) => {
        const t = type.replace(/\s+/g, '')
        if (t.endsWith('*') || t.endsWith('&')) return false;
        // Guard: only match if basic_string is the TOP-LEVEL type, not a template arg
        // e.g. match "basic_string<char,...>" but NOT "Vector<basic_string<char,...>>"
        const bracketIdx = t.indexOf('<')
        const prefix = bracketIdx === -1 ? t : t.substring(0, bracketIdx)
        return t === 'std::string' || t === 'string' || prefix.includes('basic_string')
    },
    format: (ctx) => {
        const { view, bytes, address, name, size, tagHeap } = ctx
        let value = '"<invalid>"'
        let isPointer = false
        let pointsTo: number | undefined = undefined

        if (size >= 12 && address + 11 < view.byteLength) {
            const lastByte = bytes[address + 11]
            const isLong = (lastByte & 0x80) !== 0
            if (!isLong) {
                const strSize = lastByte & 0x7F
                if (strSize <= 11 && address + strSize <= view.byteLength) {
                    value = `"${new TextDecoder().decode(bytes.subarray(address, address + strSize))}"`
                }
            } else {
                // libc++ __2 (alternate) ABI: __data_ at +0, __size_ at +4, __cap_ at +8
                const strSize = view.getUint32(address + 4, true)
                const ptr = view.getUint32(address, true)
                if (ptr > 0 && ptr + strSize <= bytes.length && strSize < 100000) {
                    value = `"${new TextDecoder().decode(bytes.subarray(ptr, ptr + strSize))}"`
                    tagHeap(ptr, 'std::string::data')
                    isPointer = true
                    pointsTo = ptr
                }
            }
        }
        return { name, type: 'std::string', address, value, rawValue: 0, size, isPointer, pointsTo, pointeeType: 'std::string::data', isStruct: false }
    }
}

export const StdVectorFormatter: TypeFormatter = {
    match: (type) => {
        const t = type.replace(/\s+/g, '')
        if (t.endsWith('*') || t.endsWith('&')) return false;
        return t.includes('vector<')
    },
    format: (ctx) => {
        const { view, address, name, typeName, size, getTypeSize, tagHeap, readVar } = ctx
        const match = typeName.match(/<([^>]+)/)
        const elementType = match ? match[1].trim() : 'unknown'
        const elementSize = getTypeSize(elementType) || 4

        if (address + 12 > view.byteLength) return null

        const begin = view.getUint32(address, true)
        const end = view.getUint32(address + 4, true)
        const cap = view.getUint32(address + 8, true)

        const length = begin === 0 || elementSize === 0 ? 0 : (end - begin) / elementSize
        const capacity = begin === 0 || elementSize === 0 ? 0 : (cap - begin) / elementSize

        const members: MemoryValue[] = []
        if (begin > 0 && length > 0 && length < 1000) {
            tagHeap(begin, `std::vector::data`)
            const count = Math.min(length, 50)
            for (let i = 0; i < count; i++) {
                const elAddr = begin + i * elementSize
                if (ctx.depth < 10) {
                    const elVal = readVar(`[${i}]`, elementType, elementSize, elAddr, ctx.depth + 1)
                    if (elVal) members.push(elVal)
                }
            }
            if (length > 50) members.push({ name: '...', type: '', address: 0, value: `(+${length - 50} more)`, rawValue: 0, size: 0, isPointer: false })
        }

        return { name, type: `std::vector<${elementType}>`, address, value: `size=${length} cap=${capacity}`, rawValue: begin, size, isPointer: false, isStruct: true, members }
    }
}

export const StdTreeFormatter: TypeFormatter = {
    // Universal Matcher for std::set and std::map
    match: (type) => {
        const t = type.replace(/\s+/g, '');
        if (t.endsWith('*') || t.endsWith('&')) return false;
        return t.startsWith('std::set<') || t.startsWith('std::map<') || t.startsWith('set<') || t.startsWith('map<');
    },
    format: (ctx) => {
        const { view, address, name, typeName, size, depth, getTypeSize, tagHeap, readVar } = ctx;
        if (address + 12 > view.byteLength) return null;

        // In WASM32 libc++ __tree, root pointer is at offset 4, size is at offset 8.
        const rootPtr = view.getUint32(address + 4, true);
        const length = view.getUint32(address + 8, true);

        const cleanT = typeName.replace(/\s+/g, '');
        const isMap = cleanT.startsWith('std::map<') || cleanT.startsWith('map<');
        let valType = 'unknown';

        if (isMap) {
            const mapMatch = typeName.match(/<(.+?)(?:,\s*std::(?:__1::)?allocator|$)/);
            if (mapMatch) {
                let commaIdx = -1; let brackets = 0;
                for (let i = 0; i < mapMatch[1].length; i++) {
                    if (mapMatch[1][i] === '<') brackets++;
                    else if (mapMatch[1][i] === '>') brackets--;
                    else if (mapMatch[1][i] === ',' && brackets === 0) { commaIdx = i; break; }
                }
                if (commaIdx !== -1) {
                    const k = mapMatch[1].substring(0, commaIdx).trim();
                    const v = mapMatch[1].substring(commaIdx + 1).trim();
                    valType = `std::pair<const ${k}, ${v}>`;
                }
            }
        } else {
            const match = typeName.match(/<([^,>]+)/);
            if (match) valType = match[1].trim();
        }

        const valSize = getTypeSize(valType) || 4;
        const members: MemoryValue[] = [];

        if (rootPtr > 0 && length > 0 && length < 1000) {
            let count = 0;
            const traverse = (nodePtr: number) => {
                if (nodePtr === 0 || count >= 50 || count >= length) return;
                const left = view.getUint32(nodePtr, true);
                const right = view.getUint32(nodePtr + 4, true);

                traverse(left);

                if (count < 50) {
                    tagHeap(nodePtr, `std::tree::node`);
                    // In WASM32 libc++, __tree_node values ALWAYS start at offset 16
                    const elVal = readVar(`[${count}]`, valType, valSize, nodePtr + 16, depth + 1);
                    if (elVal) {
                        // Expand Maps natively so they print beautifully 
                        if (isMap && elVal.members && elVal.members.length >= 2) {
                            elVal.value = `${elVal.members[0].value} : ${elVal.members[1].value}`;
                        }
                        members.push(elVal);
                    }
                    count++;
                }
                traverse(right);
            };
            try { traverse(rootPtr); } catch { }
            if (length > 50) members.push({ name: '...', type: '', address: 0, value: `(+${length - 50} more)`, rawValue: 0, size: 0, isPointer: false });
        }

        return { name, type: typeName, address, value: `size=${length}`, rawValue: rootPtr, size, isPointer: false, isStruct: true, members };
    }
}


export const StanfordCollectionFormatter: TypeFormatter = {
    // Universal Matcher for Stanford Collections
    match: (type) => {
        const t = type.replace(/\s+/g, '').replace(/^(?:[a-zA-Z_][a-zA-Z0-9_]*::)+/, '');
        if (t.endsWith('*') || t.endsWith('&')) return false;
        // GenericSet is caught too to ensure typedefs resolve perfectly
        return /^(Vector|Set|HashSet|Map|HashMap|Stack|Queue|Grid|GenericSet|GenericMap)</.test(t);
    },
    format: (ctx) => {
        const { view, address, name, typeName, size, depth, getTypeSize, getStructMembers, tagHeap, readVar } = ctx

        const membersList = getStructMembers(typeName);
        if (!membersList) return null;

        const cleanName = typeName.replace(/^(?:[a-zA-Z_][a-zA-Z0-9_]*::)+/, '');
        const collectionType = cleanName.split('<')[0].replace('Generic', '');

        // --- 1. DELEGATION (e.g. Set wrapping Map, Stack wrapping Vector) ---
        const wrapperMember = membersList.find(m =>
            !m.isPointer && (
                m.type.includes('set') || m.type.includes('map') || m.type.includes('Vector') || m.type.includes('Grid') ||
                m.name === 'map' || m.name === '_map' || m.name === 'queue' || m.name === '_queue' || m.name === 'list' || m.name === '_list'
            )
        );

        if (wrapperMember && wrapperMember.type !== typeName) {
            const mAddr = address + wrapperMember.offset;
            const innerVal = readVar(name, wrapperMember.type, wrapperMember.size, mAddr, depth);
            if (innerVal && innerVal.members) {
                let mappedMembers = innerVal.members;

                // If a Set wraps a Map, the Map renders as `K : V`. We strip the dummy V boolean!
                if ((collectionType === 'Set' || collectionType === 'HashSet') && (wrapperMember.type.includes('map') || wrapperMember.type.includes('Map'))) {
                    mappedMembers = innerVal.members.map(m => {
                        if (m.type.includes('pair') && m.members && m.members.length > 0) {
                            return { ...m.members[0], name: m.name }; // Hoist the key to the top level
                        }
                        return m;
                    });
                }

                return {
                    name, type: typeName, address,
                    value: innerVal.value, rawValue: innerVal.rawValue, size,
                    isPointer: false, isStruct: true, members: mappedMembers,
                };
            }
        }

        // --- 2. ARRAY-BACKED COLLECTIONS (Vector, Grid, Queue) ---
        const elementsMember = membersList.find(m => m.name === 'elements' || m.name === '_elements' || m.name === 'entries' || m.name === '_entries');
        const sizeMember = membersList.find(m => m.name === 'size' || m.name === '_size' || m.name === 'count' || m.name === '_count' || m.name === 'm_size');
        const capMember = membersList.find(m => m.name === 'capacity' || m.name === '_capacity');

        if (elementsMember && elementsMember.isPointer && sizeMember) {
            let length = 0; let capacity = 0; let elementsPtr = 0;
            try {
                length = view.getInt32(address + sizeMember.offset, true);
                if (capMember) capacity = view.getInt32(address + capMember.offset, true);
                elementsPtr = view.getUint32(address + elementsMember.offset, true);
            } catch { return null; }

            let elementType = elementsMember.pointeeType;
            if (!elementType) {
                const match = typeName.match(/<([^,>]+)/);
                elementType = match ? match[1].trim() : 'unknown';
            }
            const elementSize = getTypeSize(elementType) || 4;

            const members: MemoryValue[] = [];
            const displayCount = Math.max(0, capMember ? capacity : length);

            if (elementsPtr > 0 && displayCount > 0 && displayCount < 1000) {
                tagHeap(elementsPtr, `${collectionType}::data`);
                const count = Math.min(displayCount, 50);
                for (let i = 0; i < count; i++) {
                    const elAddr = elementsPtr + i * elementSize;
                    if (depth < 10) {
                        const elVal = readVar(`[${i}]`, elementType, elementSize, elAddr, depth + 1);
                        if (elVal) members.push(elVal);
                    }
                }
                if (displayCount > 50) members.push({ name: '...', type: '', address: 0, value: `(+${displayCount - 50} more)`, rawValue: 0, size: 0, isPointer: false });
            }

            let valStr = `size=${length}`;
            if (capMember) valStr += ` cap=${capacity}`;

            return {
                name, type: typeName, address,
                value: valStr, rawValue: elementsPtr, size,
                isPointer: false, isStruct: true, members,
            };
        }

        return null;
    }
};

export const PRETTY_PRINTERS = [StdStringFormatter, StdVectorFormatter, StdTreeFormatter, StanfordCollectionFormatter]
