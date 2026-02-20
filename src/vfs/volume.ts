import { Volume } from 'memfs';
import { useNovaStore, type VFSNode } from '../store';

// ── Global Volume ──────────────────────────────────────────────────
export const vol = new Volume();

// ── Default main.cpp template ──────────────────────────────────────
const DEFAULT_MAIN_CPP = `#include <iostream>

int main() {
    std::cout << "Hello, Nova!" << std::endl;
    return 0;
}
`;

// ── Nova graphics header (hidden sysroot) ──────────────────────────
const NOVA_H = `#pragma once
extern "C" {
    void clear_screen();
    void draw_circle(int x, int y, int radius, const char* hex_color);
    void render_frame();
}
`;

// ── Memory tracker (linker interceptor) ────────────────────────────
const MEMORY_TRACKER_CPP = `extern "C" {
    extern void JS_notify_alloc(unsigned int addr, unsigned int size);
    extern void* __real_malloc(unsigned long size);

    void* __wrap_malloc(unsigned long size) {
        void* ptr = __real_malloc(size);
        JS_notify_alloc((unsigned int)ptr, (unsigned int)size);
        return ptr;
    }
}
`;

// ── Helper: write a file, creating dirs as needed ──────────────────
export function writeFile(path: string, content: string) {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir && !vol.existsSync(dir)) {
        vol.mkdirSync(dir, { recursive: true });
    }
    vol.writeFileSync(path, content, { encoding: 'utf8' });
}

// ── Helper: read a file ────────────────────────────────────────────
export function readFile(path: string): string {
    return vol.readFileSync(path, { encoding: 'utf8' }) as string;
}

// ── Helper: get all files as a flat map ────────────────────────────
export function getAllFiles(): Record<string, string> {
    const result: Record<string, string> = {};

    function walk(dir: string) {
        const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[];
        for (const entry of entries) {
            const fullPath = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
            const stat = vol.statSync(fullPath);
            if (stat.isDirectory()) {
                walk(fullPath);
            } else {
                result[fullPath] = vol.readFileSync(fullPath, { encoding: 'utf8' }) as string;
            }
        }
    }

    walk('/workspace');
    return result;
}

// ── Build tree for explorer ────────────────────────────────────────
function buildTree(dir: string): VFSNode[] {
    const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[];
    return entries
        .filter((e) => !e.startsWith('.') && e !== 'sysroot')
        .map((entry) => {
            const fullPath = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
            const stat = vol.statSync(fullPath);
            const isDir = stat.isDirectory();
            return {
                name: entry,
                path: fullPath,
                isDirectory: isDir,
                children: isDir ? buildTree(fullPath) : undefined,
            };
        })
        .sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
}

// ── Refresh explorer in React ──────────────────────────────────────
export function refreshFileTree() {
    const tree = buildTree('/workspace');
    useNovaStore.getState().setFiles(tree);
}

// ── Initialize the VFS ─────────────────────────────────────────────
export async function initVFS() {
    // Create workspace
    vol.mkdirSync('/workspace', { recursive: true });
    vol.mkdirSync('/workspace/sysroot', { recursive: true });

    // Write sysroot (hidden from user in explorer, but accessible for compiler)
    writeFile('/workspace/sysroot/nova.h', NOVA_H);
    writeFile('/workspace/sysroot/memory_tracker.cpp', MEMORY_TRACKER_CPP);

    // Hydrate from OPFS if available
    try {
        const { hydrateFromOPFS } = await import('./opfs-sync');
        await hydrateFromOPFS();
    } catch {
        // OPFS not available — write default
        if (!vol.existsSync('/workspace/main.cpp')) {
            writeFile('/workspace/main.cpp', DEFAULT_MAIN_CPP);
        }
    }

    // If still no main.cpp after OPFS hydration, create default
    if (!vol.existsSync('/workspace/main.cpp')) {
        writeFile('/workspace/main.cpp', DEFAULT_MAIN_CPP);
    }

    refreshFileTree();

    // Auto-open main.cpp
    useNovaStore.getState().setActiveFile(
        '/workspace/main.cpp',
        readFile('/workspace/main.cpp'),
    );
}
