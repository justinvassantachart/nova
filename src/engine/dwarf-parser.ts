//   DWARF Parser  //
// Lightweight DWARF section parser for WASM binaries.

import type { DwarfInfo, LineMap, VariableInfo, StructInfo } from './dwarf-types'
import { EMPTY_DWARF } from './dwarf-types'

const textDecoder = new TextDecoder('utf-8')

// OPTIMIZATION: Module scoped state removes millions of JS object allocations during DWARF reading
let _bytesRead = 0

function readULEB128(view: DataView, offset: number): number {
    let result = 0; let shift = 0; let bytesRead = 0; let byte: number;
    do {
        byte = view.getUint8(offset + bytesRead)
        result |= (byte & 0x7f) << shift
        shift += 7
        bytesRead++
    } while (byte & 0x80)
    _bytesRead = bytesRead
    return result
}

function readSLEB128(view: DataView, offset: number): number {
    let result = 0; let shift = 0; let bytesRead = 0; let byte: number;
    do {
        byte = view.getUint8(offset + bytesRead)
        result |= (byte & 0x7f) << shift
        shift += 7
        bytesRead++
    } while (byte & 0x80)
    if (shift < 32 && (byte & 0x40)) {
        result |= -(1 << shift)
    }
    _bytesRead = bytesRead
    return result
}

function readCString(data: Uint8Array, offset: number): string {
    let end = offset
    while (end < data.length && data[end] !== 0) end++
    const value = textDecoder.decode(data.subarray(offset, end))
    _bytesRead = end - offset + 1
    return value
}

function skipCString(data: Uint8Array, offset: number): number {
    let end = offset
    while (end < data.length && data[end] !== 0) end++
    return end - offset + 1
}

function extractCustomSections(wasmBinary: Uint8Array): Map<string, Uint8Array> {
    const sections = new Map<string, Uint8Array>()
    const view = new DataView(wasmBinary.buffer, wasmBinary.byteOffset, wasmBinary.byteLength)
    let offset = 8

    while (offset < wasmBinary.length) {
        const sectionId = view.getUint8(offset)
        offset++

        const sectionSize = readULEB128(view, offset)
        offset += _bytesRead

        if (sectionId === 0) {
            const sectionStart = offset
            const nameLen = readULEB128(view, offset)
            const nameLenBytes = _bytesRead
            offset += nameLenBytes

            const name = textDecoder.decode(wasmBinary.subarray(offset, offset + nameLen))
            offset += nameLen

            const dataSize = sectionSize - nameLenBytes - nameLen
            if (dataSize > 0) {
                sections.set(name, wasmBinary.subarray(offset, offset + dataSize))
            }
            offset = sectionStart + sectionSize
        } else {
            offset += sectionSize
        }
    }
    return sections
}

const DW_LNS_copy = 1, DW_LNS_advance_pc = 2, DW_LNS_advance_line = 3, DW_LNS_set_file = 4, DW_LNS_set_column = 5, DW_LNS_negate_stmt = 6, DW_LNS_set_basic_block = 7, DW_LNS_const_add_pc = 8, DW_LNS_fixed_advance_pc = 9, DW_LNS_set_prologue_end = 10, DW_LNS_set_epilogue_begin = 11, DW_LNS_set_isa = 12
const DW_LNE_end_sequence = 1, DW_LNE_set_address = 2, DW_LNE_define_file = 3

