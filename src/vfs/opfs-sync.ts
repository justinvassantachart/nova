// ── OPFS Sync ─────────────────────────────────────────────────────
import { writeFile } from './volume'

export async function syncToOPFS(path: string, content: string) {
    try {
        const root = await navigator.storage.getDirectory()
        const parts = path.replace('/workspace/', '').split('/')
        let dir = root
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: true })
        }
        const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()
    } catch (err) {
        console.warn('[OPFS] sync failed:', err)
    }
}

export async function hydrateFromOPFS() {
    try {
        const root = await navigator.storage.getDirectory()
        await walk(root, '/workspace')
    } catch (err) {
        console.warn('[OPFS] hydration failed:', err)
    }
}

async function walk(dir: FileSystemDirectoryHandle, base: string) {
    for await (const [name, handle] of (dir as any).entries()) {
        const path = `${base}/${name}`
        if (handle.kind === 'directory') {
            await walk(handle as FileSystemDirectoryHandle, path)
        } else {
            const file = await (handle as FileSystemFileHandle).getFile()
            writeFile(path, await file.text())
        }
    }
}
