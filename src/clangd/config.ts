// Configuration for the in-browser clangd language server.
//
// The wasm + emscripten loader are fetched at runtime from a CDN. Default
// points at the upstream `clangd-in-browser` demo build (clangd 21, ~120 MB,
// served with the required cross-origin headers). Override via env vars to
// self-host or pin a specific build.
//
// SECURITY NOTE: the default sources executable JS + wasm from a third-party
// personal domain. There's no SRI or version-pinning hash today — a future
// hardening pass should host the assets on nova's own CDN, pin a version
// hash in the path, and optionally verify the JS bytes against a sha256
// before importing them via blob URL.

const DEFAULT_BASE = 'https://clangd.guyutongxue.site/wasm'

// `import.meta.env` is a Vite-only construct — the unit-test script (plain
// Node) imports this file too, so we guard with `?.` instead of crashing.
// We coerce empty strings to undefined via `?.`+`??` so a misconfigured
// `VITE_CLANGD_WASM_URL=` env line doesn't silently disable LSP.
const env: Record<string, string | undefined> | undefined = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
).env
const wasmOverride = env?.VITE_CLANGD_WASM_URL || undefined
const jsOverride = env?.VITE_CLANGD_JS_URL || undefined

export const CLANGD_WASM_URL = wasmOverride ?? `${DEFAULT_BASE}/clangd.wasm`
export const CLANGD_JS_URL = jsOverride ?? `${DEFAULT_BASE}/clangd.js`

// Single source of truth for where workspace files live in the clangd FS.
// Matches the path scheme Monaco models already use in nova (file URIs of the
// form `inmemory://.../workspace/...` get rewritten to `file:///workspace/...`
// before being handed to clangd). Keep these in sync.
export const WORKSPACE_PATH = '/workspace'

// Compile flags clangd uses when no compile_commands.json is present. We
// intentionally omit `-x c++`: clangd's driver picks the language from the
// extension (`c` for .c, `c++` for .cpp/.hpp/...), and forcing -xc++ would
// flag valid C constructs like `void *p = malloc(n)` as errors when the user
// is editing a .c file. The remaining flags only need to be "close enough"
// to nova's actual build for completions to reflect the right C++ standard;
// clangd's embedded sysroot lives at /usr/include (different from
// debugger-sh's runtime sysroot), but that's fine for code intelligence.
export const COMPILE_FLAGS: readonly string[] = [
    '-std=c++23',
    '-Wall',
    '--target=wasm32-wasi',
    '-isystem/usr/include/c++/v1',
    '-isystem/usr/include/wasm32-wasi/c++/v1',
    '-isystem/usr/include',
    '-isystem/usr/include/wasm32-wasi',
]

// Only request intelligence for these extensions. Anything else (Markdown,
// JSON, etc.) is ignored. Source of truth shared with the Editor's
// Monaco language-id mapping (see `monacoLanguageFor`).
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
 * Pick the Monaco language ID for a workspace path. Returns 'plaintext' for
 * anything we don't recognise so callers can pass the result straight to
 * MonacoEditor without an extra branch.
 *
 * Shared with Editor.tsx so the editor's language registration and our
 * provider registration agree on what counts as C/C++. Without this, .hpp
 * would show as plaintext while DocumentSync still pushed it to clangd —
 * clangd would produce diagnostics that providers (registered against the
 * 'cpp' language) would never surface.
 */
export function monacoLanguageFor(path: string): 'cpp' | 'plaintext' {
    const lower = path.toLowerCase()
    if (lower.endsWith('.c')) return 'cpp' // c handled via the cpp provider; clangd autodetects
    return CPP_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? 'cpp' : 'plaintext'
}

// Map a nova VFS path (e.g. `/workspace/main.cpp`) to a clangd-side absolute
// path. They happen to be identical today; centralize the assumption so a
// future remap (sysroot, sub-folders) only needs one edit.
export function toClangdPath(novaPath: string): string {
    if (novaPath.startsWith(WORKSPACE_PATH + '/') || novaPath === WORKSPACE_PATH) {
        return novaPath
    }
    return novaPath.startsWith('/') ? novaPath : `${WORKSPACE_PATH}/${novaPath}`
}

// Build a `file://` URI. We encode each path segment so that '#', '?', '%',
// space etc. survive as `%XX` — `encodeURI` alone leaves '#' and '?' raw
// because they're URI-reserved at the *top* level, but inside a path
// component they need escaping or clangd's URI parser rejects them.
export function toClangdUri(novaPath: string): string {
    const encoded = toClangdPath(novaPath)
        .split('/')
        .map(encodeURIComponent)
        .join('/')
    return `file://${encoded}`
}
