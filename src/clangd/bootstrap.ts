// LSP handshake: boot the worker, then send the standard `initialize` →
// `initialized` pair so clangd is ready to answer requests.

import { ClangdClient } from './ClangdClient'
import { WORKSPACE_PATH } from './config'

// Capabilities we declare to clangd. Every flag flipped here is matched by
// a corresponding code path in `providers.ts` — if you remove a flag, drop
// the consumer too (and vice versa).
const INITIALIZE_PARAMS = {
    processId: null,
    clientInfo: { name: 'nova', version: '1.0' },
    rootUri: `file://${WORKSPACE_PATH}`,
    workspaceFolders: [{ uri: `file://${WORKSPACE_PATH}`, name: 'workspace' }],
    capabilities: {
        textDocument: {
            synchronization: {
                didSave: false,
                willSave: false,
                willSaveWaitUntil: false,
                dynamicRegistration: false,
            },
            completion: {
                // Tells clangd we pass a real CompletionContext (the
                // triggerKind / triggerCharacter pair on each request).
                contextSupport: true,
                completionItem: {
                    snippetSupport: true,
                    documentationFormat: ['markdown', 'plaintext'],
                    insertReplaceSupport: true,
                    // Legacy boolean Deprecated flag.
                    deprecatedSupport: true,
                    // LSP 3.15+ tag-based Deprecated. Both are honoured in
                    // providers.ts; modern clangd emits tags, older builds
                    // emit the boolean.
                    tagSupport: { valueSet: [1] },
                    preselectSupport: true,
                    // Lets clangd defer expensive details until the user
                    // focuses an item — noticeable on large TUs.
                    resolveSupport: { properties: ['documentation', 'detail'] },
                },
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            signatureHelp: {
                signatureInformation: {
                    documentationFormat: ['markdown', 'plaintext'],
                    parameterInformation: { labelOffsetSupport: true },
                },
            },
            definition: { linkSupport: false },
            documentSymbol: {
                hierarchicalDocumentSymbolSupport: true,
                tagSupport: { valueSet: [1] },
            },
            publishDiagnostics: {
                versionSupport: false,
                relatedInformation: true,
                // LSP 3.15+ DiagnosticTag: 1 = Unnecessary (dim),
                // 2 = Deprecated (strikethrough). Without this, unused
                // #include markers don't get visual styling.
                tagSupport: { valueSet: [1, 2] },
            },
        },
        workspace: {
            workspaceFolders: true,
            didChangeConfiguration: { dynamicRegistration: false },
            configuration: false,
        },
    },
}

/**
 * Boot a clangd worker, perform the LSP handshake, seed the initial workspace
 * files. Resolves once clangd is ready to answer requests.
 *
 * Caller owns the returned client and is responsible for `dispose()`-ing it.
 *
 * NOTE: `writeFiles` is fire-and-forget before `await client.ready()`. This
 * works because the worker handles `'fs:writeAll'` after callMain via an
 * addEventListener registered before callMain runs (see clangd.worker.ts —
 * the worker queues main-thread messages while it's still booting and drains
 * them once ready). If you ever invert the ordering in the worker, also
 * invert it here.
 */
export async function bootClangd(initialFiles: Record<string, string>): Promise<ClangdClient> {
    const client = new ClangdClient()
    try {
        client.writeFiles(initialFiles)
        await client.ready()
        await client.request('initialize', INITIALIZE_PARAMS)
        client.notify('initialized', {})
        return client
    } catch (err) {
        client.dispose()
        throw err
    }
}