function parseDebugLine(data: Uint8Array): { lineMap: LineMap; sourceFiles: string[] } {
    const lineMap: LineMap = {}
    const sourceFiles: string[] = []
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    let offset = 0

    while (offset < data.length) {
        const unitLength = view.getUint32(offset, true); offset += 4
        if (unitLength === 0) break
        const unitEnd = offset + unitLength
        const version = view.getUint16(offset, true); offset += 2

        if (version < 2 || version > 5) {
            offset = unitEnd; continue
        }

        if (version >= 5) { offset += 2 }

        const headerLength = view.getUint32(offset, true); offset += 4
        const afterHeader = offset + headerLength
        const minimumInstructionLength = view.getUint8(offset); offset += 1

        if (version >= 4) { offset += 1 }

        offset += 1
        const lineBase = view.getInt8(offset); offset += 1
        const lineRange = view.getUint8(offset); offset += 1
        const opcodeBase = view.getUint8(offset); offset += 1

        const standardOpcodeLengths: number[] = []
        for (let i = 1; i < opcodeBase; i++) {
            standardOpcodeLengths.push(view.getUint8(offset)); offset += 1
        }

        if (version >= 5) {
            const dirFormatCount = view.getUint8(offset); offset += 1
            for (let i = 0; i < dirFormatCount; i++) {
                readULEB128(view, offset); offset += _bytesRead
                readULEB128(view, offset); offset += _bytesRead
            }
            const dirCount = readULEB128(view, offset); offset += _bytesRead
            for (let i = 0; i < dirCount; i++) {
                for (let j = 0; j < dirFormatCount; j++) {
                    readCString(data, offset); offset += _bytesRead
                }
            }

            const fileFormatCount = view.getUint8(offset); offset += 1
            const fileFormats: { contentType: number; form: number }[] = []
            for (let i = 0; i < fileFormatCount; i++) {
                const ct = readULEB128(view, offset); const b1 = _bytesRead; offset += b1
                const form = readULEB128(view, offset); const b2 = _bytesRead; offset += b2
                fileFormats.push({ contentType: ct, form })
            }

            const fileCount = readULEB128(view, offset); offset += _bytesRead
            for (let i = 0; i < fileCount; i++) {
                for (const fmt of fileFormats) {
                    if (fmt.form === 0x08 || fmt.form === 0x0e) {
                        const strValue = readCString(data, offset)
                        if (fmt.contentType === 1) sourceFiles.push(strValue)
                        offset += _bytesRead
                    } else if (fmt.form === 0x0b) { offset += 1 }
                    else if (fmt.form === 0x05) { offset += 2 }
                    else if (fmt.form === 0x06) { offset += 4 }
                    else { readULEB128(view, offset); offset += _bytesRead }
                }
            }
        } else {
            while (offset < afterHeader) {
                if (data[offset] === 0) { offset += 1; break }
                readCString(data, offset); offset += _bytesRead
            }
            while (offset < afterHeader) {
                if (data[offset] === 0) { offset += 1; break }
                const fileName = readCString(data, offset)
                offset += _bytesRead
                sourceFiles.push(fileName)
                readULEB128(view, offset); offset += _bytesRead
                readULEB128(view, offset); offset += _bytesRead
                readULEB128(view, offset); offset += _bytesRead
            }
        }

        offset = afterHeader
        let address = 0, line = 1

        while (offset < unitEnd && offset < data.length) {
            const opcode = view.getUint8(offset); offset += 1
            if (opcode === 0) {
                const extLen = readULEB128(view, offset); offset += _bytesRead
                if (extLen === 0) continue
                const extOpcode = view.getUint8(offset); offset += 1
                switch (extOpcode) {
                    case DW_LNE_end_sequence:
                        lineMap[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = line
                        address = 0; line = 1
                        break
                    case DW_LNE_set_address:
                        if (offset + 3 < data.length) address = view.getUint32(offset, true)
                        offset += extLen - 1
                        break
                    default:
                        offset += extLen - 1
                        break
                }
            } else if (opcode < opcodeBase) {
                switch (opcode) {
                    case DW_LNS_copy:
                        lineMap[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = line
                        break
                    case DW_LNS_advance_pc:
                        address += readULEB128(view, offset) * minimumInstructionLength; offset += _bytesRead
                        break
                    case DW_LNS_advance_line:
                        line += readSLEB128(view, offset); offset += _bytesRead
                        break
                    case DW_LNS_set_file:
                        readULEB128(view, offset); offset += _bytesRead
                        break
                    case DW_LNS_set_column:
                        readULEB128(view, offset); offset += _bytesRead
                        break
                    case DW_LNS_negate_stmt: break
                    case DW_LNS_set_basic_block: break
                    case DW_LNS_const_add_pc:
                        address += Math.floor((255 - opcodeBase) / lineRange) * minimumInstructionLength
                        break
                    case DW_LNS_fixed_advance_pc:
                        address += view.getUint16(offset, true); offset += 2
                        break
                    case DW_LNS_set_isa:
                        readULEB128(view, offset); offset += _bytesRead
                        break
                    default:
                        for (let i = 0; i < (standardOpcodeLengths[opcode - 1] || 0); i++) {
                            readULEB128(view, offset); offset += _bytesRead
                        }
                        break
                }
            } else {
                const adjustedOpcode = opcode - opcodeBase
                address += Math.floor(adjustedOpcode / lineRange) * minimumInstructionLength
                line += lineBase + (adjustedOpcode % lineRange)
                lineMap[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = line
            }
        }
        offset = Math.max(offset, unitEnd)
    }
    return { lineMap, sourceFiles }
}

const DW_TAG_variable = 0x34, DW_TAG_formal_parameter = 0x05, DW_TAG_structure_type = 0x13, DW_TAG_class_type = 0x02, DW_TAG_member = 0x0d, DW_TAG_pointer_type = 0x0f, DW_TAG_reference_type = 0x10, DW_TAG_rvalue_reference_type = 0x42, DW_TAG_typedef = 0x16, DW_TAG_subprogram = 0x2e, DW_TAG_const_type = 0x26, DW_TAG_volatile_type = 0x35, DW_TAG_restrict_type = 0x37
const DW_AT_name = 0x03, DW_AT_type = 0x49, DW_AT_byte_size = 0x0b, DW_AT_data_member_location = 0x38, DW_AT_location = 0x02, DW_AT_decl_line = 0x3b
const DW_FORM_addr = 0x01, DW_FORM_data1 = 0x0b, DW_FORM_data2 = 0x05, DW_FORM_data4 = 0x06, DW_FORM_data8 = 0x07, DW_FORM_string = 0x08, DW_FORM_strp = 0x0e, DW_FORM_block1 = 0x0a, DW_FORM_block2 = 0x03, DW_FORM_block4 = 0x04, DW_FORM_block = 0x09, DW_FORM_ref1 = 0x11, DW_FORM_ref2 = 0x12, DW_FORM_ref4 = 0x13, DW_FORM_ref8 = 0x14, DW_FORM_ref_udata = 0x15, DW_FORM_flag = 0x0c, DW_FORM_udata = 0x0f, DW_FORM_sdata = 0x0d, DW_FORM_sec_offset = 0x17, DW_FORM_exprloc = 0x18, DW_FORM_flag_present = 0x19, DW_FORM_ref_addr = 0x10, DW_FORM_strx = 0x1a, DW_FORM_addrx = 0x1b, DW_FORM_strx1 = 0x25, DW_FORM_strx2 = 0x26, DW_FORM_strx4 = 0x27, DW_FORM_implicit_const = 0x21, DW_FORM_line_strp = 0x1f, DW_FORM_rnglistx = 0x23, DW_FORM_loclistx = 0x22, DW_FORM_ref_sig8 = 0x20, DW_FORM_addrx1 = 0x29, DW_FORM_addrx2 = 0x2a

interface AbbrevEntry {
    tag: number; hasChildren: boolean
    attrs: { name: number; form: number; implicitConst?: number }[]
}

function parseAbbrevTable(data: Uint8Array, offset: number): Map<number, AbbrevEntry> {
    const table = new Map<number, AbbrevEntry>()
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    while (offset < data.length) {
        const code = readULEB128(view, offset); offset += _bytesRead;
        if (code === 0) break
        const tag = readULEB128(view, offset); offset += _bytesRead;
        const hasChildren = view.getUint8(offset) !== 0; offset += 1
        const attrs: AbbrevEntry['attrs'] = []
        while (offset < data.length) {
            const attrName = readULEB128(view, offset); offset += _bytesRead;
            const attrForm = readULEB128(view, offset); offset += _bytesRead;
            if (attrName === 0 && attrForm === 0) break
            let implicitConst: number | undefined
            if (attrForm === DW_FORM_implicit_const) {
                implicitConst = readSLEB128(view, offset); offset += _bytesRead;
            }
            attrs.push({ name: attrName, form: attrForm, implicitConst })
        }
        table.set(code, { tag, hasChildren, attrs })
    }
    return table
}

function skipFormValue(view: DataView, data: Uint8Array, offset: number, form: number, addressSize: number, is64: boolean): number {
    switch (form) {
        case DW_FORM_addr: return addressSize
        case DW_FORM_data1: case DW_FORM_ref1: case DW_FORM_flag: return 1
        case DW_FORM_data2: case DW_FORM_ref2: return 2
        case DW_FORM_data4: case DW_FORM_ref4: case DW_FORM_strp: case DW_FORM_sec_offset: case DW_FORM_ref_addr: case DW_FORM_line_strp: case DW_FORM_strx4: return is64 ? 8 : 4
        case DW_FORM_data8: case DW_FORM_ref8: case DW_FORM_ref_sig8: return 8
        case DW_FORM_string: return skipCString(data, offset)
        case DW_FORM_block1: return 1 + view.getUint8(offset)
        case DW_FORM_block2: return 2 + view.getUint16(offset, true)
        case DW_FORM_block4: return 4 + view.getUint32(offset, true)
        case DW_FORM_block: case DW_FORM_exprloc: {
            const value = readULEB128(view, offset)
            return _bytesRead + value
        }
        case DW_FORM_udata: case DW_FORM_ref_udata: case DW_FORM_strx: case DW_FORM_addrx: case DW_FORM_rnglistx: case DW_FORM_loclistx:
            readULEB128(view, offset); return _bytesRead
        case DW_FORM_sdata:
            readSLEB128(view, offset); return _bytesRead
        case DW_FORM_flag_present: case DW_FORM_implicit_const: return 0
        case DW_FORM_strx1: case DW_FORM_addrx1: return 1
        case DW_FORM_strx2: case DW_FORM_addrx2: return 2
        default: return 0
    }
}

function readFormAsNumber(view: DataView, _data: Uint8Array, offset: number, form: number, addressSize: number): number | null {
    switch (form) {
        case DW_FORM_data1: case DW_FORM_ref1: case DW_FORM_flag: case DW_FORM_addrx1: case DW_FORM_strx1: return view.getUint8(offset)
        case DW_FORM_data2: case DW_FORM_ref2: case DW_FORM_addrx2: case DW_FORM_strx2: return view.getUint16(offset, true)
        case DW_FORM_data4: case DW_FORM_ref4: case DW_FORM_sec_offset: case DW_FORM_strp: case DW_FORM_ref_addr: case DW_FORM_strx4: return view.getUint32(offset, true)
        case DW_FORM_addr: return addressSize === 4 ? view.getUint32(offset, true) : Number(view.getBigUint64(offset, true))
        case DW_FORM_udata: case DW_FORM_ref_udata: case DW_FORM_strx: case DW_FORM_addrx: case DW_FORM_rnglistx: case DW_FORM_loclistx: return readULEB128(view, offset)
        case DW_FORM_sdata: return readSLEB128(view, offset)
        default: return null
    }
}

function readFormAsString(data: Uint8Array, offset: number, form: number, debugStr?: Uint8Array): string | null {
    if (form === DW_FORM_string) { return readCString(data, offset) }
    if ((form === DW_FORM_strp || form === DW_FORM_line_strp) && debugStr) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
        const strOffset = view.getUint32(offset, true)
        if (strOffset < debugStr.length) return readCString(debugStr, strOffset)
    }
    return null
}

function parseDebugInfo(debugInfo: Uint8Array, debugAbbrev: Uint8Array, debugStr?: Uint8Array): { variables: VariableInfo[]; types: Record<string, StructInfo> } {
    const variables: VariableInfo[] = []
    const types: Record<string, StructInfo> = {}
    const view = new DataView(debugInfo.buffer, debugInfo.byteOffset, debugInfo.byteLength)
    const typeMap = new Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>()
    const pendingStructMembers = new Map<number, { name: string; offset: number; typeRef?: number }[]>()

    let offset = 0
    while (offset < debugInfo.length) {
        const unitStart = offset
        const unitLength = view.getUint32(offset, true); offset += 4
        if (unitLength === 0 || unitLength >= 0xFFFFFFF0) break
        const unitEnd = unitStart + 4 + unitLength
        const version = view.getUint16(offset, true); offset += 2

        let abbrevOffset: number; let addressSize: number
        if (version >= 5) {
            offset += 1
            addressSize = view.getUint8(offset); offset += 1
            abbrevOffset = view.getUint32(offset, true); offset += 4
        } else {
            abbrevOffset = view.getUint32(offset, true); offset += 4
            addressSize = view.getUint8(offset); offset += 1
        }

        const abbrevTable = parseAbbrevTable(debugAbbrev, abbrevOffset)
        let currentStructOffset: number | null = null
        const dieStack: { tag: number, name: string }[] = []
        const pendingVars: { name: string; typeRef: number | undefined; stackOffset: number; declLine: number; funcName: string }[] = []

        while (offset < unitEnd && offset < debugInfo.length) {
            const dieOffset = offset
            const abbrevCode = readULEB128(view, offset); offset += _bytesRead;

            if (abbrevCode === 0) {
                dieStack.pop(); currentStructOffset = null; continue
            }

            const abbrev = abbrevTable.get(abbrevCode)
            if (!abbrev) { offset = unitEnd; break }

            let dieName: string | undefined; let dieSize: number | undefined; let dieTypeRef: number | undefined; let dieMemberLoc: number | undefined; let dieStackOffset: number | undefined; let dieDeclLine: number | undefined

            for (const attr of abbrev.attrs) {
                const attrStart = offset
                if (attr.form === DW_FORM_implicit_const) {
                    if (attr.name === DW_AT_byte_size) dieSize = attr.implicitConst
                    if (attr.name === DW_AT_data_member_location) dieMemberLoc = attr.implicitConst
                    continue
                }

                if (attr.name === DW_AT_name) dieName = readFormAsString(debugInfo, offset, attr.form, debugStr) ?? undefined
                if (attr.name === DW_AT_byte_size) dieSize = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize) ?? undefined
                if (attr.name === DW_AT_decl_line) dieDeclLine = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize) ?? undefined
                if (attr.name === DW_AT_type) {
                    const ref = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize)
                    if (ref !== null) dieTypeRef = (attr.form === DW_FORM_ref4 || attr.form === DW_FORM_ref1 || attr.form === DW_FORM_ref2 || attr.form === DW_FORM_ref_udata) ? unitStart + ref : ref
                }
                if (attr.name === DW_AT_data_member_location) dieMemberLoc = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize) ?? undefined
                if (attr.name === DW_AT_location) {
                    if (attr.form === DW_FORM_exprloc || attr.form === DW_FORM_block1) {
                        let lenSize = 1; let blockLen = 0;
                        if (attr.form === DW_FORM_block1) { blockLen = view.getUint8(offset) }
                        else { blockLen = readULEB128(view, offset); lenSize = _bytesRead }

                        const blockStart = offset + lenSize
                        if (blockLen >= 2 && blockStart < debugInfo.length) {
                            if (view.getUint8(blockStart) === 0x91) dieStackOffset = readSLEB128(view, blockStart + 1)
                        }
                    }
                }
                offset = attrStart + skipFormValue(view, debugInfo, offset, attr.form, addressSize, false)
            }

            typeMap.set(dieOffset, { tag: abbrev.tag, name: dieName, size: dieSize, typeRef: dieTypeRef })

            if (abbrev.tag === DW_TAG_structure_type || abbrev.tag === DW_TAG_class_type) {
                if (dieName && dieSize !== undefined) {
                    currentStructOffset = dieOffset
                    pendingStructMembers.set(dieOffset, [])
                    types[dieName] = { name: dieName, size: dieSize, members: [] }
                }
            } else if (abbrev.tag === DW_TAG_member && currentStructOffset !== null) {
                const members = pendingStructMembers.get(currentStructOffset)
                if (members && dieName !== undefined && dieMemberLoc !== undefined) {
                    members.push({ name: dieName, offset: dieMemberLoc, typeRef: dieTypeRef })
                }
            } else if ((abbrev.tag === DW_TAG_variable || abbrev.tag === DW_TAG_formal_parameter) && dieName) {
                let funcName = 'global'
                for (let i = dieStack.length - 1; i >= 0; i--) {
                    if (dieStack[i].tag === DW_TAG_subprogram) { funcName = dieStack[i].name || 'unknown'; break }
                }
                if (dieStackOffset !== undefined && !funcName.startsWith('__') && !dieName.startsWith('__')) {
                    pendingVars.push({ name: dieName, typeRef: dieTypeRef, stackOffset: dieStackOffset, declLine: dieDeclLine ?? 0, funcName })
                }
            }
            if (abbrev.hasChildren) dieStack.push({ tag: abbrev.tag, name: dieName || '' })
        }

        for (const pv of pendingVars) {
            const typeName = pv.typeRef ? resolveTypeName(typeMap, pv.typeRef) : 'unknown'
            const typeSize = pv.typeRef ? resolveTypeSize(typeMap, pv.typeRef) : 0
            const pointer = isPointerType(typeMap, pv.typeRef)
            variables.push({
                name: pv.name, type: typeName, size: typeSize, stackOffset: pv.stackOffset, isPointer: pointer,
                pointeeType: pointer && pv.typeRef ? resolvePointeeType(typeMap, pv.typeRef) : undefined,
                declLine: pv.declLine, funcName: pv.funcName,
            })
        }
        for (const [structOff, members] of pendingStructMembers) {
            const info = typeMap.get(structOff)
            if (info?.name && types[info.name]) {
                types[info.name].members = members.map(m => {
                    const isPtr = isPointerType(typeMap, m.typeRef)
                    return {
                        name: m.name, offset: m.offset, type: m.typeRef ? resolveTypeName(typeMap, m.typeRef) : 'unknown',
                        size: m.typeRef ? resolveTypeSize(typeMap, m.typeRef) : 0, isPointer: isPtr,
                        pointeeType: isPtr && m.typeRef ? resolvePointeeType(typeMap, m.typeRef) : undefined,
                    }
                })
            }
        }
        offset = Math.max(offset, unitEnd)
    }
    return { variables, types }
}

