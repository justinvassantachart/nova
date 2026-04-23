import MonacoEditor, { useMonaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEditorStore } from '@/store/editor-store'
import { useDebugStore } from '@/store/debug-store'
import { useCallback, useRef, useEffect, useState } from 'react'
import { writeFile, getProjectId, fileExists, readFile } from '@/vfs/volume'
import { FileCode2 } from 'lucide-react'
import { useEngine } from '@/engine/EngineContext'

export function Editor() {
    const { activeFile, activeFileContent, setActiveFileContent, setActiveFile } = useEditorStore()
    const { currentLine, currentFile, debugMode, breakpoints, toggleBreakpoint } = useDebugStore()
    const monaco = useMonaco()
    const engine = useEngine()

    // Strict Typing
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
    const bpDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
    const hoverDecRef = useRef<editor.IEditorDecorationsCollection | null>(null)

    const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    const [mountCount, setMountCount] = useState(0)

    const lastDebugState = useRef({ file: null as string | null, line: null as number | null })

    useEffect(() => {
        if (debugMode === 'paused' && currentFile && currentLine !== null) {
            const stepped = lastDebugState.current.file !== currentFile || lastDebugState.current.line !== currentLine
            if (stepped) {
                lastDebugState.current = { file: currentFile, line: currentLine }
                if (currentFile !== useEditorStore.getState().activeFile) {
                    if (fileExists(currentFile)) setActiveFile(currentFile, readFile(currentFile))
                }
            }
        } else if (debugMode !== 'paused') {
            lastDebugState.current = { file: null, line: null }
        }
    }, [debugMode, currentFile, currentLine, setActiveFile])

    const handleMount: OnMount = (editorInstance, monacoInstance) => {
        editorRef.current = editorInstance

        if (editorInstance.createDecorationsCollection) {
            decorationsRef.current = editorInstance.createDecorationsCollection([])
            bpDecorationsRef.current = editorInstance.createDecorationsCollection([])
            hoverDecRef.current = editorInstance.createDecorationsCollection([])
        }

        editorInstance.onMouseDown((e: editor.IEditorMouseEvent) => {
            if (!e.target || !e.target.position) return
            const targetType = e.target.type
            const MouseTargetType = monacoInstance.editor.MouseTargetType

            if (targetType === MouseTargetType.GUTTER_GLYPH_MARGIN || targetType === MouseTargetType.GUTTER_LINE_NUMBERS) {
                const line = e.target.position.lineNumber
                const file = useEditorStore.getState().activeFile
                if (line && file) toggleBreakpoint(file, line)
            }
        })

        editorInstance.onMouseMove((e: editor.IEditorMouseEvent) => {
            if (!hoverDecRef.current || !e.target || !e.target.position) return
            const targetType = e.target.type
            const MouseTargetType = monacoInstance.editor.MouseTargetType
            const isGutter = targetType === MouseTargetType.GUTTER_GLYPH_MARGIN || targetType === MouseTargetType.GUTTER_LINE_NUMBERS

            if (isGutter) {
                const line = e.target.position.lineNumber
                const file = useEditorStore.getState().activeFile
                const bps = useDebugStore.getState().breakpoints
                const fileBps = file ? bps[file] || [] : []

                if (!fileBps.includes(line)) {
                    hoverDecRef.current.set([{
                        range: new monacoInstance.Range(line, 1, line, 1),
                        options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-ghost' },
                    }])
                    return
                }
            }
            hoverDecRef.current.set([])
        })

        editorInstance.onMouseLeave(() => hoverDecRef.current?.set([]))
        setMountCount(c => c + 1)
    }

    useEffect(() => {
        if (!editorRef.current || !monaco || !bpDecorationsRef.current || !activeFile) return
        
        const fileBreakpoints = breakpoints[activeFile] || []
        const newDecorations = fileBreakpoints.map(line => ({
            range: new monaco.Range(line, 1, line, 1),
            options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-dot' }
        }))
        
        bpDecorationsRef.current.set(newDecorations)
        
        // Asynchronously push breakpoints to engine adapter
        engine.setBreakpoints(activeFile, fileBreakpoints).catch(console.warn)
    }, [breakpoints, monaco, activeFile, mountCount, engine])

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

    // The return JSX rendering remains untouched!
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
