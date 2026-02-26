//   Sysroot Loader  //
// Fetches the WASI SDK sysroot.zip from public/ at app startup,
// extracts C++ and C standard library headers using fflate,
// and writes them into the memfs VFS so clang can find them.

import { unzipSync } from 'fflate'
import { writeFile, vol } from './volume'

let loaded = false
let loading: Promise<void> | null = null

/** Returns true if the sysroot headers are already available in the VFS. */
export function isSysrootLoaded(): boolean {
    return loaded
}

/**
 * Fetch sysroot.zip and extract all headers into /sysroot/include/.
 * Safe to call multiple times - will only load once.
 */
export function loadSysroot(): Promise<void> {
    if (loaded) return Promise.resolve()
    if (loading) return loading
    loading = _doLoad()
    return loading
}

async function _doLoad(): Promise<void> {
    try {
        console.time('[sysroot] load')
        const res = await fetch('/sysroot.zip')
        if (!res.ok) {
            throw new Error(`Failed to fetch sysroot.zip: ${res.status} ${res.statusText}`)
        }
        const buffer = new Uint8Array(await res.arrayBuffer())
        const unzipped = unzipSync(buffer)

        // Ensure base directories exist
        const basePath = '/sysroot/include'
        vol.mkdirSync(basePath, { recursive: true })

        let fileCount = 0
        for (const [filename, data] of Object.entries(unzipped)) {
            // Skip directory entries (0-length entries)
            if (!data.length) continue
            const fullPath = `${basePath}/${filename}`
            writeFile(fullPath, new TextDecoder().decode(data))
            fileCount++
        }
        loaded = true
        console.timeEnd('[sysroot] load')
        console.log(`[sysroot] Extracted ${fileCount} header files`)
    } catch (err) {
        loading = null // Allow retry on failure
        console.error('[sysroot] Failed to load sysroot:', err)
        throw err
    }
}

// OPTIMIZATION: Cache the resolved sysroot files to avoid reading 1200+ files from memfs on every compile
let cachedSysrootFiles: Record<string, string> | null = null

/**
 * Build the sysroot file tree for the compiler worker.
 * Returns only the sysroot portion of the VFS as a flat Record.
 */
export function getSysrootFiles(): Record<string, string> {
    if (cachedSysrootFiles) return cachedSysrootFiles

    const result: Record<string, string> = {}
    function walk(dir: string) {
        try {
            const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[]
            for (const entry of entries) {
                const full = dir === '/' ? `/${entry}` : `${dir}/${entry}`
                try {
                    const stat = vol.statSync(full)
                    if (stat.isDirectory()) walk(full)
                    else result[full] = vol.readFileSync(full, { encoding: 'utf8' }) as string
                } catch { /* skip unreadable entries */ }
            }
        } catch { /* skip unreadable dirs */ }
    }
    walk('/sysroot')

    cachedSysrootFiles = result
    return result
}