function cleanTypeName(name: string): string {
    if (!name) return 'unknown'
    if (name.startsWith('std::__1::basic_string') || name.startsWith('std::__2::basic_string')) return 'std::string'
    if (name.startsWith('std::__1::vector') || name.startsWith('std::__2::vector')) {
        const match = name.match(/<([^,]+)/); if (match) return `std::vector<${cleanTypeName(match[1].trim())}>`
    }
    if (name === 'string' || name === 'std::string' || name.startsWith('basic_string')) return 'std::string'
    if (name === 'vector' || name.startsWith('vector<')) {
        const match = name.match(/<([^,]+)/); if (match) return `std::vector<${cleanTypeName(match[1].trim())}>`
        return 'std::vector<unknown>'
    }
    return name
}

function resolveTypeName(typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>, offset: number | undefined, depth = 0): string {
    if (offset === undefined || depth > 10) return 'unknown'
    const info = typeMap.get(offset)
    if (!info) return 'unknown'
    if (info.tag === DW_TAG_pointer_type) return `${resolveTypeName(typeMap, info.typeRef, depth + 1)}*`
    if (info.tag === DW_TAG_reference_type) return `${resolveTypeName(typeMap, info.typeRef, depth + 1)}&`
    if (info.tag === DW_TAG_rvalue_reference_type) return `${resolveTypeName(typeMap, info.typeRef, depth + 1)}&&`
    if (info.tag === DW_TAG_typedef || info.tag === DW_TAG_const_type || info.tag === DW_TAG_volatile_type || info.tag === DW_TAG_restrict_type) {
        if (info.name) {
            const cleaned = cleanTypeName(info.name)
            if (cleaned !== info.name) return cleaned
        }
        if (info.typeRef !== undefined) return resolveTypeName(typeMap, info.typeRef, depth + 1)
        if (info.name) return cleanTypeName(info.name)
        return 'unknown'
    }
    return cleanTypeName(info.name ?? 'unknown')
}

