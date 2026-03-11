import { Volume } from 'memfs'
import { useFilesStore, type VFSNode } from '@/store/files-store'
import { useEditorStore } from '@/store/editor-store'
import { loadSysroot } from './sysroot-loader'

// ── Global Volume ──────────────────────────────────────────────
export const vol = new Volume()

// ── Templates ──────────────────────────────────────────────────
const DEFAULT_MAIN = `#include <iostream>

struct Node {
    int data;
    Node* next;
};

// Double every value in the list
void doubleValues(Node* head) {
    Node* current = head;
    while (current != nullptr) {
        current->data *= 2;
        current = current->next;
    }
}

int main() {
    // Build a linked list: 10 -> 20 -> 30
    Node* head = new Node{10, nullptr};
    head->next = new Node{20, nullptr};
    head->next->next = new Node{30, nullptr};

    // Print original values
    Node* current = head;
    while (current != nullptr) {
        std::cout << current->data << std::endl;
        current = current->next;
    }

    // Modify the list in a separate function (use "Step Into")
    doubleValues(head);

    // Print doubled values
    current = head;
    while (current != nullptr) {
        std::cout << current->data << std::endl;
        current = current->next;
    }

    // BUG: only free the head -- leak the rest!
    delete head;

    return 0;
}
`

const NOVA_H = `#pragma once
extern "C" {
    void clear_screen();
    void draw_circle(double x, double y, double radius, const char* hex_color);
    void draw_rect(double x, double y, double w, double h, const char* hex_color);
    void render_frame();
}
`

const CANVAS_DEMO = `#include <iostream>
#include "nova.h"

// ── Bouncing Ball Demo ──────────────────────────────────────
// This program uses the Nova canvas API to animate a ball
// bouncing around the screen, leaving a fading trail behind it.

int main2() {
    // Canvas dimensions (matches the Nova canvas panel)
    const double W = 600;
    const double H = 400;

    // Ball state
    double x = W / 2;
    double y = H / 2;
    double vx = 3.5;
    double vy = 2.8;
    double radius = 20;

    // Trail history (circular buffer)
    const int TRAIL_LEN = 25;
    double trail_x[25];
    double trail_y[25];
    int trail_idx = 0;
    bool trail_full = false;

    for (int i = 0; i < TRAIL_LEN; i++) {
        trail_x[i] = -100;
        trail_y[i] = -100;
    }

    // Color palette for the trail (purple to cyan gradient)
    const char* trail_colors[] = {
        "#2d1b69", "#33207a", "#39258b", "#3f2a9c",
        "#4530ad", "#4b35be", "#523bcf", "#5840e0",
        "#5e45f1", "#6a50f0", "#765bef", "#8266ee",
        "#8e71ed", "#9a7cec", "#a687eb", "#b292ea",
        "#be9de9", "#caa8e8", "#d6b3e7", "#e2bfe6",
        "#c8e0f0", "#aee0f5", "#94e0fa", "#7ae0ff",
        "#60e0ff"
    };

    // Background gradient colors (dark navy strips)
    const char* bg[] = {
        "#080811", "#0a0c17", "#0c101d", "#0e1423",
        "#101829", "#121c2f", "#142035", "#16243b"
    };

    // Main animation loop
    for (int frame = 0; frame < 600; frame++) {
        // ── Physics ──
        x += vx;
        y += vy;

        // Bounce off walls
        if (x - radius < 0)    { x = radius;     vx = -vx; }
        if (x + radius > W)    { x = W - radius; vx = -vx; }
        if (y - radius < 0)    { y = radius;     vy = -vy; }
        if (y + radius > H)    { y = H - radius; vy = -vy; }

        // ── Record trail ──
        trail_x[trail_idx] = x;
        trail_y[trail_idx] = y;
        trail_idx = (trail_idx + 1) % TRAIL_LEN;
        if (trail_idx == 0) trail_full = true;

        // ── Draw ──
        clear_screen();

        // Dark gradient background (stacked rectangles)
        for (int i = 0; i < 8; i++) {
            draw_rect(0, i * (H / 8), W, H / 8, bg[i]);
        }

        // Draw trail (growing circles with gradient colors)
        int count = trail_full ? TRAIL_LEN : trail_idx;
        for (int i = 0; i < count; i++) {
            int idx = trail_full
                ? (trail_idx + i) % TRAIL_LEN
                : i;
            double t = (double)i / (double)count;
            double r = 4.0 + t * (radius - 6);
            int colorIdx = (int)(t * (TRAIL_LEN - 1));
            draw_circle(trail_x[idx], trail_y[idx], r, trail_colors[colorIdx]);
        }

        // Draw the main ball (bright cyan with white highlight)
        draw_circle(x, y, radius, "#00e5ff");
        draw_circle(x - radius * 0.25, y - radius * 0.25, radius * 0.4, "#b2fff9");

        // Draw a floor line
        draw_rect(0, H - 2, W, 2, "#1a237e");

        // Sync frame to display (~60fps via SharedArrayBuffer pacer)
        render_frame();
    }

    std::cout << "Animation complete! (600 frames)" << std::endl;
    return 0;
}
`

