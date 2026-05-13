// Bridges between clangd's LSP messages and Monaco's provider APIs. We
// deliberately don't go through `monaco-languageclient` — pulling that in
// would require swapping `monaco-editor` for the `@codingame/monaco-vscode-*`
// fork, which is a huge dep tree and a breaking change for the rest of nova.
// Direct providers are ~200 LOC and let us hand-pick which LSP features to
// expose; lower-priority features (rename, code actions, formatting) can be
// added in follow-ups without touching this layer's shape.

import type { editor, IDisposable, Position, Range } from 'monaco-editor'
import type * as monaco from 'monaco-editor'

import type { ClangdClient } from './ClangdClient'
import { isCppPath, toClangdUri } from './config'
import type {
    CompletionItem as LspCompletionItem,
    CompletionList,
    Diagnostic,
    DocumentSymbol,
    Hover,
    Location,
    Position as LspPosition,
    PublishDiagnosticsParams,
    Range as LspRange,
    SignatureHelp,
} from './lsp-types'

type MonacoNs = typeof monaco

// ---------- Position / range conversions ----------

function toLspPos(pos: Position): LspPosition {
    return { line: pos.lineNumber - 1, character: pos.column - 1 }
}

function toMonacoRange(monacoNs: MonacoNs, r: LspRange): Range {
    return new monacoNs.Range(
        r.start.line + 1,
        r.start.character + 1,
        r.end.line + 1,
        r.end.character + 1,
    )
}

// ---------- Enum conversions ----------

// LSP CompletionItemKind → Monaco CompletionItemKind.
// Monaco's enum is intentionally similar to LSP's but the values differ; we
// can't just cast. Maps unknown kinds to Text.
function completionKind(monacoNs: MonacoNs, lspKind: number | undefined): monaco.languages.CompletionItemKind {
    const K = monacoNs.languages.CompletionItemKind
    switch (lspKind) {
        case 1: return K.Text
        case 2: return K.Method
        case 3: return K.Function
        case 4: return K.Constructor
        case 5: return K.Field
        case 6: return K.Variable
        case 7: return K.Class
        case 8: return K.Interface
        case 9: return K.Module
        case 10: return K.Property
        case 11: return K.Unit
        case 12: return K.Value
        case 13: return K.Enum
        case 14: return K.Keyword
        case 15: return K.Snippet
        case 16: return K.Color
        case 17: return K.File
        case 18: return K.Reference
        case 19: return K.Folder
        case 20: return K.EnumMember
        case 21: return K.Constant
        case 22: return K.Struct
        case 23: return K.Event
        case 24: return K.Operator
        case 25: return K.TypeParameter
        default: return K.Text
    }
}

function diagSeverity(monacoNs: MonacoNs, lspSev: number | undefined): monaco.MarkerSeverity {
    const S = monacoNs.MarkerSeverity
    switch (lspSev) {
        case 1: return S.Error
        case 2: return S.Warning
        case 3: return S.Info
        case 4: return S.Hint
        default: return S.Info
    }
}

// LSP SymbolKind is 1-indexed (File=1, …, TypeParameter=26). Monaco's enum
// is 0-indexed (File=0, …, TypeParameter=25). Same names, off by one.
// Verified against monaco-editor/monaco.d.ts — File: 0, Module: 1, …,
// TypeParameter: 25.
function symbolKind(monacoNs: MonacoNs, lspKind: number): monaco.languages.SymbolKind {
    const K = monacoNs.languages.SymbolKind
    if (lspKind < 1 || lspKind > 26) return K.Variable
    return (lspKind - 1) as monaco.languages.SymbolKind
}

// LSP CompletionTriggerKind: 1=Invoked, 2=TriggerCharacter, 3=TriggerForIncompleteCompletions
// Monaco CompletionTriggerKind: 0=Invoke, 1=TriggerCharacter, 2=TriggerForIncompleteCompletions
function toLspTriggerKind(m: monaco.languages.CompletionTriggerKind): 1 | 2 | 3 {
    return (m + 1) as 1 | 2 | 3
}

// Hoist outside the loop so clearClangdMarkers and the diagnostic handler
// share one truth.
const DIAG_OWNER = 'clangd'

// ---------- Text edit conversion ----------

function applyCompletionTextEdit(
    monacoNs: MonacoNs,
    item: LspCompletionItem,
    fallbackRange: Range,
): { range: Range | monaco.languages.CompletionItemRanges; insertText: string } {
    const insertText = item.insertText ?? item.label

    if (item.textEdit) {
        if ('range' in item.textEdit) {
            return { range: toMonacoRange(monacoNs, item.textEdit.range), insertText: item.textEdit.newText }
        }
        // InsertReplaceEdit: monaco supports it natively via insert+replace.
        return {
            range: {
                insert: toMonacoRange(monacoNs, item.textEdit.insert),
                replace: toMonacoRange(monacoNs, item.textEdit.replace),
            },
            insertText: item.textEdit.newText,
        }
    }

    return { range: fallbackRange, insertText }
}

