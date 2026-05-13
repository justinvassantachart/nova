export interface CachedObject {
    objectData: ArrayBuffer
    stepMap: Record<number, { line: number; func: string; file: string }>
    sourceHash: string
}

const cache = new Map<string, CachedObject>()
let sysrootHash: string | null = null

export function getCached(hash: string): CachedObject | null {
    const entry = cache.get(hash)
    if (!entry) return null
    return { ...entry, objectData: entry.objectData.slice(0) } // Transferable clone
}

export function setCached(hash: string, entry: CachedObject): void {
    cache.set(hash, entry)
}

export function clearCache(): void {
    cache.clear()
    sysrootHash = null
}

export async function getSysrootHash(sysrootFiles: Record<string, string>): Promise<string> {
    if (!sysrootHash) {
        sysrootHash = await sha256(Object.keys(sysrootFiles).sort().join('\n'))
    }
    return sysrootHash
}

export async function computeSourceHash(sourceContent: string, sysrootFiles: Record<string, string>): Promise<string> {
    const sHash = await getSysrootHash(sysrootFiles)
    return sha256(sourceContent + '\0' + sHash)
}

async function sha256(input: string): Promise<string> {
    const encoded = new TextEncoder().encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
