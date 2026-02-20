// ── OPFS Sync Module ───────────────────────────────────────────────
// Provides persistence: memfs ↔ Origin Private File System (OPFS)

import { writeFile as vfsWrite } from './volume';

// ── Sync a single file TO OPFS ────────────────────────────────────
export async function syncToOPFS(path: string, content: string) {
    try {
        const root = await navigator.storage.getDirectory();
        const parts = path.replace('/workspace/', '').split('/');
        let dir = root;

        // Navigate/create directories
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }

        const fileName = parts[parts.length - 1];
        const fileHandle = await dir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    } catch (err) {
        console.warn('[OPFS] sync failed:', err);
    }
}

// ── Hydrate memfs FROM OPFS ───────────────────────────────────────
export async function hydrateFromOPFS() {
    try {
        const root = await navigator.storage.getDirectory();
        await walkOPFS(root, '/workspace');
    } catch (err) {
        console.warn('[OPFS] hydration failed:', err);
    }
}

async function walkOPFS(
    dirHandle: FileSystemDirectoryHandle,
    basePath: string,
) {
    for await (const [name, handle] of (dirHandle as any).entries()) {
        const fullPath = `${basePath}/${name}`;

        if (handle.kind === 'directory') {
            await walkOPFS(handle as FileSystemDirectoryHandle, fullPath);
        } else {
            const file = await (handle as FileSystemFileHandle).getFile();
            const content = await file.text();
            vfsWrite(fullPath, content);
        }
    }
}