function applyAdditionalEdits(
    monacoNs: MonacoNs,
    item: LspCompletionItem,
): monaco.languages.CompletionItem['additionalTextEdits'] {
    const edits = item.additionalTextEdits
    if (!edits || edits.length === 0) return undefined
    return edits.map((e) => ({
        range: toMonacoRange(monacoNs, e.range),
        text: e.newText,
    }))
}

// ---------- Hover content conversion ----------

function hoverContent(h: Hover): monaco.IMarkdownString[] {
    const out: monaco.IMarkdownString[] = []
    const c = h.contents
    const push = (text: string) => {
        if (text.trim().length > 0) out.push({ value: text })
    }
    if (typeof c === 'string') {
        push(c)
    } else if (Array.isArray(c)) {
        for (const part of c) {
            if (typeof part === 'string') push(part)
            else push('```' + part.language + '\n' + part.value + '\n```')
        }
    } else if (c && typeof c === 'object' && 'value' in c) {
        // MarkupContent
        push(c.value)
    }
    return out
}

function markdownify(
    s: string | { kind: 'markdown' | 'plaintext'; value: string } | undefined,
): string | undefined {
    if (!s) return undefined
    if (typeof s === 'string') return s
    return s.value
}

// ---------- Document sync ----------

/**
 * Keeps clangd's view of every C/C++ model in sync with Monaco's. Mirrors the
 * textDocument/didOpen | didChange | didClose handshake so completions, hover,
 * and diagnostics see the same text the user is looking at.
 *
 * One sync per Monaco model: we observe `onDidCreateModel`/`onWillDisposeModel`
 * to catch tab opens/closes/file renames. Each opened doc owns one content
 * subscription that we dispose alongside the close notification.
 */
// Models are keyed by full URI (`scheme://path`) rather than just path: two
// in-memory schemes could collide on path alone, and toClangdUri stringifies
// a different value anyway.
class DocumentSync {
    private readonly opened = new Map<string, IDisposable>()
    private readonly disposables: IDisposable[] = []
    private readonly client: ClangdClient

    constructor(monacoNs: MonacoNs, client: ClangdClient) {
        this.client = client
        monacoNs.editor.getModels().forEach((m) => this.openIfCpp(m))
        this.disposables.push(monacoNs.editor.onDidCreateModel((m) => this.openIfCpp(m)))
        this.disposables.push(monacoNs.editor.onWillDisposeModel((m) => this.close(m)))
    }

    dispose() {
        for (const d of this.disposables) d.dispose()
        for (const sub of this.opened.values()) sub.dispose()
        this.opened.clear()
    }

    private openIfCpp(model: editor.ITextModel) {
        const path = model.uri.path
        const key = model.uri.toString()
        if (!isCppPath(path) || this.opened.has(key)) return

        const uri = toClangdUri(path)
        this.client.notify('textDocument/didOpen', {
            textDocument: { uri, languageId: 'cpp', version: 1, text: model.getValue() },
        })

        // didChange alone is authoritative for the open file. We deliberately
        // don't also `writeFile` to clangd's FS on every keystroke: the
        // 500 ms watchdog in ClangdContext handles header content used by
        // *other* open files for include resolution, and posting the whole
        // document over postMessage on every keystroke just burns bandwidth.
        let version = 1
        const sub = model.onDidChangeContent((e) => {
            version++
            this.client.notify('textDocument/didChange', {
                textDocument: { uri, version },
                contentChanges: e.changes.map((c) => ({
                    range: {
                        start: { line: c.range.startLineNumber - 1, character: c.range.startColumn - 1 },
                        end: { line: c.range.endLineNumber - 1, character: c.range.endColumn - 1 },
                    },
                    rangeLength: c.rangeLength,
                    text: c.text,
                })),
            })
        })
        this.opened.set(key, sub)
    }

    private close(model: editor.ITextModel) {
        const key = model.uri.toString()
        const sub = this.opened.get(key)
        if (!sub) return
        sub.dispose()
        this.opened.delete(key)
        this.client.notify('textDocument/didClose', {
            textDocument: { uri: toClangdUri(model.uri.path) },
        })
    }
}

// Bridge a Monaco CancellationToken into a fetch-style AbortSignal. Monaco's
// token has `onCancellationRequested` + `isCancellationRequested`; we want
// the standard signal shape so ClangdClient stays Monaco-agnostic.
function signalFromToken(token: monaco.CancellationToken): AbortSignal {
    const ctl = new AbortController()
    if (token.isCancellationRequested) ctl.abort()
    else token.onCancellationRequested(() => ctl.abort())
    return ctl.signal
}

