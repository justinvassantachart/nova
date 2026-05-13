// User opt-out for the in-browser LSP. clangd.wasm is ~120 MB; users and
// tests need a way to skip it without a code change.
//
// Resolution: URL flag > localStorage > default-on.

const STORAGE_KEY = 'nova.clangd.enabled'
const URL_FLAG = 'nolsp'

export function isClangdEnabled(): boolean {
    // Non-browser returns false — there's no Monaco/Worker to talk to. nova
    // is browser-only; this guard only matters for the Node unit tests.
    if (typeof window === 'undefined') return false

    const params = new URLSearchParams(window.location.search)
    if (params.has(URL_FLAG)) return false

    try {
        if (window.localStorage.getItem(STORAGE_KEY) === 'false') return false
    } catch { /* storage blocked (private mode) — default on */ }
    return true
}

export function setClangdEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
    } catch { /* best-effort */ }
}
