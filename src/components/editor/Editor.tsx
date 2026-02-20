import MonacoEditor from '@monaco-editor/react'
import { useEditorStore } from '@/store/editor-store'
import { useCallback } from 'react'
import { writeFile } from '@/vfs/volume'
import { FileCode2 } from 'lucide-react'

let opfsSyncTimer: ReturnType<typeof setTimeout> | null = null

export function Editor() {
    const { activeFile, activeFileContent, setActiveFileContent } = useEditorStore()

    const handleChange = useCallback((value: string | undefined) => {
        if (!value || !activeFile) return
        setActiveFileContent(value)
        writeFile(activeFile, value)

        if (opfsSyncTimer) clearTimeout(opfsSyncTimer)
        opfsSyncTimer = setTimeout(() => {
            import('@/vfs/opfs-sync').then(({ syncToOPFS }) => syncToOPFS(activeFile, value))
        }, 2000)
    }, [activeFile, setActiveFileContent])

    if (!activeFile) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <FileCode2 className="h-10 w-10" />
                <p className="text-sm">Select a file to start editing</p>
            </div>
        )
    }

    const lang = activeFile.endsWith('.h') || activeFile.endsWith('.cpp') || activeFile.endsWith('.c') ? 'cpp' : 'plaintext'

    return (
        <div className="h-full overflow-hidden">
            <div className="h-7 flex items-center px-3 text-xs text-muted-foreground border-b bg-card">
                {activeFile.replace('/workspace/', '')}
            </div>
            <MonacoEditor
                height="calc(100% - 28px)"
                language={lang}
                theme="vs-dark"
                value={activeFileContent}
                onChange={handleChange}
                options={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 14, lineHeight: 22,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                    renderLineHighlight: 'gutter',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    tabSize: 4, automaticLayout: true,
                }}
            />
        </div>
    )
}
