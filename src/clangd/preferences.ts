// User opt-out for the in-browser LSP.
// Resolution: URL flag > localStorage > default-on.

const STORAGE_KEY = 'nova.clangd.enabled'
const URL_FLAG = 'nolsp'

export function isClangdEnabled(): boolean {
    // Non-browser returns false — no Monaco/Worker to talk to.
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
