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

function symbolKind(monacoNs: MonacoNs, lspKind: number): monaco.languages.SymbolKind {
    const K = monacoNs.languages.SymbolKind
    // SymbolKind enums happen to align 1:1 between LSP and Monaco for the
    // first ~26 values; clamp to a reasonable default just in case clangd
    // emits something we don't know about.
    return (lspKind >= 0 && lspKind <= 26 ? lspKind : K.Variable) as monaco.languages.SymbolKind
}

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
        if (!isCppPath(path) || this.opened.has(path)) return

        const uri = toClangdUri(path)
        this.client.notify('textDocument/didOpen', {
            textDocument: { uri, languageId: 'cpp', version: 1, text: model.getValue() },
        })

        // Forward each edit's granular ranges to clangd. Sending the full text
        // would also work but burns more bandwidth on every keystroke. We
        // additionally update clangd's read-only FS view so transitive
        // #includes see the latest content for any other open file.
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
            this.client.writeFile(path, model.getValue())
        })
        this.opened.set(path, sub)
    }

    private close(model: editor.ITextModel) {
        const path = model.uri.path
        const sub = this.opened.get(path)
        if (!sub) return
        sub.dispose()
        this.opened.delete(path)
        this.client.notify('textDocument/didClose', {
            textDocument: { uri: toClangdUri(path) },
        })
    }
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
            triggerCharacters: ['.', ':', '>', '<', '"', '/', '*', '#', ' '],
            provideCompletionItems: async (model, position) => {
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
                            context: { triggerKind: 1 },
                        },
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
                            if (item.deprecated) {
                                suggestion.tags = [monacoNs.languages.CompletionItemTag.Deprecated]
                            }
                            return suggestion
                        }),
                    }
                } catch (err) {
                    console.warn('[clangd] completion failed', err)
                    return { suggestions: [] }
                }
            },
        }))

        disposables.push(monacoNs.languages.registerHoverProvider(lang, {
            provideHover: async (model, position) => {
                if (!isCppPath(model.uri.path)) return null
                try {
                    const hover = await client.request<Hover | null>('textDocument/hover', {
                        textDocument: { uri: toClangdUri(model.uri.path) },
                        position: toLspPos(position),
                    })
                    if (!hover) return null
                    return {
                        range: hover.range ? toMonacoRange(monacoNs, hover.range) : undefined,
                        contents: hoverContent(hover),
                    }
                } catch (err) {
                    console.warn('[clangd] hover failed', err)
                    return null
                }
            },
        }))

        disposables.push(monacoNs.languages.registerSignatureHelpProvider(lang, {
            signatureHelpTriggerCharacters: ['(', ','],
            signatureHelpRetriggerCharacters: [')'],
            provideSignatureHelp: async (model, position) => {
                if (!isCppPath(model.uri.path)) return null
                try {
                    const help = await client.request<SignatureHelp | null>(
                        'textDocument/signatureHelp',
                        {
                            textDocument: { uri: toClangdUri(model.uri.path) },
                            position: toLspPos(position),
                        },
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
                    console.warn('[clangd] signatureHelp failed', err)
                    return null
                }
            },
        }))

        disposables.push(monacoNs.languages.registerDefinitionProvider(lang, {
            provideDefinition: async (model, position) => {
                if (!isCppPath(model.uri.path)) return null
                try {
                    const res = await client.request<Location | Location[] | null>(
                        'textDocument/definition',
                        {
                            textDocument: { uri: toClangdUri(model.uri.path) },
                            position: toLspPos(position),
                        },
                    )
                    if (!res) return null
                    const locs = Array.isArray(res) ? res : [res]
                    return locs.map((l) => ({
                        uri: monacoNs.Uri.parse(l.uri),
                        range: toMonacoRange(monacoNs, l.range),
                    }))
                } catch (err) {
                    console.warn('[clangd] definition failed', err)
                    return null
                }
            },
        }))

        disposables.push(monacoNs.languages.registerDocumentSymbolProvider(lang, {
            displayName: 'clangd',
            provideDocumentSymbols: async (model) => {
                if (!isCppPath(model.uri.path)) return []
                try {
                    const res = await client.request<DocumentSymbol[] | null>(
                        'textDocument/documentSymbol',
                        { textDocument: { uri: toClangdUri(model.uri.path) } },
                    )
                    if (!res) return []
                    const flatten = (s: DocumentSymbol): monaco.languages.DocumentSymbol => ({
                        name: s.name,
                        detail: s.detail ?? '',
                        kind: symbolKind(monacoNs, s.kind),
                        tags: [],
                        range: toMonacoRange(monacoNs, s.range),
                        selectionRange: toMonacoRange(monacoNs, s.selectionRange),
                        children: (s.children ?? []).map(flatten),
                    })
                    return res.map(flatten)
                } catch (err) {
                    console.warn('[clangd] documentSymbol failed', err)
                    return []
                }
            },
        }))
    }

    // Diagnostics: clangd pushes these to us via notification rather than as a
    // response. We route each batch to the matching Monaco model.
    const diagOwner = 'clangd'
    const unsubscribe = client.on('textDocument/publishDiagnostics', (params) => {
        if (!params || typeof params !== 'object') return
        const p = params as unknown as PublishDiagnosticsParams
        const uri = monacoNs.Uri.parse(p.uri)
        const model = monacoNs.editor.getModel(uri)
        if (!model) return
        monacoNs.editor.setModelMarkers(
            model,
            diagOwner,
            (p.diagnostics ?? []).map((d: Diagnostic) => ({
                severity: diagSeverity(monacoNs, d.severity),
                message: d.message,
                source: d.source ?? 'clangd',
                code: d.code === undefined ? undefined : String(d.code),
                startLineNumber: d.range.start.line + 1,
                startColumn: d.range.start.character + 1,
                endLineNumber: d.range.end.line + 1,
                endColumn: d.range.end.character + 1,
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

// Convenience: clear any clangd-owned markers from every model. Useful when
// disposing without dropping the whole Monaco instance.
export function clearClangdMarkers(monacoNs: MonacoNs) {
    for (const model of monacoNs.editor.getModels()) {
        monacoNs.editor.setModelMarkers(model, 'clangd', [])
    }
}