// ---------- Provider registrations ----------

interface RegisterOptions {
    /** Language IDs that clangd should answer for. */
    languages: string[]
}

export function registerClangdProviders(
    monacoNs: MonacoNs,
    client: ClangdClient,
    opts: RegisterOptions = { languages: ['cpp', 'c'] },
): IDisposable {
    const disposables: IDisposable[] = []
    const sync = new DocumentSync(monacoNs, client)
    disposables.push({ dispose: () => sync.dispose() })

    for (const lang of opts.languages) {
        disposables.push(monacoNs.languages.registerCompletionItemProvider(lang, {
            // Mirrors upstream clangd-in-browser. Avoiding space/`/`/`*`/`#`/`"`
            // here cuts spurious requests fired inside comments and strings.
            triggerCharacters: ['.', '>', ':'],
            provideCompletionItems: async (model, position, context, token) => {
                if (!isCppPath(model.uri.path)) return { suggestions: [] }
                const word = model.getWordUntilPosition(position)
                const fallbackRange = new monacoNs.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn,
                )
                try {
                    const raw = await client.request<CompletionList | LspCompletionItem[] | null>(
                        'textDocument/completion',
                        {
                            textDocument: { uri: toClangdUri(model.uri.path) },
                            position: toLspPos(position),
                            context: {
                                triggerKind: toLspTriggerKind(context.triggerKind),
                                ...(context.triggerCharacter
                                    ? { triggerCharacter: context.triggerCharacter }
                                    : {}),
                            },
                        },
                        signalFromToken(token),
                    )
                    if (!raw) return { suggestions: [] }
                    const items: LspCompletionItem[] = Array.isArray(raw) ? raw : raw.items
                    const isIncomplete = Array.isArray(raw) ? false : raw.isIncomplete
                    return {
                        incomplete: isIncomplete,
                        suggestions: items.map((item) => {
                            const { range, insertText } = applyCompletionTextEdit(monacoNs, item, fallbackRange)
                            const suggestion: monaco.languages.CompletionItem = {
                                label: item.label,
                                kind: completionKind(monacoNs, item.kind),
                                detail: item.detail,
                                documentation: typeof item.documentation === 'string'
                                    ? item.documentation
                                    : item.documentation?.value,
                                sortText: item.sortText,
                                filterText: item.filterText,
                                preselect: item.preselect,
                                insertText,
                                range,
                                insertTextRules: item.insertTextFormat === 2
                                    ? monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet
                                    : monacoNs.languages.CompletionItemInsertTextRule.None,
                                additionalTextEdits: applyAdditionalEdits(monacoNs, item),
                            }
                            // LSP 3.15+ replaced the boolean `deprecated`
                            // field with `tags: [Deprecated]`. Honour both —
                            // older clangd builds still emit the boolean.
                            const deprecated =
                                item.deprecated ||
                                (Array.isArray(item.tags) && item.tags.includes(1))
                            if (deprecated) {
                                suggestion.tags = [monacoNs.languages.CompletionItemTag.Deprecated]
                            }
                            return suggestion
                        }),
                    }
                } catch (err) {
                    if (!isCancellation(err)) console.warn('[clangd] completion failed', err)
                    return { suggestions: [] }
                }
            },
        }))

        disposables.push(monacoNs.languages.registerHoverProvider(lang, {
            provideHover: async (model, position, token) => {
                if (!isCppPath(model.uri.path)) return null
                try {
                    const hover = await client.request<Hover | null>('textDocument/hover', {
                        textDocument: { uri: toClangdUri(model.uri.path) },
                        position: toLspPos(position),
                    }, signalFromToken(token))
                    if (!hover) return null
                    return {
                        range: hover.range ? toMonacoRange(monacoNs, hover.range) : undefined,
                        contents: hoverContent(hover),
                    }
                } catch (err) {
                    if (!isCancellation(err)) console.warn('[clangd] hover failed', err)
                    return null
                }
            },
        }))

        disposables.push(monacoNs.languages.registerSignatureHelpProvider(lang, {
            signatureHelpTriggerCharacters: ['(', ','],
            signatureHelpRetriggerCharacters: [')'],
            provideSignatureHelp: async (model, position, token) => {
                if (!isCppPath(model.uri.path)) return null
                try {
                    const help = await client.request<SignatureHelp | null>(
                        'textDocument/signatureHelp',
                        {
                            textDocument: { uri: toClangdUri(model.uri.path) },
                            position: toLspPos(position),
                        },
                        signalFromToken(token),
                    )
                    if (!help || !help.signatures || help.signatures.length === 0) return null
                    return {
                        value: {
                            signatures: help.signatures.map((s) => ({
                                label: s.label,
                                documentation: markdownify(s.documentation),
                                parameters: (s.parameters ?? []).map((p) => ({
                                    label: p.label,
                                    documentation: markdownify(p.documentation),
                                })),
                                activeParameter: s.activeParameter,
                            })),
                            activeSignature: help.activeSignature ?? 0,
                            activeParameter: help.activeParameter ?? 0,
                        },
                        dispose: () => {},
                    }
                } catch (err) {
                    if (!isCancellation(err)) console.warn('[clangd] signatureHelp failed', err)
                    return null
                }
            },
        }))

        disposables.push(monacoNs.languages.registerDefinitionProvider(lang, {
            provideDefinition: async (model, position, token) => {
                if (!isCppPath(model.uri.path)) return null
                try {
                    const res = await client.request<Location | Location[] | null>(
                        'textDocument/definition',
                        {
                            textDocument: { uri: toClangdUri(model.uri.path) },
                            position: toLspPos(position),
                        },
                        signalFromToken(token),
                    )
                    if (!res) return null
                    const locs = Array.isArray(res) ? res : [res]
                    return locs.map((l) => ({
                        uri: monacoNs.Uri.parse(l.uri),
                        range: toMonacoRange(monacoNs, l.range),
                    }))
                } catch (err) {
                    if (!isCancellation(err)) console.warn('[clangd] definition failed', err)
                    return null
                }
            },
        }))

        disposables.push(monacoNs.languages.registerDocumentSymbolProvider(lang, {
            displayName: 'clangd',
            provideDocumentSymbols: async (model, token) => {
                if (!isCppPath(model.uri.path)) return []
                try {
                    const res = await client.request<DocumentSymbol[] | null>(
                        'textDocument/documentSymbol',
                        { textDocument: { uri: toClangdUri(model.uri.path) } },
                        signalFromToken(token),
                    )
                    if (!res) return []
                    const flatten = (s: DocumentSymbol): monaco.languages.DocumentSymbol => ({
                        name: s.name,
                        detail: s.detail ?? '',
                        kind: symbolKind(monacoNs, s.kind),
                        // LSP SymbolTag.Deprecated == 1 → Monaco's enum is
                        // structurally identical for this value.
                        tags: (s.tags ?? []).includes(1)
                            ? [monacoNs.languages.SymbolTag.Deprecated]
                            : [],
                        range: toMonacoRange(monacoNs, s.range),
                        selectionRange: toMonacoRange(monacoNs, s.selectionRange),
                        children: (s.children ?? []).map(flatten),
                    })
                    return res.map(flatten)
                } catch (err) {
                    if (!isCancellation(err)) console.warn('[clangd] documentSymbol failed', err)
                    return []
                }
            },
        }))
    }

    // Diagnostics: clangd pushes these to us via notification rather than as a
    // response. We route each batch to the matching Monaco model.
    const unsubscribe = client.on('textDocument/publishDiagnostics', (params) => {
        if (!params || typeof params !== 'object') return
        const p = params as unknown as PublishDiagnosticsParams
        const uri = monacoNs.Uri.parse(p.uri)
        const model = monacoNs.editor.getModel(uri)
        if (!model) return
        monacoNs.editor.setModelMarkers(
            model,
            DIAG_OWNER,
            (p.diagnostics ?? []).map((d: Diagnostic) => ({
                severity: diagSeverity(monacoNs, d.severity),
                message: d.message,
                source: d.source ?? 'clangd',
                code: d.code === undefined ? undefined : String(d.code),
                startLineNumber: d.range.start.line + 1,
                startColumn: d.range.start.character + 1,
                endLineNumber: d.range.end.line + 1,
                endColumn: d.range.end.character + 1,
                // LSP 3.15 DiagnosticTag: 1=Unnecessary (dim), 2=Deprecated.
                tags: (d.tags ?? [])
                    .map((t) =>
                        t === 1
                            ? monacoNs.MarkerTag.Unnecessary
                            : t === 2
                              ? monacoNs.MarkerTag.Deprecated
                              : undefined,
                    )
                    .filter((t): t is monaco.MarkerTag => t !== undefined),
            })),
        )
    })
    disposables.push({ dispose: unsubscribe })

    return {
        dispose: () => {
            for (const d of disposables) d.dispose()
        },
    }
}

// Cancellation errors are an expected hot-path outcome (Monaco token fires
// every time the user types), so we suppress them from the warn log to keep
// the console useful. Anything else still surfaces.
function isCancellation(err: unknown): boolean {
    return err instanceof Error && err.message === 'cancelled'
}

// Convenience: clear any clangd-owned markers from every model. Useful when
// disposing without dropping the whole Monaco instance.
export function clearClangdMarkers(monacoNs: MonacoNs) {
    for (const model of monacoNs.editor.getModels()) {
        monacoNs.editor.setModelMarkers(model, DIAG_OWNER, [])
    }
}
