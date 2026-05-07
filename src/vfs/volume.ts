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

export async function initVFS() {
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

    refreshFileTree()
    useEditorStore.getState().setActiveFile('/workspace/main.cpp', readFile('/workspace/main.cpp'))
}
