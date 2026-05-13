import { Volume } from 'memfs'
import { useFilesStore, type VFSNode } from '@/store/files-store'
import { useEditorStore } from '@/store/editor-store'

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

// ── Current project ID ─────────────────────────────────────────
let activeProjectId = 'default-project'

export function getProjectId() { return activeProjectId }
export function setProjectId(id: string) { activeProjectId = id }

// ── Workspace-change emitter ───────────────────────────────────
// Generic subscription used by hosts (e.g. LMS submission auto-save)
// to observe /workspace mutations. Volume.ts knows nothing about
// hosts — just fires events on writes. Subscribers debounce as needed.
type WsListener = () => void
const wsListeners = new Set<WsListener>()
export function subscribeWorkspaceChange(fn: WsListener): () => void {
    wsListeners.add(fn)
    return () => wsListeners.delete(fn)
}
function notifyWorkspaceChange() {
    wsListeners.forEach((fn) => {
        try { fn() } catch (e) { console.warn('[vfs] workspace listener error', e) }
    })
}

// ── CRUD Operations ────────────────────────────────────────────

export function writeFile(path: string, content: string) {
    const dir = path.substring(0, path.lastIndexOf('/'))
    if (dir && !vol.existsSync(dir)) {
        vol.mkdirSync(dir, { recursive: true })
    }
    vol.writeFileSync(path, content, { encoding: 'utf8' })
    if (path.startsWith('/workspace/')) notifyWorkspaceChange()
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
    if (path.startsWith('/workspace/')) notifyWorkspaceChange()
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
    if (oldPath.startsWith('/workspace/') || newPath.startsWith('/workspace/')) notifyWorkspaceChange()
}

export function fileExists(path: string): boolean {
    return vol.existsSync(path)
}

// ── Get all workspace files (for the runtime) ─────────────────

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
    useFilesStore.getState().setFiles(buildTree('/workspace'))
}

// ── Init ───────────────────────────────────────────────────────

export type InitVFSOptions = {
    // Namespace for OPFS persistence. Each assignment/submission gets its own.
    projectId?: string
    // Seed files when /workspace is empty (overrides default template).
    initialFiles?: Record<string, string>
    // Skip OPFS entirely. Used for read-mostly views (e.g. teacher reviewing a
    // student submission) where we always want the latest seed and don't want
    // local edits to clobber the cached snapshot on the next visit.
    ephemeral?: boolean
}

function wipeWorkspace() {
    try {
        const entries = vol.readdirSync('/workspace', { encoding: 'utf8' }) as string[]
        for (const e of entries) {
            const p = `/workspace/${e}`
            try {
                const stat = vol.statSync(p)
                if (stat.isDirectory()) vol.rmdirSync(p, { recursive: true } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
                else vol.unlinkSync(p)
            } catch { /* ignore */ }
        }
    } catch { /* /workspace doesn't exist yet */ }
}

// Replace /workspace contents with the given files. Used when switching
// assignments. Fires a single change notification.
export function bootstrapWorkspace(files: Record<string, string>) {
    wipeWorkspace()
    vol.mkdirSync('/workspace', { recursive: true })
    for (const [path, content] of Object.entries(files)) {
        const target = path.startsWith('/workspace/')
            ? path
            : `/workspace/${path.replace(/^\/+/, '')}`
        const dir = target.substring(0, target.lastIndexOf('/'))
        if (dir && !vol.existsSync(dir)) vol.mkdirSync(dir, { recursive: true })
        vol.writeFileSync(target, content, { encoding: 'utf8' })
    }
    refreshFileTree()
    const first = Object.keys(files).sort()[0]
    if (first) {
        const target = first.startsWith('/workspace/') ? first : `/workspace/${first.replace(/^\/+/, '')}`
        useEditorStore.getState().setActiveFile(target, readFile(target))
    }
    notifyWorkspaceChange()
}

export async function initVFS(opts: InitVFSOptions = {}) {
    // Ephemeral views (e.g. teacher reviewing a submission) don't persist to
    // OPFS — set projectId to empty so syncToOPFS/deleteFromOPFS no-op.
    if (opts.ephemeral) activeProjectId = ''
    else if (opts.projectId) activeProjectId = opts.projectId

    // Reset workspace before hydrating so switching assignments doesn't leak
    wipeWorkspace()
    vol.mkdirSync('/workspace', { recursive: true })

    if (!opts.ephemeral) {
        // Hydrate from OPFS (per-project)
        try {
            const { hydrateFromOPFS } = await import('./opfs-sync')
            await hydrateFromOPFS(activeProjectId)
        } catch { /* OPFS not available */ }
    }

    const workspaceEmpty = (() => {
        try { return (vol.readdirSync('/workspace', { encoding: 'utf8' }) as string[]).length === 0 }
        catch { return true }
    })()

    if (workspaceEmpty) {
        if (opts.initialFiles && Object.keys(opts.initialFiles).length > 0) {
            for (const [path, content] of Object.entries(opts.initialFiles)) {
                const target = path.startsWith('/workspace/')
                    ? path
                    : `/workspace/${path.replace(/^\/+/, '')}`
                writeFile(target, content)
            }
        } else if (!opts.ephemeral) {
            writeFile('/workspace/main.cpp', DEFAULT_MAIN)
        }
    }

    refreshFileTree()
    const pickActive = () => {
        if (vol.existsSync('/workspace/main.cpp')) return '/workspace/main.cpp'
        try {
            const entries = (vol.readdirSync('/workspace', { encoding: 'utf8' }) as string[]).sort()
            for (const e of entries) {
                const p = `/workspace/${e}`
                if (!vol.statSync(p).isDirectory()) return p
            }
        } catch { /* empty */ }
        return null
    }
    const active = pickActive()
    if (active) useEditorStore.getState().setActiveFile(active, readFile(active))
}
