// React glue for the clangd LSP integration. Two design choices worth
// flagging:
//
// 1. **Lazy boot.** clangd's wasm is ~120 MB. We don't fetch it until the
//    user actually interacts with the editor (focus or keystroke). The IDE
//    becomes interactive immediately; intelligence quietly comes online in
//    the background. Read-only flows (e.g. a teacher reviewing a submission
//    they won't edit) never pay the download cost — the host that mounts
//    this provider passes `enabled={false}` in those modes. Browser HTTP
//    cache covers repeat visits; the CDN sets a short max-age but an etag,
//    so a 304 revalidate is cheap.
//
// 2. **Separate lifecycle from EngineProvider.** The compiler engine runs
//    once per "Run" click and is disposed after; clangd is long-lived and
//    survives across runs. Keeping them in sibling providers makes that
//    boundary obvious — neither has knowledge of the other.

import { useMonaco } from '@monaco-editor/react'
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'

import { getAllFiles, subscribeWorkspaceChange } from '@/vfs/volume'
import type { IDisposable } from 'monaco-editor'

import { bootClangd } from './bootstrap'
import type { ClangdClient, ClangdStatus } from './ClangdClient'
import { isCppPath } from './config'
import { isClangdEnabled } from './preferences'
import { clearClangdMarkers, registerClangdProviders } from './providers'

const IDLE_STATUS: ClangdStatus = { state: 'idle' }
const DISABLED_STATUS: ClangdStatus = { state: 'disabled' }

interface ClangdContextValue {
    /** Connected client, or null until the user arms the integration. */
    client: ClangdClient | null
    /** Most recent status; never null. */
    status: ClangdStatus
    /**
     * Trigger boot on first call. Subsequent calls are no-ops. Call this from
     * the editor on focus/keydown so we only pay the download cost when the
     * user actually intends to write code.
     */
    arm: () => void
}

const ClangdContext = createContext<ClangdContextValue | null>(null)

const NOOP_VALUE: ClangdContextValue = {
    client: null,
    status: DISABLED_STATUS,
    arm: () => {},
}

interface ProviderProps {
    children: ReactNode
    /**
     * Set false to skip clangd entirely. Defaults to the user preference
     * resolution in `preferences.ts` (URL flag > localStorage > on). Hosts
     * that know intelligence is unwanted (e.g. `teacher-review` mode that
     * displays read-only submissions) should pass `false` explicitly so the
     * 120 MB binary never downloads.
     */
    enabled?: boolean
}

export function ClangdProvider({ children, enabled }: ProviderProps) {
    const effectivelyEnabled = enabled ?? isClangdEnabled()
    const monaco = useMonaco()
    const [client, setClient] = useState<ClangdClient | null>(null)
    const [armed, setArmed] = useState(false)
    const [status, setStatus] = useState<ClangdStatus>(
        effectivelyEnabled ? IDLE_STATUS : DISABLED_STATUS,
    )

    // We hold the booted client in a ref *as well as* state so the dispose
    // path can read it synchronously inside `useEffect`'s cleanup — setState
    // is async and the captured `client` closure can be stale.
    const clientRef = useRef<ClangdClient | null>(null)

    const arm = useCallback(() => {
        if (effectivelyEnabled) setArmed(true)
    }, [effectivelyEnabled])

    // Boot exactly once, after `arm()` is called. Strict-mode-safe via
    // `cancelled` guard — if React unmounts the effect before bootClangd
    // resolves, we dispose whatever finished.
    useEffect(() => {
        if (!armed || !effectivelyEnabled) return
        let cancelled = false
        let unsubStatus: (() => void) | undefined

        bootClangd(collectInitialFiles())
            .then((c) => {
                if (cancelled) {
                    c.dispose()
                    return
                }
                clientRef.current = c
                unsubStatus = c.onStatus.subscribe(setStatus)
                setClient(c)
                setStatus(c.getStatus())
            })
            .catch((err: unknown) => {
                if (cancelled) return
                const message = err instanceof Error ? err.message : String(err)
                setStatus({ state: 'error', message })
                console.warn('[clangd] failed to boot', err)
            })

        return () => {
            cancelled = true
            // Unsubscribe BEFORE dispose so the `'disposed'` status emitted
            // by dispose() doesn't try to setStatus on an unmounted tree —
            // React would warn.
            unsubStatus?.()
            clientRef.current?.dispose()
            clientRef.current = null
            setClient(null)
        }
    }, [armed, effectivelyEnabled])

    // Monaco providers come up *after* the client. Re-runs when either side
    // mounts/swaps — in practice only when monaco hot-reloads in dev.
    useEffect(() => {
        if (!client || !monaco) return
        const disposable: IDisposable = registerClangdProviders(monaco, client)
        return () => {
            disposable.dispose()
            clearClangdMarkers(monaco)
        }
    }, [client, monaco])

    // Watchdog: clangd's read-only view of the FS for `#include` resolution.
    // The editor-driven didChange path handles open files instantly; this is
    // a slow sweep that catches the rest (explorer creates/deletes/renames)
    // and keeps unopened headers fresh in case they get pulled in later.
    //
    // We track previously-synced contents so a flush only writes files that
    // actually changed and deletes files that disappeared. Without the
    // delete, renaming `foo.h` → `bar.h` leaves the old name in clangd's FS
    // and silently shadows include resolution. Without the diff, every
    // keystroke during a typing burst re-uploads every C/C++ file in the
    // workspace.
    //
    // 500 ms debounce so a typing burst collapses to one flush.
    const syncedRef = useRef<Map<string, string>>(new Map())
    useEffect(() => {
        if (!client) return
        let timer: ReturnType<typeof setTimeout> | undefined

        const flush = () => {
            const files = collectInitialFiles()
            const prev = syncedRef.current
            const next = new Map(Object.entries(files))
            for (const stale of prev.keys()) {
                if (!next.has(stale)) client.deleteFile(stale)
            }
            const changed: Record<string, string> = {}
            for (const [path, content] of next) {
                if (prev.get(path) !== content) changed[path] = content
            }
            if (Object.keys(changed).length > 0) client.writeFiles(changed)
            syncedRef.current = next
        }

        const schedule = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(flush, 500)
        }
        const unsub = subscribeWorkspaceChange(schedule)
        // Initial sync in case files arrived between bootClangd and now.
        schedule()
        return () => {
            // If a flush was scheduled but never ran, force it through so the
            // last keystroke before unmount isn't lost on clangd's side.
            if (timer) {
                clearTimeout(timer)
                flush()
            }
            unsub()
            syncedRef.current = new Map()
        }
    }, [client])

    const value = useMemo<ClangdContextValue>(
        () => (effectivelyEnabled ? { client, status, arm } : NOOP_VALUE),
        [client, status, arm, effectivelyEnabled],
    )

    return <ClangdContext.Provider value={value}>{children}</ClangdContext.Provider>
}

/**
 * Read the clangd context. Returns a disabled stub if no provider is mounted,
 * so callers can always safely call `arm()` without checking for null.
 */
export function useClangd(): ClangdContextValue {
    return useContext(ClangdContext) ?? NOOP_VALUE
}

function collectInitialFiles(): Record<string, string> {
    const out: Record<string, string> = {}
    let files: Record<string, string>
    try {
        files = getAllFiles()
    } catch {
        // VFS not initialised yet (initVFS runs async, in parallel with our
        // mount). The watchdog will fire on the next workspace change and
        // pick up the real files then.
        return out
    }
    for (const [path, content] of Object.entries(files)) {
        if (!isCppPath(path)) continue
        out[path] = content
    }
    return out
}
