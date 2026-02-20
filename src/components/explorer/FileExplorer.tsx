import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { ChevronRight, File, Folder, FolderOpen, FilePlus, FolderPlus, Trash2, Pencil } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    ContextMenu, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useFilesStore, type VFSNode } from '@/store/files-store'
import { useEditorStore } from '@/store/editor-store'
import { cn } from '@/lib/utils'
import {
    readFile, createFile, createFolder, deleteItem, renameItem, fileExists,
} from '@/vfs/volume'

// ── Inline name input (like VS Code) ───────────────────────────
function InlineInput({ defaultValue, onSubmit, onCancel }: {
    defaultValue?: string
    onSubmit: (name: string) => void
    onCancel: () => void
}) {
    const ref = useRef<HTMLInputElement>(null)
    const [value, setValue] = useState(defaultValue ?? '')

    useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

    const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && value.trim()) onSubmit(value.trim())
        if (e.key === 'Escape') onCancel()
    }

    return (
        <Input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => value.trim() ? onSubmit(value.trim()) : onCancel()}
            className="h-5 text-xs px-1 py-0 rounded-sm"
        />
    )
}

// ── Single tree item ───────────────────────────────────────────
function TreeItem({ node, depth }: { node: VFSNode; depth: number }) {
    const { activeFile, setActiveFile } = useEditorStore()
    const { expandedDirs, toggleDir, expandDir } = useFilesStore()
    const [renaming, setRenaming] = useState(false)
    const [creating, setCreating] = useState<'file' | 'folder' | null>(null)

    const isExpanded = expandedDirs.has(node.path)
    const isActive = activeFile === node.path

    const handleClick = () => {
        if (node.isDirectory) {
            toggleDir(node.path)
        } else {
            setActiveFile(node.path, readFile(node.path))
        }
    }

    const handleRename = (name: string) => {
        const parent = node.path.substring(0, node.path.lastIndexOf('/'))
        const newPath = `${parent}/${name}`
        if (newPath !== node.path && !fileExists(newPath)) {
            renameItem(node.path, newPath)
        }
        setRenaming(false)
    }

    const handleDelete = () => {
        deleteItem(node.path)
    }

    const handleCreate = (name: string) => {
        const basePath = node.isDirectory ? node.path : node.path.substring(0, node.path.lastIndexOf('/'))
        const newPath = `${basePath}/${name}`
        if (!fileExists(newPath)) {
            if (creating === 'folder') createFolder(newPath)
            else createFile(newPath, '')
        }
        setCreating(null)
        if (node.isDirectory) expandDir(node.path)
    }

    const Icon = node.isDirectory ? (isExpanded ? FolderOpen : Folder) : File
    const iconColor = node.isDirectory ? 'text-blue-400' : node.name.endsWith('.h') ? 'text-purple-400' : 'text-muted-foreground'

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        className={cn(
                            'flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs select-none',
                            'hover:bg-accent/50 transition-colors',
                            isActive && 'bg-accent text-accent-foreground',
                        )}
                        style={{ paddingLeft: 8 + depth * 16 }}
                        onClick={handleClick}
                    >
                        {node.isDirectory && (
                            <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                        )}
                        {!node.isDirectory && <span className="w-3" />}
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
                        {renaming ? (
                            <InlineInput defaultValue={node.name} onSubmit={handleRename} onCancel={() => setRenaming(false)} />
                        ) : (
                            <span className="truncate">{node.name}</span>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={() => { setCreating('file'); if (node.isDirectory) expandDir(node.path) }}>
                        <FilePlus className="mr-2 h-3.5 w-3.5" /> New File
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => { setCreating('folder'); if (node.isDirectory) expandDir(node.path) }}>
                        <FolderPlus className="mr-2 h-3.5 w-3.5" /> New Folder
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => setRenaming(true)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                    </ContextMenuItem>
                    <ContextMenuItem className="text-destructive" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Children */}
            {node.isDirectory && isExpanded && node.children?.map((child) => (
                <TreeItem key={child.path} node={child} depth={depth + 1} />
            ))}

            {/* Inline create input */}
            {creating && (
                <div style={{ paddingLeft: 8 + (depth + (node.isDirectory ? 1 : 0)) * 16 }} className="flex items-center gap-1 px-2 py-0.5">
                    {creating === 'folder' ? <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <InlineInput onSubmit={handleCreate} onCancel={() => setCreating(null)} />
                </div>
            )}
        </>
    )
}

// ── Explorer panel ─────────────────────────────────────────────
export function FileExplorer() {
    const files = useFilesStore((s) => s.files)
    const [creating, setCreating] = useState<'file' | 'folder' | null>(null)

    const handleRootCreate = (name: string) => {
        const path = `/workspace/${name}`
        if (!fileExists(path)) {
            if (creating === 'folder') createFolder(path)
            else createFile(path, '')
        }
        setCreating(null)
    }

    return (
        <div className="flex flex-col h-full bg-card">
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Explorer</span>
                <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCreating('file')}>
                        <FilePlus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCreating('folder')}>
                        <FolderPlus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <ScrollArea className="flex-1">
                <div className="py-1">
                    {files.map((node) => (
                        <TreeItem key={node.path} node={node} depth={0} />
                    ))}
                    {creating && (
                        <div className="flex items-center gap-1 px-2 py-0.5" style={{ paddingLeft: 8 }}>
                            {creating === 'folder' ? <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <InlineInput onSubmit={handleRootCreate} onCancel={() => setCreating(null)} />
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
