// ── DWARF Parser ───────────────────────────────────────────────────
// Lightweight DWARF section parser for WASM binaries.
// Extracts .debug_line → lineMap and .debug_info → variables/types
// from the WASM custom sections produced by clang -g.
//
// This is NOT a full DWARF parser — it handles the subset needed
// for our debugger: line number mappings and basic variable/type info.

import type { DwarfInfo, LineMap, VariableInfo, StructInfo } from './dwarf-types'
import { EMPTY_DWARF } from './dwarf-types'

// ── WASM Section Parsing ───────────────────────────────────────────

// Instantiate a single TextDecoder globally
const textDecoder = new TextDecoder('utf-8')

/** Read a LEB128 unsigned integer from a DataView */
function readULEB128(view: DataView, offset: number): { value: number; bytesRead: number } {
    let result = 0
    let shift = 0
    let bytesRead = 0
    let byte: number

    do {
        byte = view.getUint8(offset + bytesRead)
        result |= (byte & 0x7f) << shift
        shift += 7
        bytesRead++
    } while (byte & 0x80)

    return { value: result, bytesRead }
}

/** Read a LEB128 signed integer from a DataView */
function readSLEB128(view: DataView, offset: number): { value: number; bytesRead: number } {
    let result = 0
    let shift = 0
    let bytesRead = 0
    let byte: number

    do {
        byte = view.getUint8(offset + bytesRead)
        result |= (byte & 0x7f) << shift
        shift += 7
        bytesRead++
    } while (byte & 0x80)

    // Sign extend
    if (shift < 32 && (byte & 0x40)) {
        result |= -(1 << shift)
    }

    return { value: result, bytesRead }
}

/** Read a null-terminated string from a buffer */
function readCString(data: Uint8Array, offset: number): { value: string; bytesRead: number } {
    let end = offset
    while (end < data.length && data[end] !== 0) end++
    // 🚀 Use .subarray() to avoid copying the buffer in memory
    const value = textDecoder.decode(data.subarray(offset, end))
    return { value, bytesRead: end - offset + 1 }
}

/** Efficiently skip over a string without decoding it */
function skipCString(data: Uint8Array, offset: number): number {
    let end = offset
    while (end < data.length && data[end] !== 0) end++
    return end - offset + 1
}