const MEMORY_TRACKER = `typedef decltype(sizeof(0)) size_t;

extern "C" {
    extern void* __real_malloc(size_t size);
    extern void __real_free(void* ptr);

    // Synchronous Heap Tracking Array — UI reads directly from RAM
    struct AllocRecord { unsigned int ptr; unsigned int size; };
    __attribute__((used)) AllocRecord __nova_allocs[1024];
    __attribute__((used)) int __nova_alloc_count = 0;

    void* __wrap_malloc(size_t size) {
        void* ptr = __real_malloc(size);
        if (size > 0 && __nova_alloc_count < 1024) {
            __nova_allocs[__nova_alloc_count].ptr = (unsigned int) ptr;
            __nova_allocs[__nova_alloc_count].size = (unsigned int) size;
            __nova_alloc_count++;
        }
        return ptr;
    }

    void __wrap_free(void* ptr) {
        if (!ptr) return;
        for (int i = 0; i < __nova_alloc_count; i++) {
            if (__nova_allocs[i].ptr == (unsigned int)ptr) {
                __nova_allocs[i] = __nova_allocs[__nova_alloc_count - 1];
                __nova_alloc_count--;
                break;
            }
        }
        __real_free(ptr);
    }
}
`

// ── Current project ID ─────────────────────────────────────────
let activeProjectId = 'default-project'

export function getProjectId() { return activeProjectId }
export function setProjectId(id: string) { activeProjectId = id }

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
    // Also delete from OPFS to prevent "ghost files"
    import('./opfs-sync').then(({ deleteFromOPFS }) => deleteFromOPFS(activeProjectId, path))

    // If deleted file was active, clear editor
    const { activeFile } = useEditorStore.getState()
    if (activeFile === path) {
        useEditorStore.getState().setActiveFile('', '')
    }
    refreshFileTree()
}

export function renameItem(oldPath: string, newPath: string) {
    vol.renameSync(oldPath, newPath)
    // Persist rename to OPFS
    import('./opfs-sync').then(({ renameInOPFS }) => renameInOPFS(activeProjectId, oldPath, newPath))

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

// ── Get all workspace files (for compiler) ────────────────────
// Sysroot files are sent separately via getSysrootFiles()

export function getAllFiles(): Record<string, string> {
    const result: Record<string, string> = {}
    function walk(dir: string) {
        const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[]
        for (const entry of entries) {
            const full = dir === '/' ? `/ ${entry} ` : `${dir}/${entry}`
            const stat = vol.statSync(full)
            if (stat.isDirectory()) walk(full)
            else result[full] = vol.readFileSync(full, { encoding: 'utf8' }) as string
        }
    }
    walk('/workspace')

    // Include custom sysroot files (nova.h, memory_tracker.cpp) at /sysroot/ root
    // but NOT the /sysroot/include/ tree (that's sent separately via getSysrootFiles())
    try {
        const sysEntries = vol.readdirSync('/sysroot', { encoding: 'utf8' }) as string[]
        for (const entry of sysEntries) {
            const full = `/sysroot/${entry}`
            try {
                const stat = vol.statSync(full)
                if (!stat.isDirectory()) {
                    result[full] = vol.readFileSync(full, { encoding: 'utf8' }) as string
                }
            } catch { /* skip */ }
        }
    } catch { /* sysroot not initialized yet */ }

    return result
}

// ── Tree builder ───────────────────────────────────────────────

function buildTree(dir: string): VFSNode[] {
    const entries = vol.readdirSync(dir, { encoding: 'utf8' }) as string[]
    return entries
        .filter((e) => !e.startsWith('.'))
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
    // Only show /workspace in the explorer — sysroot is separate
    useFilesStore.getState().setFiles(buildTree('/workspace'))
}

// ── Init ───────────────────────────────────────────────────────

export async function initVFS() {
    // Sysroot is separate from workspace — not polluting student's project
    vol.mkdirSync('/sysroot', { recursive: true })
    writeFile('/sysroot/nova.h', NOVA_H)
    writeFile('/sysroot/memory_tracker.cpp', MEMORY_TRACKER)

    // Student workspace
    vol.mkdirSync('/workspace', { recursive: true })

    // Hydrate from OPFS
    try {
        const { hydrateFromOPFS } = await import('./opfs-sync')
        await hydrateFromOPFS(activeProjectId)
    } catch { /* OPFS not available */ }

    // Default files
    if (!vol.existsSync('/workspace/main.cpp')) {
        writeFile('/workspace/main.cpp', DEFAULT_MAIN)
    }
    if (!vol.existsSync('/workspace/canvas_demo.cpp')) {
        writeFile('/workspace/canvas_demo.cpp', CANVAS_DEMO)
    }

    refreshFileTree()
    useEditorStore.getState().setActiveFile('/workspace/main.cpp', readFile('/workspace/main.cpp'))

    // Load standard library sysroot in the background
    // (non-blocking — compilation will wait for it in the compiler bridge)
    loadSysroot().catch((err) =>
        console.warn('[initVFS] Sysroot load failed (std lib autocomplete unavailable):', err)
    )
}
