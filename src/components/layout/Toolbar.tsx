import { useEffect } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useExecutionStore } from '@/store/execution-store'
import { useCompilerStore } from '@/store/compiler-store'
import { useDebugStore } from '@/store/debug-store'
import { getAllFiles } from '@/vfs/volume'
import { useEngine } from '@/engine/engine-context'
import { useTestStore } from '@/testing/test-store'
import { DebugControls } from './DebugControls'
import { SaveStatus } from './SaveStatus'
import { useIDEHost } from '@/use-ide-host'

export function Toolbar() {
    const engine = useEngine()
    const host = useIDEHost()
    const { isCompiling, isRunning, setIsCompiling, setIsRunning, setRightTab } = useExecutionStore()
    const { cacheState, downloadProgress } = useCompilerStore()
    const { debugMode, currentLine, currentFile, pushHistoryState, setDebugMode, reset } = useDebugStore()
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

    const executePipeline = async (debug: boolean, isTest = false) => {
        if (isCompiling || isRunning) return
        if (isTest) {
            useTestStore.getState().reset()
            setRightTab('tests')
        }
        setIsCompiling(true)
        host?.onEvent?.(isTest ? 'compile_test' : debug ? 'compile_debug' : 'compile', {})
        // compile() is a no-op file-staging step in NpmDapEngine; actual
        // compilation happens inside engine.run(). Compile failures surface
        // asynchronously via engine.onCompileError.
        await engine.compile(getAllFiles(), debug, isTest)
        setIsCompiling(false)
        setIsRunning(true)
        setDebugMode(debug ? 'running' : 'idle')
        host?.onEvent?.(isTest ? 'run_tests' : 'run', { debug })
        await engine.run(debug)
    }

    const handleRun = () => executePipeline(false)
    const handleDebug = () => executePipeline(true)
    const handleTest = () => executePipeline(false, true)
    const handleStop = () => { engine.stop(); reset() }

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

            {/* Debug status — when paused, the line indicator carries the state
                and the redundant Running/Ready badge would just add noise. */}
            {debugMode === 'paused' ? (
                <Badge variant="outline" className="text-xs border-yellow-500/60 text-yellow-400 bg-yellow-500/5 font-mono">
                    <span className="text-muted-foreground mr-1">paused at</span>
                    {currentFile ? currentFile.split('/').pop() : 'unknown'}:{currentLine}
                </Badge>
            ) : (
                <Badge variant="outline" className="text-xs font-mono">
                    {isCompiling ? (
                        <span className="text-primary">compiling</span>
                    ) : isRunning ? (
                        <span className="text-primary">running</span>
                    ) : (
                        <span className="text-muted-foreground">ready</span>
                    )}
                </Badge>
            )}

            {/* Debug controls when paused */}
            {debugMode === 'paused' && <DebugControls />}

            {/* Run / Debug / Stop */}
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
