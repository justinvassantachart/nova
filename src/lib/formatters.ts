//   Pretty Printer Registry  //
// Extensible type formatters for std library types in WASM memory.
// Add new formatters here without touching the core memory reader.

import type { MemoryValue } from './memory-reader'
import type { StructMember } from '@/engine/dwarf-types'
import { parseCppType, stringifyCppType, getBaseTypeNoNamespaces, type ParsedType } from './type-parser'

export interface FormatterContext {
    view: DataView
    bytes: Uint8Array
    address: number
    name: string
    typeName: string
    ast: ParsedType
    size: number
    depth: number
    getTypeSize: (type: string) => number
    getStructMembers: (type: string) => StructMember[] | undefined
    tagHeap: (ptr: number, type: string) => void
    readVar: (name: string, type: string, size: number, address: number, depth: number) => MemoryValue | null
}

export interface TypeFormatter {
    match: (typeName: string, ast: ParsedType) => boolean
    format: (ctx: FormatterContext) => MemoryValue | null
}

export const StdStringFormatter: TypeFormatter = {
    match: (_, ast) => {
        if (ast.pointerCount > 0 || ast.isReference || ast.isRValueReference || ast.arrayDims.length > 0) return false;
        const b = getBaseTypeNoNamespaces(ast);
        return b === 'string' || b === 'basic_string';
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
    match: (_, ast) => {
        if (ast.pointerCount > 0 || ast.isReference || ast.isRValueReference || ast.arrayDims.length > 0) return false;
        return getBaseTypeNoNamespaces(ast) === 'vector';
    },
    format: (ctx) => {
        const { view, address, name, ast, size, getTypeSize, tagHeap, readVar } = ctx
        const elementType = ast.templateArgs.length > 0 ? stringifyCppType(ast.templateArgs[0]) : 'unknown'
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
    match: (_, ast) => {
        if (ast.pointerCount > 0 || ast.isReference || ast.isRValueReference || ast.arrayDims.length > 0) return false;
        const b = getBaseTypeNoNamespaces(ast);
        return b === 'set' || b === 'map';
    },
    format: (ctx) => {
        const { view, address, name, typeName, ast, size, depth, getTypeSize, tagHeap, readVar } = ctx;
        if (address + 12 > view.byteLength) return null;

        // In WASM32 libc++ __tree, root pointer is at offset 4, size is at offset 8.
        const rootPtr = view.getUint32(address + 4, true);
        const length = view.getUint32(address + 8, true);

        const isMap = getBaseTypeNoNamespaces(ast) === 'map';

        let valType = 'unknown';
        if (isMap) {
            if (ast.templateArgs.length >= 2) {
                const k = stringifyCppType(ast.templateArgs[0]);
                const v = stringifyCppType(ast.templateArgs[1]);
                valType = `std::pair<const ${k}, ${v}>`;
            }
        } else {
            if (ast.templateArgs.length >= 1) {
                valType = stringifyCppType(ast.templateArgs[0]);
            }
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
    match: (_, ast) => {
        if (ast.pointerCount > 0 || ast.isReference || ast.isRValueReference || ast.arrayDims.length > 0) return false;
        const b = getBaseTypeNoNamespaces(ast);
        // GenericSet is caught too to ensure typedefs resolve perfectly
        return /^(Vector|Set|HashSet|Map|HashMap|Stack|Queue|Grid|GenericSet|GenericMap)$/.test(b);
    },
    format: (ctx) => {
        const { view, address, name, typeName, ast, size, depth, getTypeSize, getStructMembers, tagHeap, readVar } = ctx

        const membersList = getStructMembers(typeName);
        if (!membersList) return null;

        const collectionType = getBaseTypeNoNamespaces(ast).replace('Generic', '');

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
                elementType = ast.templateArgs.length > 0 ? stringifyCppType(ast.templateArgs[0]) : 'unknown';
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
