// Configuration for the in-browser clangd LSP.
//
// Default base is nova's own Cloudflare-fronted R2 bucket — versioned,
// immutable, and serves the CORP/COEP headers our isolated context
// needs. Bypass via `VITE_CLANGD_WASM_URL` / `VITE_CLANGD_JS_URL` to
// point at your own host (e.g. a forked deployment) or back at the
// upstream `https://clangd.guyutongxue.site/wasm` for testing.

const DEFAULT_BASE = 'https://nova-clangd-cdn.simplecore.workers.dev/clangd/21.1.0'

// Coerce empty strings to undefined so an unset `VITE_CLANGD_WASM_URL=`
// in .env doesn't silently bypass the default.
const env: Record<string, string | undefined> | undefined = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
).env
const wasmOverride = env?.VITE_CLANGD_WASM_URL || undefined
const jsOverride = env?.VITE_CLANGD_JS_URL || undefined

export const CLANGD_WASM_URL = wasmOverride ?? `${DEFAULT_BASE}/clangd.wasm`
export const CLANGD_JS_URL = jsOverride ?? `${DEFAULT_BASE}/clangd.js`

// Cache API key. Bump when the wasm/js pair changes (different clangd
// build, new sysroot, etc.) so existing users refetch once. Prefix is
// shared so `purgeOldClangdCaches` finds stale entries from prior keys.
export const CLANGD_CACHE_KEY = 'clangd-21.1.0-r2'
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
 * editor language matches what registerClangdProviders expects.
 */
export function monacoLanguageFor(path: string): 'cpp' | 'plaintext' {
    return isCppPath(path) ? 'cpp' : 'plaintext'
}

// Centralised so a future remap (sysroot, sub-folders) is a one-edit.
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
