import MonacoEditor, { useMonaco } from '@monaco-editor/react'
import { useEditorStore } from '@/store/editor-store'
import { useDebugStore } from '@/store/debug-store'
import { useCallback, useRef, useEffect } from 'react'
import { writeFile, getProjectId } from '@/vfs/volume'
import { FileCode2 } from 'lucide-react'

export function Editor() {
    const { activeFile, activeFileContent, setActiveFileContent } = useEditorStore()
    const { currentLine, debugMode } = useDebugStore()
    const monaco = useMonaco()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decorationsRef = useRef<any>(null)
    // Per-file debounce timers to prevent data loss when switching files
    const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMount = (editor: any) => {
        editorRef.current = editor
        if (editor.createDecorationsCollection) {
            decorationsRef.current = editor.createDecorationsCollection([])
        }
    }

    // ── Debug line highlighting ────────────────────────────────────
    // Uses Monaco's createDecorationsCollection API to highlight the
    // current paused line with a blue background + left border.
    useEffect(() => {
        if (!editorRef.current || !monaco || !decorationsRef.current) return

        if (debugMode === 'paused' && currentLine) {
            decorationsRef.current.set([{
                range: new monaco.Range(currentLine, 1, currentLine, 1),
                options: {
                    isWholeLine: true,
                    className: 'debug-line-highlight',
                    glyphMarginClassName: 'bg-primary rounded-full w-2 h-2 ml-2 mt-1',
                },
            }])
            editorRef.current.revealLineInCenter(currentLine)
        } else {
            decorationsRef.current.set([])
        }
    }, [debugMode, currentLine, monaco])

    const handleChange = useCallback((value: string | undefined) => {
        if (!value || !activeFile) return
        setActiveFileContent(value)
        writeFile(activeFile, value)

        // Clear only this file's timer — other files' timers keep running
        if (syncTimers.current[activeFile]) clearTimeout(syncTimers.current[activeFile])

        syncTimers.current[activeFile] = setTimeout(() => {
            import('@/vfs/opfs-sync').then(({ syncToOPFS }) => syncToOPFS(getProjectId(), activeFile, value))
            delete syncTimers.current[activeFile]
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
                key={activeFile}
                height="calc(100% - 28px)"
                language={lang}
                theme="vs-dark"
                value={activeFileContent}
                onChange={handleChange}
                onMount={handleMount}
                options={{
                    glyphMargin: true,
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
