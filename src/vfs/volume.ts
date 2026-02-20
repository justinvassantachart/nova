import { Volume } from 'memfs'
import { useFilesStore, type VFSNode } from '@/store/files-store'
import { useEditorStore } from '@/store/editor-store'

// ── Global Volume ──────────────────────────────────────────────
export const vol = new Volume()

// ── Templates ──────────────────────────────────────────────────
const DEFAULT_MAIN = `#include <iostream>

int main() {
    std::cout << "Hello, Nova!" << std::endl;
    return 0;
}
`

const NOVA_H = `#pragma once
extern "C" {
    void clear_screen();
    void draw_circle(int x, int y, int radius, const char* hex_color);
    void render_frame();
}
`

const MEMORY_TRACKER = `extern "C" {
    extern void JS_notify_alloc(unsigned int addr, unsigned int size);
    extern void* __real_malloc(unsigned long size);

    void* __wrap_malloc(unsigned long size) {
        void* ptr = __real_malloc(size);
        JS_notify_alloc((unsigned int)ptr, (unsigned int)size);
        return ptr;
    }
}
`

// ── CRUD Operations ────────────────────────────────────────────

export function writeFile(path: string, content: string) {
    const dir = path.substring(0, path.lastIndexOf('/'))
    if (dir && !vol.existsSync(dir)) {
        vol.mkdirSync(dir, { recursive: true })
    }
    vol.writeFileSync(path, content, { encoding: 'utf8' })
}

export function readFile(path: string): string {
    return vol.readFileSync(path, { encoding: 'utf8' }) as string
}

export function createFile(path: string, content = '') {
    writeFile(path, content)
    refreshFileTree()
}

export function createFolder(path: string) {
    if (!vol.existsSync(path)) {
        vol.mkdirSync(path, { recursive: true })
    }
    refreshFileTree()
}

export function deleteItem(path: string) {
    const stat = vol.statSync(path)
    if (stat.isDirectory()) {
        vol.rmdirSync(path, { recursive: true } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    } else {
        vol.unlinkSync(path)
    }
    // If deleted file was active, clear editor
    const { activeFile } = useEditorStore.getState()
    if (activeFile === path) {
        useEditorStore.getState().setActiveFile('', '')
    }
    refreshFileTree()
}

export function renameItem(oldPath: string, newPath: string) {
    vol.renameSync(oldPath, newPath)
    // Update editor if renamed file was active
    const { activeFile } = useEditorStore.getState()
    if (activeFile === oldPath) {
        const content = readFile(newPath)
        useEditorStore.getState().setActiveFile(newPath, content)
    }
    refreshFileTree()
}

export function fileExists(path: string): boolean {
    return vol.existsSync(path)
}

// ── Get all files (for compiler) ───────────────────────────────

export function getAllFiles(): Record<string, string> {
    const result: Record<string, string> = {}
    function walk(dir: string) {
        const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[]
        for (const entry of entries) {
            const full = dir === '/' ? `/${entry}` : `${dir}/${entry}`
            const stat = vol.statSync(full)
            if (stat.isDirectory()) walk(full)
            else result[full] = vol.readFileSync(full, { encoding: 'utf8' }) as string
        }
    }
    walk('/workspace')
    return result
}

// ── Tree builder ───────────────────────────────────────────────

const HIDDEN = new Set(['sysroot', '.git'])

function buildTree(dir: string): VFSNode[] {
    const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[]
    return entries
        .filter((e) => !e.startsWith('.') && !HIDDEN.has(e))
        .map((name) => {
            const path = `${dir}/${name}`
            const isDir = vol.statSync(path).isDirectory()
            return { name, path, isDirectory: isDir, children: isDir ? buildTree(path) : undefined }
        })
        .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name)
        })
}

export function refreshFileTree() {
    useFilesStore.getState().setFiles(buildTree('/workspace'))
}

// ── Init ───────────────────────────────────────────────────────

export async function initVFS() {
    vol.mkdirSync('/workspace', { recursive: true })
    vol.mkdirSync('/workspace/sysroot', { recursive: true })
    writeFile('/workspace/sysroot/nova.h', NOVA_H)
    writeFile('/workspace/sysroot/memory_tracker.cpp', MEMORY_TRACKER)

    // Hydrate from OPFS
    try {
        const { hydrateFromOPFS } = await import('./opfs-sync')
        await hydrateFromOPFS()
    } catch { /* OPFS not available */ }

    // Default file
    if (!vol.existsSync('/workspace/main.cpp')) {
        writeFile('/workspace/main.cpp', DEFAULT_MAIN)
    }

    refreshFileTree()
    useEditorStore.getState().setActiveFile('/workspace/main.cpp', readFile('/workspace/main.cpp'))
}
