// Public surface of the clangd integration. Keep this short — anything not
// re-exported here is implementation detail of the workspace LSP pipeline.

export { ClangdClient } from './ClangdClient'
export type { ClangdStatus } from './ClangdClient'
export { ClangdProvider } from './ClangdContext'
export { useClangd } from './clangd-context'
export { isClangdEnabled, setClangdEnabled } from './preferences'
export { bootClangd } from './bootstrap'
export { purgeOldClangdCaches, requestPersistentStorage } from './cache'
export {
    CLANGD_JS_URL,
    CLANGD_WASM_URL,
    COMPILE_FLAGS,
    CPP_EXTENSIONS,
    WORKSPACE_PATH,
    isCppPath,
    toClangdPath,
    toClangdUri,
} from './config'
export { JsonStream } from './json-stream'
