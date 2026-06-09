// React glue for clangd.
//
// - Lazy boot: clangd.wasm is ~120 MB. We only download it after `arm()`
//   (called by Editor.tsx on first focus/keystroke). Hosts pass
//   `enabled={false}` for read-only flows so it never downloads.
// - Sibling to EngineProvider: clangd lives for the whole session, the
//   engine is per-Run. Keeping them independent makes that easy to read.

import { useMonaco } from '@monaco-editor/react'
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'

import { getAllFiles, subscribeWorkspaceChange } from '@/vfs/volume'
import { NOVA_TEST_HEADER, NOVA_TEST_HEADER_CLANGD_PATH } from '@/testing/payload'
import type { IDisposable } from 'monaco-editor'

import { bootClangd } from './bootstrap'
import { purgeOldClangdCaches, requestPersistentStorage } from './cache'
import type { ClangdClient, ClangdStatus } from './ClangdClient'
import { ClangdContext, NOOP_VALUE, type ClangdContextValue } from './clangd-context'
import { isCppPath } from './config'
import { isClangdEnabled } from './preferences'
import { clearClangdMarkers, registerClangdProviders } from './providers'

const IDLE_STATUS: ClangdStatus = { state: 'idle' }
const DISABLED_STATUS: ClangdStatus = { state: 'disabled' }

interface ProviderProps {
    children: ReactNode
    /** Defaults to `preferences.isClangdEnabled()`. Hosts override for read-only modes. */
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

    // Ref-backed because the effect cleanup needs the client synchronously
    // — `setClient` is async, so the closed-over `client` would be stale.
    const clientRef = useRef<ClangdClient | null>(null)

    const arm = useCallback(() => {
        if (!effectivelyEnabled) return
        setArmed(true)
        // Best-effort: ask the browser to keep the 120 MB clangd cache
        // around across quota pressure. Fire-and-forget; no UI hook.
        void requestPersistentStorage()
    }, [effectivelyEnabled])

    // Boot exactly once after arm(). `cancelled` handles teardown mid-boot
    // (e.g. StrictMode remount) so no worker leaks.
    useEffect(() => {
        if (!armed || !effectivelyEnabled) return
        let cancelled = false
        let unsubStatus: (() => void) | undefined

        // Drop cache entries from prior versions in parallel with the boot.
        void purgeOldClangdCaches()
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
            // Unsubscribe before dispose so the final 'disposed' status
            // doesn't setState on an unmounted tree.
            unsubStatus?.()
            clientRef.current?.dispose()
            clientRef.current = null
            setClient(null)
        }
    }, [armed, effectivelyEnabled])

    useEffect(() => {
        if (!client || !monaco) return
        const disposable: IDisposable = registerClangdProviders(monaco, client)
        return () => {
            disposable.dispose()
            clearClangdMarkers(monaco)
        }
    }, [client, monaco])

    // Workspace → clangd FS sweep for files Monaco doesn't have open
    // (headers, explorer creates/renames/deletes). Diff prev vs next so we
    // only write changed files and delete paths that disappeared — without
    // the delete, renames leave the old name shadowing include resolution.
    // 500 ms debounce collapses typing bursts.
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
        schedule() // catch files that arrived between boot and now
        return () => {
            // Force a final flush so the last edit before unmount lands.
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

function collectInitialFiles(): Record<string, string> {
    const out: Record<string, string> = {}
    let files: Record<string, string>
    try {
        files = getAllFiles()
    } catch {
        // VFS hasn't initialized yet — watchdog will catch up when it does.
        files = {}
    }
    for (const [path, content] of Object.entries(files)) {
        if (isCppPath(path)) out[path] = content
    }
    // Inject the test framework header so #include "nova_test.h" resolves and
    // EXPECT_EQUALS / STUDENT_TEST autocomplete even before the student clicks
    // "Run Tests". Lives only in clangd's in-memory FS — never written to the
    // VFS, so it doesn't appear in the file explorer or persist to OPFS.
    out[NOVA_TEST_HEADER_CLANGD_PATH] = NOVA_TEST_HEADER
    return out
}