function resolveTypeSize(typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>, offset: number | undefined, depth = 0): number {
    if (offset === undefined || depth > 10) return 0
    const info = typeMap.get(offset)
    if (!info) return 0
    if (info.size !== undefined) return info.size
    if (info.tag === DW_TAG_pointer_type || info.tag === DW_TAG_reference_type || info.tag === DW_TAG_rvalue_reference_type) return 4
    return resolveTypeSize(typeMap, info.typeRef, depth + 1)
}

function isPointerType(typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>, offset: number | undefined, depth = 0): boolean {
    if (offset === undefined || depth > 10) return false
    const info = typeMap.get(offset)
    if (!info) return false
    if (info.tag === DW_TAG_pointer_type || info.tag === DW_TAG_reference_type || info.tag === DW_TAG_rvalue_reference_type) return true
    if (info.tag === DW_TAG_typedef || info.tag === DW_TAG_const_type || info.tag === DW_TAG_volatile_type || info.tag === DW_TAG_restrict_type) return isPointerType(typeMap, info.typeRef, depth + 1)
    return false
}

function resolvePointeeType(typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>, offset: number | undefined, depth = 0): string | undefined {
    if (offset === undefined || depth > 10) return undefined
    const info = typeMap.get(offset)
    if (!info) return undefined
    if (info.tag === DW_TAG_pointer_type || info.tag === DW_TAG_reference_type || info.tag === DW_TAG_rvalue_reference_type) return resolveTypeName(typeMap, info.typeRef, depth + 1)
    if (info.tag === DW_TAG_typedef || info.tag === DW_TAG_const_type || info.tag === DW_TAG_volatile_type || info.tag === DW_TAG_restrict_type) return resolvePointeeType(typeMap, info.typeRef, depth + 1)
    return undefined
}

export function parseDwarf(wasmBinary: Uint8Array): DwarfInfo {
    try {
        console.time('[dwarf] parse')
        const sections = extractCustomSections(wasmBinary)
        const debugLine = sections.get('.debug_line')
        const debugInfoSection = sections.get('.debug_info')
        const debugAbbrev = sections.get('.debug_abbrev')
        const debugStr = sections.get('.debug_str')

        if (!debugLine && !debugInfoSection) return EMPTY_DWARF

        let lineMap: LineMap = {}
        let sourceFiles: string[] = []
        if (debugLine) {
            const lineResult = parseDebugLine(debugLine)
            lineMap = lineResult.lineMap
            sourceFiles = lineResult.sourceFiles
        }

        let variables: VariableInfo[] = []
        let typeInfo: Record<string, StructInfo> = {}
        if (debugInfoSection && debugAbbrev) {
            const infoResult = parseDebugInfo(debugInfoSection, debugAbbrev, debugStr)
            variables = infoResult.variables
            typeInfo = infoResult.types
        }

        console.timeEnd('[dwarf] parse')
        return { lineMap, variables, types: typeInfo, sourceFiles }
    } catch (err) {
        console.error('[dwarf] Parse failed:', err)
        return EMPTY_DWARF
    }
}
