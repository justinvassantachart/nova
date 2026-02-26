// ── Compiler Cache ─────────────────────────────────────────────────
// Pre-loads @yowasp/clang WASM in the background on app start.
// Tracks download progress and prevents compilation until ready.

import { useCompilerStore } from '@/store/compiler-store'

let preloadWorker: Worker | null = null
let isPreloaded = false

/** Start background download of the compiler WASM. Call on app mount. */
export function preloadCompiler() {
    if (isPreloaded || preloadWorker) return

    const store = useCompilerStore.getState()
    store.setCacheState('downloading')
    store.setDownloadProgress(0)

    // Spawn the compiler worker — its static import of @yowasp/clang
    // triggers the WASM download immediately
    preloadWorker = new Worker(
        new URL('../workers/compiler.worker.ts', import.meta.url),
        { type: 'module' },
    )

    preloadWorker.onmessage = (e) => {
        const { type } = e.data
        if (type === 'PRELOAD_DONE') {
            isPreloaded = true
            store.setCacheState('ready')
            store.setDownloadProgress(100)
        } else if (type === 'PRELOAD_PROGRESS') {
            store.setDownloadProgress(e.data.percent)
        }
    }

    preloadWorker.onerror = (err) => {
        store.setCacheState('error')
        store.setErrorMessage(err.message || 'Failed to load compiler')
    }

    preloadWorker.postMessage({ type: 'PRELOAD' })
}

/** Returns the cached worker, or creates a new one if needed */
export function getCompilerWorker(): Worker {
    if (preloadWorker) {
        const w = preloadWorker
        preloadWorker = null // hand off ownership
        return w
    }
    return new Worker(
        new URL('../workers/compiler.worker.ts', import.meta.url),
        { type: 'module' },
    )
}

/** Pop the preload worker for debug pool use (without affecting release mode). */
export function popPreloadWorker(): Worker | null {
    if (preloadWorker) {
        const w = preloadWorker
        preloadWorker = null
        return w
    }
    return null
}

export function isCompilerReady(): boolean {
    return useCompilerStore.getState().cacheState === 'ready'
}