/** Extract named custom sections from a WASM binary */
function extractCustomSections(wasmBinary: Uint8Array): Map<string, Uint8Array> {
    const sections = new Map<string, Uint8Array>()
    const view = new DataView(wasmBinary.buffer, wasmBinary.byteOffset, wasmBinary.byteLength)

    // Skip WASM magic number (4 bytes) and version (4 bytes)
    let offset = 8

    while (offset < wasmBinary.length) {
        const sectionId = view.getUint8(offset)
        offset++

        const { value: sectionSize, bytesRead: sizeBytes } = readULEB128(view, offset)
        offset += sizeBytes

        if (sectionId === 0) { // Custom section
            const sectionStart = offset
            // Custom section name is LEB128 length-prefixed (NOT null-terminated)
            const { value: nameLen, bytesRead: nameLenBytes } = readULEB128(view, offset)
            offset += nameLenBytes
            // 🚀 Replaced new TextDecoder().decode() and .slice()
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

// ── DWARF .debug_line Parsing ──────────────────────────────────────

// DWARF line number program opcodes
const DW_LNS_copy = 1
const DW_LNS_advance_pc = 2
const DW_LNS_advance_line = 3
const DW_LNS_set_file = 4
const DW_LNS_set_column = 5
const DW_LNS_negate_stmt = 6
const DW_LNS_set_basic_block = 7
const DW_LNS_const_add_pc = 8
const DW_LNS_fixed_advance_pc = 9
const DW_LNS_set_prologue_end = 10
const DW_LNS_set_epilogue_begin = 11
const DW_LNS_set_isa = 12

// Extended opcodes
const DW_LNE_end_sequence = 1
const DW_LNE_set_address = 2
const DW_LNE_define_file = 3

function parseDebugLine(data: Uint8Array): { lineMap: LineMap; sourceFiles: string[] } {
    const lineMap: LineMap = {}
    const sourceFiles: string[] = []
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    let offset = 0

    while (offset < data.length) {
        const _unitStart = offset

        // Unit header
        const unitLength = view.getUint32(offset, true); offset += 4
        if (unitLength === 0) break

        const unitEnd = offset + unitLength
        const version = view.getUint16(offset, true); offset += 2

        if (version < 2 || version > 5) {
            // Skip unsupported DWARF version
            offset = unitEnd
            continue
        }

        // DWARF 5 has address_size and segment_selector_size before header_length
        if (version >= 5) {
            /* address_size */ offset += 1
            /* segment_selector_size */ offset += 1
        }

        const headerLength = view.getUint32(offset, true); offset += 4
        const afterHeader = offset + headerLength

        const minimumInstructionLength = view.getUint8(offset); offset += 1

        let _maximumOperationsPerInstruction = 1
        if (version >= 4) {
            _maximumOperationsPerInstruction = view.getUint8(offset); offset += 1
        }

        /* defaultIsStmt */ offset += 1
        const lineBase = view.getInt8(offset); offset += 1
        const lineRange = view.getUint8(offset); offset += 1
        const opcodeBase = view.getUint8(offset); offset += 1

        // Standard opcode lengths
        const standardOpcodeLengths: number[] = []
        for (let i = 1; i < opcodeBase; i++) {
            standardOpcodeLengths.push(view.getUint8(offset)); offset += 1
        }

        // DWARF 5: directory and file tables are different format
        if (version >= 5) {
            // Skip directory entry format
            const dirFormatCount = view.getUint8(offset); offset += 1
            for (let i = 0; i < dirFormatCount; i++) {
                readULEB128(view, offset); offset += readULEB128(view, offset).bytesRead
                readULEB128(view, offset); offset += readULEB128(view, offset).bytesRead
            }
            // Skip directory entries
            const { value: dirCount, bytesRead: dirCountBytes } = readULEB128(view, offset); offset += dirCountBytes
            for (let i = 0; i < dirCount; i++) {
                for (let j = 0; j < dirFormatCount; j++) {
                    // Read form-based entries — simplified, just skip strings/data
                    const str = readCString(data, offset)
                    offset += str.bytesRead
                }
            }

            // File entry format
            const fileFormatCount = view.getUint8(offset); offset += 1
            const fileFormats: { contentType: number; form: number }[] = []
            for (let i = 0; i < fileFormatCount; i++) {
                const { value: ct, bytesRead: b1 } = readULEB128(view, offset); offset += b1
                const { value: form, bytesRead: b2 } = readULEB128(view, offset); offset += b2
                fileFormats.push({ contentType: ct, form })
            }
            // File entries
            const { value: fileCount, bytesRead: fcb } = readULEB128(view, offset); offset += fcb
            for (let i = 0; i < fileCount; i++) {
                for (const fmt of fileFormats) {
                    if (fmt.form === 0x08 || fmt.form === 0x0e) { // DW_FORM_string or DW_FORM_strp
                        const str = readCString(data, offset)
                        if (fmt.contentType === 1) { // DW_LNCT_path
                            sourceFiles.push(str.value)
                        }
                        offset += str.bytesRead
                    } else if (fmt.form === 0x0b) { // DW_FORM_data1
                        offset += 1
                    } else if (fmt.form === 0x05) { // DW_FORM_data2
                        offset += 2
                    } else if (fmt.form === 0x06) { // DW_FORM_data4
                        offset += 4
                    } else {
                        const { bytesRead } = readULEB128(view, offset)
                        offset += bytesRead
                    }
                }
            }
        } else {
            // DWARF 2-4: directory table (null-terminated strings, ended by empty string)
            while (offset < afterHeader) {
                if (data[offset] === 0) { offset += 1; break }
                const { bytesRead } = readCString(data, offset)
                offset += bytesRead
            }

            // File table (entries ended by null byte)
            while (offset < afterHeader) {
                if (data[offset] === 0) { offset += 1; break }
                const { value: fileName, bytesRead: nameBytes } = readCString(data, offset)
                offset += nameBytes
                sourceFiles.push(fileName)
                // dir index, mtime, file size (all ULEB128)
                offset += readULEB128(view, offset).bytesRead
                offset += readULEB128(view, offset).bytesRead
                offset += readULEB128(view, offset).bytesRead
            }
        }

        // Jump to actual program start (after header)
        offset = afterHeader

        // Line number program state
        let address = 0
        let line = 1
        let _file = 1
        let isStmt = true
        let _endSequence = false

        // Execute line number program
        while (offset < unitEnd && offset < data.length) {
            const opcode = view.getUint8(offset); offset += 1

            if (opcode === 0) {
                // Extended opcode
                const { value: extLen, bytesRead: extLenBytes } = readULEB128(view, offset); offset += extLenBytes
                if (extLen === 0) continue
                const extOpcode = view.getUint8(offset); offset += 1

                switch (extOpcode) {
                    case DW_LNE_end_sequence:
                        _endSequence = true
                        // Add final entry
                        lineMap[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = line
                        // Reset state
                        address = 0; line = 1; _file = 1; isStmt = true; _endSequence = false
                        break
                    case DW_LNE_set_address:
                        // Read 4-byte address for WASM32
                        if (offset + 3 < data.length) {
                            address = view.getUint32(offset, true)
                        }
                        offset += extLen - 1
                        break
                    case DW_LNE_define_file:
                        offset += extLen - 1
                        break
                    default:
                        offset += extLen - 1
                        break
                }
            } else if (opcode < opcodeBase) {
                // Standard opcode
                switch (opcode) {
                    case DW_LNS_copy:
                        lineMap[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = line
                        break
                    case DW_LNS_advance_pc: {
                        const { value, bytesRead } = readULEB128(view, offset); offset += bytesRead
                        address += value * minimumInstructionLength
                        break
                    }
                    case DW_LNS_advance_line: {
                        const { value, bytesRead } = readSLEB128(view, offset); offset += bytesRead
                        line += value
                        break
                    }
                    case DW_LNS_set_file: {
                        const { value, bytesRead } = readULEB128(view, offset); offset += bytesRead
                        _file = value
                        break
                    }
                    case DW_LNS_set_column: {
                        readULEB128(view, offset); offset += readULEB128(view, offset).bytesRead
                        break
                    }
                    case DW_LNS_negate_stmt:
                        isStmt = !isStmt
                        break
                    case DW_LNS_set_basic_block:
                        break
                    case DW_LNS_const_add_pc: {
                        const adjustedOpcode = 255 - opcodeBase
                        address += Math.floor(adjustedOpcode / lineRange) * minimumInstructionLength
                        break
                    }
                    case DW_LNS_fixed_advance_pc:
                        address += view.getUint16(offset, true); offset += 2
                        break
                    case DW_LNS_set_prologue_end:
                    case DW_LNS_set_epilogue_begin:
                    case DW_LNS_set_isa:
                        if (opcode === DW_LNS_set_isa) {
                            offset += readULEB128(view, offset).bytesRead
                        }
                        break
                    default: {
                        // Unknown standard opcode — skip its operands
                        const argCount = standardOpcodeLengths[opcode - 1] || 0
                        for (let i = 0; i < argCount; i++) {
                            offset += readULEB128(view, offset).bytesRead
                        }
                        break
                    }
                }
            } else {
                // Special opcode
                const adjustedOpcode = opcode - opcodeBase
                address += Math.floor(adjustedOpcode / lineRange) * minimumInstructionLength
                line += lineBase + (adjustedOpcode % lineRange)
                lineMap[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = line
            }
        }

        // Ensure we advance to unit end
        offset = Math.max(offset, unitEnd)
    }

    return { lineMap, sourceFiles }
}

// ── DWARF .debug_info Parsing (simplified) ─────────────────────────

// DWARF tags we care about
const DW_TAG_variable = 0x34
const DW_TAG_formal_parameter = 0x05
const DW_TAG_structure_type = 0x13
const DW_TAG_class_type = 0x02
const DW_TAG_member = 0x0d
const DW_TAG_pointer_type = 0x0f
const DW_TAG_reference_type = 0x10
const DW_TAG_rvalue_reference_type = 0x42
const _DW_TAG_base_type = 0x24
const DW_TAG_typedef = 0x16
const DW_TAG_subprogram = 0x2e
const DW_TAG_const_type = 0x26
const DW_TAG_volatile_type = 0x35
const DW_TAG_restrict_type = 0x37

// DWARF attributes we care about
const DW_AT_name = 0x03
const DW_AT_type = 0x49
const DW_AT_byte_size = 0x0b
const DW_AT_data_member_location = 0x38
const DW_AT_location = 0x02
const DW_AT_decl_line = 0x3b

// DWARF forms
const DW_FORM_addr = 0x01
const DW_FORM_data1 = 0x0b
const DW_FORM_data2 = 0x05
const DW_FORM_data4 = 0x06
const DW_FORM_data8 = 0x07
const DW_FORM_string = 0x08
const DW_FORM_strp = 0x0e
const DW_FORM_block1 = 0x0a
const DW_FORM_block2 = 0x03
const DW_FORM_block4 = 0x04
const DW_FORM_block = 0x09
const DW_FORM_ref1 = 0x11
const DW_FORM_ref2 = 0x12
const DW_FORM_ref4 = 0x13
const DW_FORM_ref8 = 0x14
const DW_FORM_ref_udata = 0x15
const DW_FORM_flag = 0x0c
const DW_FORM_udata = 0x0f
const DW_FORM_sdata = 0x0d
const DW_FORM_sec_offset = 0x17
const DW_FORM_exprloc = 0x18
const DW_FORM_flag_present = 0x19
const DW_FORM_ref_addr = 0x10
const DW_FORM_strx = 0x1a
const DW_FORM_addrx = 0x1b
const DW_FORM_strx1 = 0x25
const DW_FORM_strx2 = 0x26
const DW_FORM_strx4 = 0x27
const DW_FORM_implicit_const = 0x21
const DW_FORM_line_strp = 0x1f
const DW_FORM_rnglistx = 0x23
const DW_FORM_loclistx = 0x22
const DW_FORM_ref_sig8 = 0x20
const DW_FORM_addrx1 = 0x29
const DW_FORM_addrx2 = 0x2a

interface AbbrevEntry {
    tag: number
    hasChildren: boolean
    attrs: { name: number; form: number; implicitConst?: number }[]
}

function parseAbbrevTable(data: Uint8Array, offset: number): Map<number, AbbrevEntry> {
    const table = new Map<number, AbbrevEntry>()
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    while (offset < data.length) {
        const { value: code, bytesRead: codeBytes } = readULEB128(view, offset); offset += codeBytes
        if (code === 0) break

        const { value: tag, bytesRead: tagBytes } = readULEB128(view, offset); offset += tagBytes
        const hasChildren = view.getUint8(offset) !== 0; offset += 1

        const attrs: AbbrevEntry['attrs'] = []
        while (offset < data.length) {
            const { value: attrName, bytesRead: anb } = readULEB128(view, offset); offset += anb
            const { value: attrForm, bytesRead: afb } = readULEB128(view, offset); offset += afb

            if (attrName === 0 && attrForm === 0) break

            let implicitConst: number | undefined
            if (attrForm === DW_FORM_implicit_const) {
                const { value, bytesRead } = readSLEB128(view, offset); offset += bytesRead
                implicitConst = value
            }

            attrs.push({ name: attrName, form: attrForm, implicitConst })
        }

        table.set(code, { tag, hasChildren, attrs })
    }

    return table
}

/** Skip over a DWARF form value, returning bytes consumed */
function skipFormValue(
    view: DataView,
    data: Uint8Array,
    offset: number,
    form: number,
    addressSize: number,
    is64: boolean,
): number {
    switch (form) {
        case DW_FORM_addr: return addressSize
        case DW_FORM_data1: case DW_FORM_ref1: case DW_FORM_flag: return 1
        case DW_FORM_data2: case DW_FORM_ref2: return 2
        case DW_FORM_data4: case DW_FORM_ref4: case DW_FORM_strp:
        case DW_FORM_sec_offset: case DW_FORM_ref_addr:
        case DW_FORM_line_strp: case DW_FORM_strx4: return is64 ? 8 : 4
        case DW_FORM_data8: case DW_FORM_ref8: case DW_FORM_ref_sig8: return 8
        case DW_FORM_string: return skipCString(data, offset) // 🚀 Skip without decoding
        case DW_FORM_block1: return 1 + view.getUint8(offset)
        case DW_FORM_block2: return 2 + view.getUint16(offset, true)
        case DW_FORM_block4: return 4 + view.getUint32(offset, true)
        case DW_FORM_block: case DW_FORM_exprloc: {
            const { value, bytesRead } = readULEB128(view, offset)
            return bytesRead + value
        }
        case DW_FORM_udata: case DW_FORM_ref_udata:
        case DW_FORM_strx: case DW_FORM_addrx:
        case DW_FORM_rnglistx: case DW_FORM_loclistx:
            return readULEB128(view, offset).bytesRead
        case DW_FORM_sdata: return readSLEB128(view, offset).bytesRead
        case DW_FORM_flag_present: return 0
        case DW_FORM_implicit_const: return 0
        case DW_FORM_strx1: case DW_FORM_addrx1: return 1
        case DW_FORM_strx2: case DW_FORM_addrx2: return 2
        default:
            console.warn(`[dwarf] Unknown FORM 0x${form.toString(16)} at offset ${offset}`)
            return 0
    }
}

/** Read a form value as a number (for sizes, offsets, refs) */
function readFormAsNumber(
    view: DataView,
    _data: Uint8Array,
    offset: number,
    form: number,
    addressSize: number,
): number | null {
    switch (form) {
        case DW_FORM_data1: case DW_FORM_ref1: case DW_FORM_flag:
        case DW_FORM_addrx1: case DW_FORM_strx1:
            return view.getUint8(offset)
        case DW_FORM_data2: case DW_FORM_ref2:
        case DW_FORM_addrx2: case DW_FORM_strx2:
            return view.getUint16(offset, true)
        case DW_FORM_data4: case DW_FORM_ref4: case DW_FORM_sec_offset:
        case DW_FORM_strp: case DW_FORM_ref_addr: case DW_FORM_strx4:
            return view.getUint32(offset, true)
        case DW_FORM_addr:
            return addressSize === 4
                ? view.getUint32(offset, true)
                : Number(view.getBigUint64(offset, true))
        case DW_FORM_udata: case DW_FORM_ref_udata:
        case DW_FORM_strx: case DW_FORM_addrx:
        case DW_FORM_rnglistx: case DW_FORM_loclistx:
            return readULEB128(view, offset).value
        case DW_FORM_sdata:
            return readSLEB128(view, offset).value
        default:
            return null
    }
}

/** Read a form value as a string */
function readFormAsString(data: Uint8Array, offset: number, form: number, debugStr?: Uint8Array): string | null {
    if (form === DW_FORM_string) {
        return readCString(data, offset).value
    }
    if ((form === DW_FORM_strp || form === DW_FORM_line_strp) && debugStr) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
        const strOffset = view.getUint32(offset, true)
        if (strOffset < debugStr.length) {
            return readCString(debugStr, strOffset).value
        }
    }
    return null
}

/** Parse .debug_info for basic variable and type information */
function parseDebugInfo(
    debugInfo: Uint8Array,
    debugAbbrev: Uint8Array,
    debugStr?: Uint8Array,
): { variables: VariableInfo[]; types: Record<string, StructInfo> } {
    const variables: VariableInfo[] = []
    const types: Record<string, StructInfo> = {}
    const view = new DataView(debugInfo.buffer, debugInfo.byteOffset, debugInfo.byteLength)

    // Track type references for resolution
    const typeMap = new Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>()
    const pendingStructMembers = new Map<number, { name: string; offset: number; typeRef?: number }[]>()

    let offset = 0

    while (offset < debugInfo.length) {
        const unitStart = offset

        // Compilation unit header
        const unitLength = view.getUint32(offset, true); offset += 4
        if (unitLength === 0 || unitLength >= 0xFFFFFFF0) break

        const unitEnd = unitStart + 4 + unitLength
        const version = view.getUint16(offset, true); offset += 2

        let abbrevOffset: number
        let addressSize: number

        if (version >= 5) {
            /* unit type */ offset += 1
            addressSize = view.getUint8(offset); offset += 1
            abbrevOffset = view.getUint32(offset, true); offset += 4
        } else {
            abbrevOffset = view.getUint32(offset, true); offset += 4
            addressSize = view.getUint8(offset); offset += 1
        }

        // Parse abbreviation table for this unit
        const abbrevTable = parseAbbrevTable(debugAbbrev, abbrevOffset)

        // Current struct context for member parsing
        let currentStructOffset: number | null = null

        // 🚨 TRACK DWARF TREE DEPTH to know what function we are inside
        const dieStack: { tag: number, name: string }[] = []

        // Deferred variables — type resolution happens after all DIEs are collected
        const pendingVars: { name: string; typeRef: number | undefined; stackOffset: number; declLine: number; funcName: string }[] = []

        // Process DIEs
        while (offset < unitEnd && offset < debugInfo.length) {
            const dieOffset = offset

            const { value: abbrevCode, bytesRead: acb } = readULEB128(view, offset); offset += acb

            // 🚨 A null DIE (0) means the current AST node ended. Pop the tree stack!
            if (abbrevCode === 0) {
                dieStack.pop()
                currentStructOffset = null
                continue
            }

            const abbrev = abbrevTable.get(abbrevCode)
            if (!abbrev) {
                // Can't parse further without abbrev info
                offset = unitEnd
                break
            }

            // Extract attribute values for this DIE
            let dieName: string | undefined
            let dieSize: number | undefined
            let dieTypeRef: number | undefined
            let dieMemberLoc: number | undefined
            let dieStackOffset: number | undefined
            let dieDeclLine: number | undefined

            for (const attr of abbrev.attrs) {
                const attrStart = offset

                if (attr.form === DW_FORM_implicit_const) {
                    // Value was stored in abbreviation table
                    if (attr.name === DW_AT_byte_size) dieSize = attr.implicitConst
                    if (attr.name === DW_AT_data_member_location) dieMemberLoc = attr.implicitConst
                    continue
                }

                // Read name
                if (attr.name === DW_AT_name) {
                    dieName = readFormAsString(debugInfo, offset, attr.form, debugStr) ?? undefined
                }

                // Read byte_size
                if (attr.name === DW_AT_byte_size) {
                    dieSize = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize) ?? undefined
                }

                // Read declaration line
                if (attr.name === DW_AT_decl_line) {
                    dieDeclLine = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize) ?? undefined
                }

                // Read type reference
                if (attr.name === DW_AT_type) {
                    const ref = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize)
                    if (ref !== null) {
                        // ref4/ref1/ref2/ref_udata values are offsets from compilation unit start
                        dieTypeRef = (attr.form === DW_FORM_ref4 || attr.form === DW_FORM_ref1 ||
                            attr.form === DW_FORM_ref2 || attr.form === DW_FORM_ref_udata)
                            ? unitStart + ref
                            : ref
                    }
                }

                // Read member location
                if (attr.name === DW_AT_data_member_location) {
                    dieMemberLoc = readFormAsNumber(view, debugInfo, offset, attr.form, addressSize) ?? undefined
                }

                // Read variable location (for stack offset)
                if (attr.name === DW_AT_location) {
                    if (attr.form === DW_FORM_exprloc || attr.form === DW_FORM_block1) {
                        const lenSize = attr.form === DW_FORM_block1 ? 1 : readULEB128(view, offset).bytesRead
                        const blockLen = attr.form === DW_FORM_block1
                            ? view.getUint8(offset)
                            : readULEB128(view, offset).value
                        const blockStart = offset + lenSize

                        // Parse simple DW_OP_fbreg location expressions
                        if (blockLen >= 2 && blockStart < debugInfo.length) {
                            const op = view.getUint8(blockStart)
                            if (op === 0x91) { // DW_OP_fbreg
                                const { value } = readSLEB128(view, blockStart + 1)
                                dieStackOffset = value
                            }
                        }
                    }
                }

                // Skip the form value
                const skip = skipFormValue(view, debugInfo, offset, attr.form, addressSize, false)
                offset = attrStart + skip
            }

            // Record type information
            typeMap.set(dieOffset, {
                tag: abbrev.tag,
                name: dieName,
                size: dieSize,
                typeRef: dieTypeRef,
            })

            // Process the DIE based on its tag
            if (abbrev.tag === DW_TAG_structure_type || abbrev.tag === DW_TAG_class_type) {
                if (dieName && dieSize !== undefined) {
                    currentStructOffset = dieOffset
                    pendingStructMembers.set(dieOffset, [])
                    types[dieName] = {
                        name: dieName,
                        size: dieSize,
                        members: [],
                    }
                }
            } else if (abbrev.tag === DW_TAG_member && currentStructOffset !== null) {
                const members = pendingStructMembers.get(currentStructOffset)
                if (members && dieName !== undefined && dieMemberLoc !== undefined) {
                    members.push({
                        name: dieName,
                        offset: dieMemberLoc,
                        typeRef: dieTypeRef,
                    })
                }
            } else if ((abbrev.tag === DW_TAG_variable || abbrev.tag === DW_TAG_formal_parameter) && dieName) {
                // 🚨 Look up the AST stack to find the parent function!
                let funcName = 'global'
                for (let i = dieStack.length - 1; i >= 0; i--) {
                    if (dieStack[i].tag === DW_TAG_subprogram) {
                        funcName = dieStack[i].name || 'unknown'
                        break
                    }
                }

                // Collect raw variable data — type resolution is DEFERRED until after all DIEs are parsed
                if (dieStackOffset !== undefined && !funcName.startsWith('__') && !dieName.startsWith('__')) {
                    pendingVars.push({
                        name: dieName,
                        typeRef: dieTypeRef,
                        stackOffset: dieStackOffset,
                        declLine: dieDeclLine ?? 0,
                        funcName,
                    })
                }
            }

            // 🚨 PUSH AST NODE to stack AFTER processing so it isn't its own parent!
            if (abbrev.hasChildren) {
                dieStack.push({ tag: abbrev.tag, name: dieName || '' })
            }
        }

        // ═══ DEFERRED TYPE RESOLUTION ═══
        // Now that ALL DIEs in this unit are processed, typeMap is complete.
        // Resolve types for collected variables (fixes forward-reference issue).
        for (const pv of pendingVars) {
            const typeName = pv.typeRef ? resolveTypeName(typeMap, pv.typeRef) : 'unknown'
            const typeSize = pv.typeRef ? resolveTypeSize(typeMap, pv.typeRef) : 0
            const pointer = isPointerType(typeMap, pv.typeRef)

            variables.push({
                name: pv.name,
                type: typeName,
                size: typeSize,
                stackOffset: pv.stackOffset,
                isPointer: pointer,
                pointeeType: pointer && pv.typeRef ? resolvePointeeType(typeMap, pv.typeRef) : undefined,
                declLine: pv.declLine,
                funcName: pv.funcName,
            })
        }

        // Deferred struct member type resolution
        // Solves the forward-reference bug for recursive structures (e.g., Node* next)
        for (const [structOff, members] of pendingStructMembers) {
            const info = typeMap.get(structOff)
            if (info?.name && types[info.name]) {
                types[info.name].members = members.map(m => {
                    const memberType = m.typeRef ? resolveTypeName(typeMap, m.typeRef) : 'unknown'
                    const memberSize = m.typeRef ? resolveTypeSize(typeMap, m.typeRef) : 0
                    const isPtr = isPointerType(typeMap, m.typeRef)
                    return {
                        name: m.name,
                        offset: m.offset,
                        type: memberType,
                        size: memberSize,
                        isPointer: isPtr,
                        pointeeType: isPtr && m.typeRef ? resolvePointeeType(typeMap, m.typeRef) : undefined,
                    }
                })
            }
        }

        offset = Math.max(offset, unitEnd)
    }

    return { variables, types }
}

// ── Type Resolution Helpers ────────────────────────────────────────

function cleanTypeName(name: string): string {
    if (!name) return 'unknown'
    // Full libc++ internal names
    if (name.startsWith('std::__1::basic_string') || name.startsWith('std::__2::basic_string')) return 'std::string'
    if (name.startsWith('std::__1::vector') || name.startsWith('std::__2::vector')) {
        const match = name.match(/<([^,]+)/)
        if (match) return `std::vector<${cleanTypeName(match[1].trim())}>`
    }
    // Bare names from DWARF typedefs (clang often omits namespace prefix)
    if (name === 'string' || name === 'std::string') return 'std::string'
    if (name.startsWith('basic_string')) return 'std::string'
    if (name === 'vector' || name.startsWith('vector<')) {
        const match = name.match(/<([^,]+)/)
        if (match) return `std::vector<${cleanTypeName(match[1].trim())}>`
        return 'std::vector<unknown>'
    }
    return name
}

function resolveTypeName(
    typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>,
    offset: number | undefined,
    depth = 0,
): string {
    if (offset === undefined || depth > 10) return 'unknown'

    const info = typeMap.get(offset)
    if (!info) return 'unknown'

    if (info.tag === DW_TAG_pointer_type) return `${resolveTypeName(typeMap, info.typeRef, depth + 1)}*`
    if (info.tag === DW_TAG_reference_type) return `${resolveTypeName(typeMap, info.typeRef, depth + 1)}&`
    if (info.tag === DW_TAG_rvalue_reference_type) return `${resolveTypeName(typeMap, info.typeRef, depth + 1)}&&`

    if (info.tag === DW_TAG_typedef || info.tag === DW_TAG_const_type || info.tag === DW_TAG_volatile_type || info.tag === DW_TAG_restrict_type) {
        // For typedefs: try cleaning the name first; if it resolves to something useful, use it.
        // Otherwise follow through to the underlying type for better resolution.
        if (info.name) {
            const cleaned = cleanTypeName(info.name)
            // If cleanTypeName actually transformed it (std:: prefix), use it
            if (cleaned !== info.name) return cleaned
        }
        // Follow through to underlying type
        if (info.typeRef !== undefined) return resolveTypeName(typeMap, info.typeRef, depth + 1)
        if (info.name) return cleanTypeName(info.name)
        return 'unknown'
    }

    return cleanTypeName(info.name ?? 'unknown')
}

function resolveTypeSize(
    typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>,
    offset: number | undefined,
    depth = 0,
): number {
    if (offset === undefined || depth > 10) return 0

    const info = typeMap.get(offset)
    if (!info) return 0

    if (info.size !== undefined) return info.size

    if (info.tag === DW_TAG_pointer_type || info.tag === DW_TAG_reference_type || info.tag === DW_TAG_rvalue_reference_type) return 4 // WASM32

    return resolveTypeSize(typeMap, info.typeRef, depth + 1)
}

function isPointerType(
    typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>,
    offset: number | undefined,
    depth = 0,
): boolean {
    if (offset === undefined || depth > 10) return false

    const info = typeMap.get(offset)
    if (!info) return false

    if (info.tag === DW_TAG_pointer_type || info.tag === DW_TAG_reference_type || info.tag === DW_TAG_rvalue_reference_type) return true
    // Follow transparent type wrappers
    if (info.tag === DW_TAG_typedef || info.tag === DW_TAG_const_type
        || info.tag === DW_TAG_volatile_type || info.tag === DW_TAG_restrict_type) {
        return isPointerType(typeMap, info.typeRef, depth + 1)
    }

    return false
}

function resolvePointeeType(
    typeMap: Map<number, { tag: number; name?: string; size?: number; typeRef?: number }>,
    offset: number | undefined,
    depth = 0,
): string | undefined {
    if (offset === undefined || depth > 10) return undefined

    const info = typeMap.get(offset)
    if (!info) return undefined

    if (info.tag === DW_TAG_pointer_type || info.tag === DW_TAG_reference_type || info.tag === DW_TAG_rvalue_reference_type) {
        return resolveTypeName(typeMap, info.typeRef, depth + 1)
    }

    // Follow transparent type wrappers
    if (info.tag === DW_TAG_typedef || info.tag === DW_TAG_const_type
        || info.tag === DW_TAG_volatile_type || info.tag === DW_TAG_restrict_type) {
        return resolvePointeeType(typeMap, info.typeRef, depth + 1)
    }

    return undefined
}

// ── Main Parser ────────────────────────────────────────────────────

/**
 * Parse DWARF debug info from a compiled WASM binary.
 * Returns line mappings, variable info, and struct types.
 */
export function parseDwarf(wasmBinary: Uint8Array): DwarfInfo {
    try {
        console.time('[dwarf] parse')

        const sections = extractCustomSections(wasmBinary)

        const debugLine = sections.get('.debug_line')
        const debugInfoSection = sections.get('.debug_info')
        const debugAbbrev = sections.get('.debug_abbrev')
        const debugStr = sections.get('.debug_str')

        if (!debugLine && !debugInfoSection) {
            console.warn('[dwarf] No DWARF sections found — was the binary compiled with -g?')
            return EMPTY_DWARF
        }

        // Parse line info
        let lineMap: LineMap = {}
        let sourceFiles: string[] = []
        if (debugLine) {
            const lineResult = parseDebugLine(debugLine)
            lineMap = lineResult.lineMap
            sourceFiles = lineResult.sourceFiles
        }

        // Parse debug info (variables + types)
        let variables: VariableInfo[] = []
        let typeInfo: Record<string, StructInfo> = {}
        if (debugInfoSection && debugAbbrev) {
            const infoResult = parseDebugInfo(debugInfoSection, debugAbbrev, debugStr)
            variables = infoResult.variables
            typeInfo = infoResult.types
        }

        console.timeEnd('[dwarf] parse')
        console.log(`[dwarf] ${Object.keys(lineMap).length} line entries, ${variables.length} variables, ${Object.keys(typeInfo).length} types`)

        return { lineMap, variables, types: typeInfo, sourceFiles }
    } catch (err) {
        console.error('[dwarf] Parse failed:', err)
        return EMPTY_DWARF
    }
}
