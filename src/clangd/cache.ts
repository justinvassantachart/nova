// Main-thread helpers for the Cache API layer used by the worker.
// Kept separate from `config.ts` so it doesn't bloat the worker bundle —
// these only run on the main thread.

import { CLANGD_CACHE_KEY, CLANGD_CACHE_PREFIX } from './config'

/**
 * Ask the browser to mark the origin's storage as persistent so the
 * ~120 MB clangd cache survives quota-based eviction. Best-effort —
 * Chrome auto-grants based on engagement signals; Firefox prompts;
 * Safari supports the API but won't grant. Never throws.
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    try {
        return await navigator.storage.persist()
    } catch {
        return false
    }
}

/**
 * Delete cache entries from earlier clangd versions. Cheap — Cache API
 * keys are tiny strings. Run once per session at boot.
 */
export async function purgeOldClangdCaches(): Promise<void> {
    if (typeof caches === 'undefined') return
    let keys: string[]
    try {
        keys = await caches.keys()
    } catch {
        return
    }
    await Promise.all(
        keys
            .filter((k) => k.startsWith(CLANGD_CACHE_PREFIX) && k !== CLANGD_CACHE_KEY)
            .map((k) => caches.delete(k).catch(() => false)),
    )
}
