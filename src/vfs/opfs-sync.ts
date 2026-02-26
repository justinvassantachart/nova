// ── OPFS Sync ─────────────────────────────────────────────────────
import { writeFile } from './volume'

async function getProjectDir(projectId: string): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory()
    const projects = await root.getDirectoryHandle('projects', { create: true })
    return projects.getDirectoryHandle(projectId, { create: true })
}

export async function syncToOPFS(projectId: string, path: string, content: string) {
    try {
        const projectDir = await getProjectDir(projectId)
        const parts = path.replace('/workspace/', '').split('/')
        let dir = projectDir
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

export async function deleteFromOPFS(projectId: string, path: string) {
    try {
        const projectDir = await getProjectDir(projectId)
        const parts = path.replace('/workspace/', '').split('/')
        let dir = projectDir
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i])
        }
        await dir.removeEntry(parts[parts.length - 1], { recursive: true })
    } catch (err) {
        console.warn('[OPFS] delete failed:', err)
    }
}

export async function renameInOPFS(projectId: string, oldPath: string, newPath: string) {
    // OPFS has no rename — read old, write new, delete old
    try {
        const projectDir = await getProjectDir(projectId)
        // Read old file
        const oldParts = oldPath.replace('/workspace/', '').split('/')
        let dir = projectDir
        for (let i = 0; i < oldParts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(oldParts[i])
        }
        const oldHandle = await dir.getFileHandle(oldParts[oldParts.length - 1])
        const file = await oldHandle.getFile()
        const content = await file.text()
        // Write to new path
        await syncToOPFS(projectId, newPath, content)
        // Delete old
        await deleteFromOPFS(projectId, oldPath)
    } catch (err) {
        console.warn('[OPFS] rename failed:', err)
    }
}

export async function hydrateFromOPFS(projectId: string) {
    try {
        const projectDir = await getProjectDir(projectId)
        await walk(projectDir, '/workspace')
    } catch (err) {
        console.warn('[OPFS] hydration failed:', err)
    }
}

async function walk(dir: FileSystemDirectoryHandle, base: string) {
    for await (const [name, handle] of (dir as any).entries()) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const path = `${base}/${name}`
        if (handle.kind === 'directory') {
            await walk(handle as FileSystemDirectoryHandle, path)
        } else {
            const file = await (handle as FileSystemFileHandle).getFile()
            writeFile(path, await file.text())
        }
    }
}

// ── PCH OPFS Cache ────────────────────────────────────────────────

export async function savePchToOPFS(hash: string, buffer: ArrayBuffer) {
    try {
        const root = await navigator.storage.getDirectory()
        const cacheDir = await root.getDirectoryHandle('.compiler_cache', { create: true })

        // Clean up old PCH files to save space silently
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const name of (cacheDir as any).keys()) {
            if (name.endsWith('.pch') && name !== `nova_${hash}.pch`) {
                await cacheDir.removeEntry(name).catch(() => { })
            }
        }

        const handle = await cacheDir.getFileHandle(`nova_${hash}.pch`, { create: true })
        const writable = await handle.createWritable()
        await writable.write(buffer.slice(0))
        await writable.close()
    } catch (err) {
        console.warn('[OPFS] save PCH failed:', err)
    }
}

export async function loadPchFromOPFS(hash: string): Promise<ArrayBuffer | null> {
    try {
        const root = await navigator.storage.getDirectory()
        const cacheDir = await root.getDirectoryHandle('.compiler_cache')
        const handle = await cacheDir.getFileHandle(`nova_${hash}.pch`)
        const file = await handle.getFile()
        return await file.arrayBuffer()
    } catch {
        return null // Cache miss
    }
}
