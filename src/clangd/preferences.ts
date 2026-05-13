// Persistent toggle for the in-browser language server. clangd's wasm binary
// is ~120 MB; auto-loading it would punish slow connections and read-only
// flows (e.g. a teacher skimming a student's submission). The default is on,
// but users — and tests — can disable it without code changes.
//
// Resolution order: URL flag > localStorage > default-on.

const STORAGE_KEY = 'nova.clangd.enabled'
const URL_FLAG = 'nolsp'

export function isClangdEnabled(): boolean {
    // SSR / non-browser safety, even though nova is browser-only today.
    if (typeof window === 'undefined') return false

    const params = new URLSearchParams(window.location.search)
    if (params.has(URL_FLAG)) return false

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored === 'false') return false
    } catch {
        // Storage blocked (private mode, etc.) — fall back to default.
    }
    return true
}

export function setClangdEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
        // ignore — best-effort persistence
    }
}
