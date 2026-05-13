// Configuration for the in-browser clangd LSP.
//
// SECURITY: the default fetches executable JS/wasm from a third-party
// personal domain — no SRI, no version pin. Should be self-hosted for
// production. Override via the two env vars below.

const DEFAULT_BASE = 'https://clangd.guyutongxue.site/wasm'

// `import.meta.env` is Vite-only — guard for the Node-based test scripts.
// Coerce empty strings to undefined so `VITE_CLANGD_WASM_URL=` in .env
// doesn't silently bypass the default.
const env: Record<string, string | undefined> | undefined = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
).env
const wasmOverride = env?.VITE_CLANGD_WASM_URL || undefined
const jsOverride = env?.VITE_CLANGD_JS_URL || undefined

export const CLANGD_WASM_URL = wasmOverride ?? `${DEFAULT_BASE}/clangd.wasm`
export const CLANGD_JS_URL = jsOverride ?? `${DEFAULT_BASE}/clangd.js`

// Cache API key. Bump this when the wasm/js pair changes upstream
// (different clangd build, new sysroot, etc.) — boot will then delete the
// old cache and refetch. If you self-host with versioned immutable URLs,
// you don't strictly need to bump this since the URL itself changes too,
// but keeping the prefix lets `purgeOldClangdCaches` find stale entries.
export const CLANGD_CACHE_KEY = 'clangd-21.1.0-v1'
export const CLANGD_CACHE_PREFIX = 'clangd-'

export const WORKSPACE_PATH = '/workspace'

// Fallback compile flags clangd uses without a compile_commands.json. We
// don't pass `-x c++` — clangd's driver picks the language from the
// extension, and forcing C++ would flag valid C inside a .c file.
export const COMPILE_FLAGS: readonly string[] = [
    '-std=c++23',
    '-Wall',
    '--target=wasm32-wasi',
    '-isystem/usr/include/c++/v1',
    '-isystem/usr/include/wasm32-wasi/c++/v1',
    '-isystem/usr/include',
    '-isystem/usr/include/wasm32-wasi',
]

export const CPP_EXTENSIONS: readonly string[] = [
    '.c',
    '.cc',
    '.cp',
    '.cpp',
    '.cxx',
    '.c++',
    '.h',
    '.hh',
    '.hpp',
    '.hxx',
]

export function isCppPath(path: string): boolean {
    const lower = path.toLowerCase()
    return CPP_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Monaco language ID for a workspace path. Shared with Editor.tsx so the
 * editor's language matches what registerClangdProviders expects —
 * otherwise .hpp/.cc/.cxx fall back to 'plaintext' and clangd diagnostics
 * never surface.
 */
export function monacoLanguageFor(path: string): 'cpp' | 'plaintext' {
    return isCppPath(path) ? 'cpp' : 'plaintext'
}

// Centralized so a future remap (sysroot, sub-folders) is a one-edit.
export function toClangdPath(novaPath: string): string {
    if (novaPath.startsWith(WORKSPACE_PATH + '/') || novaPath === WORKSPACE_PATH) {
        return novaPath
    }
    return novaPath.startsWith('/') ? novaPath : `${WORKSPACE_PATH}/${novaPath}`
}

// Per-segment encode so '#', '?', '%', spaces survive — clangd's URI
// parser rejects them raw. encodeURI alone wouldn't catch '#' or '?'.
export function toClangdUri(novaPath: string): string {
    return `file://${toClangdPath(novaPath).split('/').map(encodeURIComponent).join('/')}`
}
