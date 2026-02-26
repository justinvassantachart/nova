// ── Compile Cache ──────────────────────────────────────────────────
// Content-hash cache for compiled assembly output.
// Avoids recompiling unchanged source files during debug sessions.
//
// How it works:
//   1. Each source file is hashed (SHA-256 of content + sysroot hash)
//   2. On cache hit, the stored .s assembly is returned instantly
//   3. On cache miss, the caller compiles normally and stores the result
//
// The sysroot hash is computed once per session (headers never change).
// The cache lives in memory — cleared on page reload, which is fine
// since the compiler WASM also reloads.

/** Cached result for a single compiled source file */
export interface CachedAssembly {
    assembly: string       // The raw .s assembly text
    sourceHash: string     // The hash that produced this entry
}

// ── Internal State ─────────────────────────────────────────────────

const cache = new Map<string, CachedAssembly>()
let sysrootHash: string | null = null

// ── Public API ─────────────────────────────────────────────────────

/** Retrieve a cached assembly result, or null on miss. */
export function getCached(hash: string): CachedAssembly | null {
    return cache.get(hash) ?? null
}

/** Store a compiled assembly result in the cache. */
export function setCached(hash: string, entry: CachedAssembly): void {
    cache.set(hash, entry)
}

/** Clear the entire cache (e.g., when sysroot changes). */
export function clearCache(): void {
    cache.clear()
    sysrootHash = null
}

/**
 * Lazily compute and cache the sysroot hash (it never changes per session).
 * Exposed so other modules (e.g. OPFS PCH cache) can version against it.
 */
export async function getSysrootHash(sysrootFiles: Record<string, string>): Promise<string> {
    if (!sysrootHash) {
        sysrootHash = await sha256(Object.keys(sysrootFiles).sort().join('\n'))
    }
    return sysrootHash
}

/**
 * Compute a SHA-256 hash for a source file's content combined with
 * the sysroot fingerprint. Two files with identical source + sysroot
 * will always produce identical assembly.
 */
export async function computeSourceHash(sourceContent: string, sysrootFiles: Record<string, string>): Promise<string> {
    const sHash = await getSysrootHash(sysrootFiles)
    return sha256(sourceContent + '\0' + sHash)
}

// ── Internals ──────────────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
    const encoded = new TextEncoder().encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
