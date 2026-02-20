// ── DWARF Type Definitions ─────────────────────────────────────────
// Interfaces for the parsed DWARF debug information extracted from WASM.

/** Maps a WASM instruction byte-offset (hex string) to a C++ source line number */
export type LineMap = Record<string, number>

/** Information about a single local variable */
export interface VariableInfo {
    name: string
    type: string              // e.g. "int", "Node*", "float"
    size: number              // byte size
    stackOffset?: number      // offset from stack pointer (optional — not all vars have locations)
    isPointer: boolean        // true for pointer types
    pointeeType?: string      // type being pointed to (for pointers)
    funcName: string          // owning function name (for scope filtering)
    declLine: number          // source line where declared (for time-travel filtering)
}

/** A member of a struct/class */
export interface StructMember {
    name: string
    offset: number            // byte offset within the struct
    type: string
    size: number
    isPointer: boolean
    pointeeType?: string      // type being pointed to (for pointers)
}

/** A struct/class type definition */
export interface StructInfo {
    name: string
    size: number
    members: StructMember[]
}

/** Complete DWARF debug info extracted from a WASM binary */
export interface DwarfInfo {
    /** Maps WASM byte-offset (hex, e.g. "0x01A4") → C++ source line number */
    lineMap: LineMap

    /** Local variables found in function scopes (array, not dict) */
    variables: VariableInfo[]

    /** Struct/class type definitions */
    types: Record<string, StructInfo>

    /** The source file names referenced in the DWARF info */
    sourceFiles: string[]
}

/** Empty DWARF info constant for when no debug data is available */
export const EMPTY_DWARF: DwarfInfo = {
    lineMap: {},
    variables: [],
    types: {},
    sourceFiles: [],
}
