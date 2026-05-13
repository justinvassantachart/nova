// Configuration for the in-browser clangd language server.
//
// The wasm + emscripten loader are fetched at runtime from a CDN. Default
// points at the upstream `clangd-in-browser` demo build (clangd 21, ~120 MB,
// served with the required cross-origin headers). Override via env vars to
// self-host or pin a specific build.

const DEFAULT_BASE = 'https://clangd.guyutongxue.site/wasm'

// `import.meta.env` is a Vite-only construct — the unit-test script (plain
// Node) imports this file too, so we guard with `?.` instead of crashing.
const env: Record<string, string | undefined> | undefined = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
).env

export const CLANGD_WASM_URL =
    env?.VITE_CLANGD_WASM_URL || `${DEFAULT_BASE}/clangd.wasm`
export const CLANGD_JS_URL =
    env?.VITE_CLANGD_JS_URL || `${DEFAULT_BASE}/clangd.js`

// Single source of truth for where workspace files live in the clangd FS.
// Matches the path scheme Monaco models already use in nova (file URIs of the
// form `inmemory://.../workspace/...` get rewritten to `file:///workspace/...`
// before being handed to clangd). Keep these in sync.
export const WORKSPACE_PATH = '/workspace'

// Compile flags clangd uses when no compile_commands.json is present. These
// only need to be "close enough" to nova's actual build that completions
// reflect the right C++ standard; clangd's embedded sysroot lives at
// /usr/include in the wasm, which is *different* from the runtime sysroot
// debugger-sh uses — but that's fine for code intelligence.
export const COMPILE_FLAGS: readonly string[] = [
    '-xc++',
    '-std=c++23',
    '-Wall',
    '--target=wasm32-wasi',
    '-isystem/usr/include/c++/v1',
    '-isystem/usr/include/wasm32-wasi/c++/v1',
    '-isystem/usr/include',
    '-isystem/usr/include/wasm32-wasi',
]

// Only request intelligence for these extensions. Anything else (Markdown,
// JSON, etc.) is ignored.
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

// Map a nova VFS path (e.g. `/workspace/main.cpp`) to a clangd-side absolute
// path. They happen to be identical today; centralize the assumption so a
// future remap (sysroot, sub-folders) only needs one edit.
export function toClangdPath(novaPath: string): string {
    if (novaPath.startsWith(WORKSPACE_PATH + '/') || novaPath === WORKSPACE_PATH) {
        return novaPath
    }
    return novaPath.startsWith('/') ? novaPath : `${WORKSPACE_PATH}/${novaPath}`
}

export function toClangdUri(novaPath: string): string {
    return `file://${toClangdPath(novaPath)}`
}
