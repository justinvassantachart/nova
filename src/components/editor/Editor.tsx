import MonacoEditor, { useMonaco } from '@monaco-editor/react'
import { useEditorStore } from '@/store/editor-store'
import { useDebugStore } from '@/store/debug-store'
import { useCallback, useRef, useEffect, useState } from 'react'
import { writeFile, getProjectId, fileExists, readFile } from '@/vfs/volume'
import { FileCode2 } from 'lucide-react'
import { syncBreakpoints } from '@/engine/executor'

export function Editor() {
    const { activeFile, activeFileContent, setActiveFileContent, setActiveFile } = useEditorStore()
    const { currentLine, currentFile, debugMode, breakpoints, toggleBreakpoint } = useDebugStore()
    const monaco = useMonaco()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decorationsRef = useRef<any>(null)
    // Breakpoint glyph decorations (separate collection so they don't conflict)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpDecorationsRef = useRef<any>(null)
    // Ghost breakpoint decoration (hover preview in gutter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hoverDecRef = useRef<any>(null)
    // Per-file debounce timers to prevent data loss when switching files
    const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    const [mountCount, setMountCount] = useState(0)

    // Auto-switch to paused file gracefully
    const lastDebugState = useRef({ file: null as string | null, line: null as number | null })

    useEffect(() => {
        if (debugMode === 'paused' && currentFile && currentLine !== null) {
            const stepped = lastDebugState.current.file !== currentFile || lastDebugState.current.line !== currentLine
            if (stepped) {
                lastDebugState.current = { file: currentFile, line: currentLine }
                if (currentFile !== useEditorStore.getState().activeFile) {
                    if (fileExists(currentFile)) {
                        setActiveFile(currentFile, readFile(currentFile))
                    }
                }
            }
        } else if (debugMode !== 'paused') {
            lastDebugState.current = { file: null, line: null }
        }
    }, [debugMode, currentFile, currentLine, setActiveFile])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMount = (editor: any, monacoInstance: any) => {
        editorRef.current = editor
        if (editor.createDecorationsCollection) {
            decorationsRef.current = editor.createDecorationsCollection([])
            bpDecorationsRef.current = editor.createDecorationsCollection([])
            hoverDecRef.current = editor.createDecorationsCollection([])
        }

        // Detect clicks in the gutter to toggle breakpoints
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.onMouseDown((e: any) => {
            // Target type 2 = GUTTER_GLYPH_MARGIN, 3 = GUTTER_LINE_NUMBERS
            if (e.target.type === 2 || e.target.type === 3 ||
                (monacoInstance && e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN)) {
                const line = e.target.position?.lineNumber
                const file = useEditorStore.getState().activeFile
                if (line && file) toggleBreakpoint(file, line)
            }
        })

        // Ghost breakpoint: show faded dot when hovering gutter on empty lines
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.onMouseMove((e: any) => {
            if (!hoverDecRef.current) return
            const isGutter = e.target.type === 2 || e.target.type === 3 ||
                (monacoInstance && e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN)

            if (isGutter && e.target.position) {
                const line = e.target.position.lineNumber
                const file = useEditorStore.getState().activeFile
                const bps = useDebugStore.getState().breakpoints
                const key = file ? `${file}:${line}` : ''
                if (key && !bps.has(key)) {
                    hoverDecRef.current.set([{
                        range: new monacoInstance.Range(line, 1, line, 1),
                        options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-ghost' },
                    }])
                    return
                }
            }
            hoverDecRef.current.set([])
        })

        editor.onMouseLeave(() => {
            hoverDecRef.current?.set([])
        })

        setMountCount(c => c + 1)
    }

    // ── Breakpoint visual markers (red dots in gutter) ─────────────
    useEffect(() => {
        if (!editorRef.current || !monaco || !bpDecorationsRef.current || !activeFile) return

        const newDecorations = Array.from(breakpoints)
            .filter(bp => bp.startsWith(`${activeFile}:`))
            .map(bp => {
                const line = parseInt(bp.substring(bp.lastIndexOf(':') + 1), 10)
                return {
                    range: new monaco.Range(line, 1, line, 1),
                    options: {
                        isWholeLine: false,
                        glyphMarginClassName: 'breakpoint-dot',
                    }
                }
            })
        bpDecorationsRef.current.set(newDecorations)

        // Push breakpoints to the SAB so the worker reads them instantly
        syncBreakpoints()
    }, [breakpoints, monaco, activeFile, mountCount])

    // ── Debug line highlighting ────────────────────────────────────
    // Uses Monaco's createDecorationsCollection API to highlight the
    // current paused line with a blue background + left border.
    useEffect(() => {
        if (!editorRef.current || !monaco || !decorationsRef.current) return

        if (debugMode === 'paused' && currentLine && currentFile === activeFile) {
            decorationsRef.current.set([{
                range: new monaco.Range(currentLine, 1, currentLine, 1),
                options: {
                    isWholeLine: true,
                    className: 'debug-line-highlight',
                    glyphMarginClassName: 'debug-paused-dot',
                },
            }])
            editorRef.current.revealLineInCenter(currentLine)
        } else {
            decorationsRef.current.set([])
        }
    }, [debugMode, currentLine, currentFile, activeFile, monaco, mountCount])

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
