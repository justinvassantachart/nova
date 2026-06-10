import { useEffect } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useExecutionStore } from '@/store/execution-store'
import { useCompilerStore } from '@/store/compiler-store'
import { useDebugStore } from '@/store/debug-store'
import { useEngine } from '@/engine/engine-context'
import { useTestStore } from '@/testing/test-store'
import { SaveStatus } from './SaveStatus'
import { useIDEHost } from '@/use-ide-host'
import { useRunPipeline } from './use-run-pipeline'

export function Toolbar() {
    const engine = useEngine()
    const host = useIDEHost()
    const { isCompiling, isRunning, setIsRunning } = useExecutionStore()
    const { cacheState, downloadProgress } = useCompilerStore()
    const { debugMode, pushHistoryState, setDebugMode } = useDebugStore()
    const { run, stop } = useRunPipeline()
    const compilerReady = cacheState === 'ready'

    useEffect(() => {
        const u1 = engine.onDebugPaused.subscribe((state) => pushHistoryState(state))
        const u2 = engine.onDebugResumed.subscribe(() => setDebugMode('running'))
        const u3 = engine.onExit.subscribe(() => {
            setIsRunning(false)
            if (useDebugStore.getState().debugMode !== 'idle') setDebugMode('idle')
            // If a test crashed mid-flight the engine never emits SUITE_END, so
            // promote the unfinished case to a failure rather than leaving the
            // panel spinning forever.
            useTestStore.getState().finalize()
        })
        const u4 = engine.onTestEvent.subscribe((evt) => useTestStore.getState().processEvent(evt))
        const u5 = engine.onCompileError.subscribe((e) => {
            host?.onEvent?.('compile_error', { debug: e.isDebug })
        })
        // Mirror VS Code: when the debugger snaps a breakpoint to the next
        // executable line, move the gutter dot to where it actually bound.
        const u6 = engine.onBreakpointsValidated.subscribe(({ file, lines }) => {
            useDebugStore.getState().setFileBreakpoints(file, lines)
        })
        return () => { u1(); u2(); u3(); u4(); u5(); u6() }
    }, [engine, host, pushHistoryState, setDebugMode, setIsRunning])

    const handleRun = () => void run(false)
    const handleDebug = () => void run(true)
    const handleTest = () => void run(false, true)
    const handleStop = () => stop()

    return (
        <div className="flex items-center h-10 px-3 gap-2 border-b border-border bg-[var(--color-chrome)]">
            <span className="font-bold text-sm tracking-[0.18em] text-foreground select-none">
                NOVA<span className="text-primary">·</span>IDE
            </span>

            <SaveStatus />

            <div className="mr-auto" />

            {/* Compiler download progress */}
            {cacheState === 'downloading' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Codicon name="loading" size={12} spin />
                    <span>Loading compiler…</span>
                    <Progress value={downloadProgress} className="w-24 h-1.5" />
                </div>
            )}

            {/* Run / Debug / Stop — execution state lives in the status bar
                (StatusBar.tsx) and step controls in the floating debug
                toolbar over the editor (DebugToolbar.tsx), like VS Code. */}
            {!isRunning && debugMode !== 'paused' ? (
                <div className="flex gap-1.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <Button
                                    size="sm"
                                    onClick={handleRun}
                                    disabled={!compilerReady || isCompiling}
                                    className="bg-[oklch(0.65_0.18_145)] hover:bg-[oklch(0.7_0.18_145)] text-black gap-1 font-semibold"
                                >
                                    <Codicon name="play" size={14} /> Run
                                </Button>
                            </span>
                        </TooltipTrigger>
                        {!compilerReady && (
                            <TooltipContent>
                                <p>Compiler is still downloading…</p>
                            </TooltipContent>
                        )}
                    </Tooltip>

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDebug}
                        disabled={!compilerReady || isCompiling}
                        className="gap-1"
                    >
                        <Codicon name="bug" size={14} className="text-primary" /> Debug
                    </Button>

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTest}
                        disabled={!compilerReady || isCompiling}
                        className="gap-1"
                    >
                        <Codicon name="beaker" size={14} className="text-emerald-500" /> Tests
                    </Button>
                </div>
            ) : isRunning && debugMode !== 'paused' ? (
                <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1">
                    <Codicon name="debug-stop" size={14} /> Stop
                </Button>
            ) : null}
        </div>
    )
}
