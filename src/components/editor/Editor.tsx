import MonacoEditor, { useMonaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEditorStore } from '@/store/editor-store'
import { useDebugStore } from '@/store/debug-store'
import { useCallback, useRef, useEffect, useState } from 'react'
import { writeFile, getProjectId, fileExists, readFile } from '@/vfs/volume'
import { FileCode2 } from 'lucide-react'
import { useEngine } from '@/engine/EngineContext'
import { useClangd } from '@/clangd'
import { isCppPath, monacoLanguageFor } from '@/clangd/config'
import { useIDEHost } from '@/ide-host-context'

// Decorations are tracked per file URI so they survive model switching — when
// the user flips between files we leave each model's gutter/line state intact
// rather than re-running every effect against a stale, file-A-shaped set.
type DecoIds = { bp: string[]; step: string[] }

export function Editor() {
    const { activeFile, activeFileContent, setActiveFileContent, setActiveFile } = useEditorStore()
    const { currentLine, currentFile, debugMode, breakpoints, toggleBreakpoint } = useDebugStore()
    const monaco = useMonaco()
    const engine = useEngine()
    const host = useIDEHost()
    const clangd = useClangd()
    const lastEditEmit = useRef<Record<string, number>>({})

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const decoIdsByPath = useRef<Map<string, DecoIds>>(new Map())
    const ghostIdsRef = useRef<string[]>([])
    const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    const [editorReady, setEditorReady] = useState(false)

    const lastDebugState = useRef({ file: null as string | null, line: null as number | null })

    // Keep Monaco's per-URI model cache in sync with the editor store.
    // Monaco models are global state — when the workspace gets re-seeded
    // (e.g. switching student submissions, where both happen to use the
    // same file paths), the cached model would otherwise still hold the
    // previous workspace's content even after `setActiveFile` updates the
    // store. We only call setValue when the model already exists and is
    // out of sync, which leaves the normal user-typing path untouched
    // (model is already equal to activeFileContent at that point).
    useEffect(() => {
        if (!monaco || !activeFile) return
        const model = monaco.editor.getModel(monaco.Uri.parse(activeFile))
        if (!model) return
        if (model.getValue() === activeFileContent) return
        model.setValue(activeFileContent)
    }, [activeFile, activeFileContent, monaco])

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

    const getDecoIds = (path: string): DecoIds => {
        let entry = decoIdsByPath.current.get(path)
        if (!entry) {
            entry = { bp: [], step: [] }
            decoIdsByPath.current.set(path, entry)
        }
        return entry
    }

    const handleMount: OnMount = (editorInstance, monacoInstance) => {
        editorRef.current = editorInstance

        // Arm clangd on first focus/keystroke only when a C/C++ file is
        // active. Monaco tears these listeners down with the instance.
        const armIfCpp = () => {
            const path = useEditorStore.getState().activeFile
            if (path && isCppPath(path)) clangd.arm()
        }
        editorInstance.onDidFocusEditorWidget(armIfCpp)
        editorInstance.onKeyDown(armIfCpp)

        editorInstance.onMouseDown((e: editor.IEditorMouseEvent) => {
            if (!e.target || !e.target.position) return
            const targetType = e.target.type
            const MouseTargetType = monacoInstance.editor.MouseTargetType

            if (targetType === MouseTargetType.GUTTER_GLYPH_MARGIN || targetType === MouseTargetType.GUTTER_LINE_NUMBERS) {
                const line = e.target.position.lineNumber
                const file = useEditorStore.getState().activeFile
                if (line && file) {
                    toggleBreakpoint(file, line)
                    host?.onEvent?.('breakpoint_toggle', { file, line })
                }
            }
        })

        editorInstance.onMouseMove((e: editor.IEditorMouseEvent) => {
            if (!e.target || !e.target.position) return
            const model = editorInstance.getModel()
            if (!model) return
            const targetType = e.target.type
            const MouseTargetType = monacoInstance.editor.MouseTargetType
            const isGutter = targetType === MouseTargetType.GUTTER_GLYPH_MARGIN || targetType === MouseTargetType.GUTTER_LINE_NUMBERS

            if (isGutter) {
                const line = e.target.position.lineNumber
                const file = useEditorStore.getState().activeFile
                const bps = useDebugStore.getState().breakpoints
                const fileBps = file ? bps[file] || [] : []

                if (!fileBps.includes(line)) {
                    ghostIdsRef.current = model.deltaDecorations(ghostIdsRef.current, [{
                        range: new monacoInstance.Range(line, 1, line, 1),
                        options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-ghost' },
                    }])
                    return
                }
            }
            ghostIdsRef.current = model.deltaDecorations(ghostIdsRef.current, [])
        })

        editorInstance.onMouseLeave(() => {
            const model = editorInstance.getModel()
            if (model) ghostIdsRef.current = model.deltaDecorations(ghostIdsRef.current, [])
        })

        setEditorReady(true)
    }

    // Sync breakpoint decorations onto every known model (so toggling lines in
    // file A while viewing file B still updates A's gutter), then push the
    // currently active file's set to the engine.
    useEffect(() => {
        if (!monaco || !editorReady) return

        for (const [path, lines] of Object.entries(breakpoints)) {
            const model = monaco.editor.getModel(monaco.Uri.parse(path))
            if (!model) continue
            const decos = (lines ?? []).map((line) => ({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-dot' },
            }))
            const ids = getDecoIds(path)
            ids.bp = model.deltaDecorations(ids.bp, decos)
        }

        if (activeFile) {
            engine.setBreakpoints(activeFile, breakpoints[activeFile] || []).catch(console.warn)
        }
    }, [breakpoints, monaco, editorReady, activeFile, engine])

    // Step indicator: paint the paused line on its own model, clear everywhere
    // else. Reveal the line only when the user is actively viewing that file.
    useEffect(() => {
        if (!monaco || !editorReady) return

        for (const [path, ids] of decoIdsByPath.current.entries()) {
            if (path === currentFile) continue
            if (ids.step.length === 0) continue
            const model = monaco.editor.getModel(monaco.Uri.parse(path))
            if (model) ids.step = model.deltaDecorations(ids.step, [])
            else ids.step = []
        }

        if (debugMode === 'paused' && currentFile && currentLine !== null) {
            const model = monaco.editor.getModel(monaco.Uri.parse(currentFile))
            if (model) {
                const ids = getDecoIds(currentFile)
                ids.step = model.deltaDecorations(ids.step, [{
                    range: new monaco.Range(currentLine, 1, currentLine, 1),
                    options: {
                        isWholeLine: true,
                        className: 'debug-line-highlight',
                        glyphMarginClassName: 'debug-paused-dot',
                    },
                }])
                if (currentFile === activeFile) {
                    editorRef.current?.revealLineInCenter(currentLine)
                }
            }
        }
    }, [debugMode, currentLine, currentFile, activeFile, monaco, editorReady])

    const handleChange = useCallback((value: string | undefined) => {
        if (value === undefined || !activeFile) return
        setActiveFileContent(value)
        writeFile(activeFile, value)

        const now = Date.now()
        const last = lastEditEmit.current[activeFile] ?? 0
        if (now - last >= 1000) {
            lastEditEmit.current[activeFile] = now
            host?.onEvent?.('edit', { file: activeFile, length: value.length })
        }

        if (syncTimers.current[activeFile]) clearTimeout(syncTimers.current[activeFile])
        syncTimers.current[activeFile] = setTimeout(() => {
            import('@/vfs/opfs-sync').then(({ syncToOPFS }) => syncToOPFS(getProjectId(), activeFile, value))
            delete syncTimers.current[activeFile]
        }, 2000)
    }, [activeFile, setActiveFileContent, host])

    if (!activeFile) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <FileCode2 className="h-10 w-10" />
                <p className="text-sm">Select a file to start editing</p>
            </div>
        )
    }

    // Share the extension → language map with clangd so every C/C++
    // extension we support registers as 'cpp'.
    const lang = monacoLanguageFor(activeFile)

    return (
        <div className="h-full overflow-hidden bg-background flex flex-col">
            <div className="h-9 flex items-center px-3 gap-2 border-b border-border bg-[var(--color-chrome)] shrink-0">
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[12px] font-mono text-foreground">
                    {activeFile.replace('/workspace/', '')}
                </span>
            </div>
            {/* `path` makes Monaco keep one ITextModel per file (undo history,
                scroll, cursor survive file switches via setModel). We pass
                `defaultValue` for first-time model creation but deliberately
                omit `value` — passing it would re-fire executeEdits on every
                store update and wipe undo. The model is the source of truth. */}
            <div className="flex-1 min-h-0">
                <MonacoEditor
                    height="100%"
                    path={activeFile}
                    defaultValue={activeFileContent}
                    language={lang}
                    theme="vs-dark"
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
        </div>
    )
}
