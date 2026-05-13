// Minimal LSP types — just what nova talks to clangd about. We intentionally
// don't pull `vscode-languageserver-protocol` because its types come with a
// massive transitive dep tree and we use only a handful of methods.

// LSP params/results are JSON-serializable values whose shape varies per
// method. We use `unknown` rather than a recursive `Json` type because TS
// can't unify ad-hoc literal objects (e.g. `{position: {line:0,character:0}}`)
// with a recursive index-signature type — every call site would need a cast.
// Callers `as`-cast the result at the boundary, then enjoy strong types.
export type LspParams = unknown

export interface LspRequest {
    jsonrpc: '2.0'
    id: number | string
    method: string
    params?: LspParams
}

export interface LspResponse {
    jsonrpc: '2.0'
    id: number | string
    result?: LspParams
    error?: { code: number; message: string; data?: LspParams }
}

export interface LspNotification {
    jsonrpc: '2.0'
    method: string
    params?: LspParams
}

export type LspMessage = LspRequest | LspResponse | LspNotification

export interface Position {
    line: number
    character: number
}

export interface Range {
    start: Position
    end: Position
}

export interface TextEdit {
    range: Range
    newText: string
}

export interface Diagnostic {
    range: Range
    severity?: 1 | 2 | 3 | 4
    code?: string | number
    source?: string
    message: string
    relatedInformation?: Array<{
        location: { uri: string; range: Range }
        message: string
    }>
}

export interface PublishDiagnosticsParams {
    uri: string
    diagnostics: Diagnostic[]
    version?: number
}

export interface CompletionItem {
    label: string
    kind?: number
    detail?: string
    documentation?: string | { kind: 'markdown' | 'plaintext'; value: string }
    sortText?: string
    filterText?: string
    insertText?: string
    insertTextFormat?: 1 | 2 // Plain | Snippet
    textEdit?: TextEdit | { insert: Range; replace: Range; newText: string }
    additionalTextEdits?: TextEdit[]
    deprecated?: boolean
    preselect?: boolean
}

export interface CompletionList {
    isIncomplete: boolean
    items: CompletionItem[]
}

export interface Hover {
    contents:
        | string
        | { kind: 'markdown' | 'plaintext'; value: string }
        | Array<string | { language: string; value: string }>
    range?: Range
}

export interface SignatureInformation {
    label: string
    documentation?: string | { kind: 'markdown' | 'plaintext'; value: string }
    parameters?: Array<{
        label: string | [number, number]
        documentation?: string | { kind: 'markdown' | 'plaintext'; value: string }
    }>
    activeParameter?: number
}

export interface SignatureHelp {
    signatures: SignatureInformation[]
    activeSignature?: number
    activeParameter?: number
}

export interface Location {
    uri: string
    range: Range
}

export interface DocumentSymbol {
    name: string
    detail?: string
    kind: number
    range: Range
    selectionRange: Range
    children?: DocumentSymbol[]
}

// Compat alias for the few spots in `providers.ts` that just want "some
// JSON-shaped thing". Same as LspParams but named to match what those types
// were called pre-refactor.
export type Json = LspParams

// ===== Worker bridge protocol (main thread <-> clangd worker) =====

export type ClientToWorker =
    | { type: 'lsp'; message: LspMessage }
    | { type: 'fs:write'; path: string; content: string }
    | { type: 'fs:delete'; path: string }
    | { type: 'fs:writeAll'; files: Record<string, string> }

export type WorkerToClient =
    | { type: 'ready' }
    | { type: 'progress'; loaded: number; total: number }
    | { type: 'lsp'; message: LspMessage }
    | { type: 'error'; message: string }
