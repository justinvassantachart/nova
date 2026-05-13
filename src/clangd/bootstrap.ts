// LSP initialize/initialized handshake.

import { ClangdClient } from './ClangdClient'
import { WORKSPACE_PATH } from './config'

// Every flag here has a matching consumer in providers.ts. Toggling one
// without updating the other will silently drop features.
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
                contextSupport: true, // we forward Monaco's CompletionContext
                completionItem: {
                    snippetSupport: true,
                    documentationFormat: ['markdown', 'plaintext'],
                    insertReplaceSupport: true,
                    deprecatedSupport: true,                 // legacy boolean
                    tagSupport: { valueSet: [1] },           // LSP 3.15+ Deprecated
                    preselectSupport: true,
                    // Defers documentation/detail until the user focuses an
                    // item — visibly faster on large TUs.
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
                // 1=Unnecessary (dim), 2=Deprecated (strikethrough).
                // Without this, unused #include hints miss their styling.
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
 * Boot a clangd worker, do the LSP handshake, seed initial files. The
 * caller owns the returned client and must dispose() it.
 *
 * writeFiles before await ready() works because the worker queues
 * main-thread messages and drains them once callMain() starts pumping. If
 * the worker's setup order ever changes, this needs to follow.
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
