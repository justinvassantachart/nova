// LSP handshake: boot the worker, then send the standard `initialize` →
// `initialized` pair so clangd is ready to answer requests.

import { ClangdClient } from './ClangdClient'
import { WORKSPACE_PATH } from './config'

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
                completionItem: {
                    snippetSupport: true,
                    documentationFormat: ['markdown', 'plaintext'],
                    insertReplaceSupport: true,
                    deprecatedSupport: true,
                    preselectSupport: true,
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
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            publishDiagnostics: { versionSupport: false, relatedInformation: true },
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
 */
export async function bootClangd(initialFiles: Record<string, string>): Promise<ClangdClient> {
    const client = new ClangdClient()
    try {
        // Seed the file tree *before* the handshake so the very first didOpen
        // can resolve `#include`s against real files. Re-seed if the
        // workspace gets re-bootstrapped later; the worker overwrites in
        // place.
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
