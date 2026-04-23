import { useEffect } from 'react'
import { Play, Square, Loader2, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useExecutionStore } from '@/store/execution-store'
import { useCompilerStore } from '@/store/compiler-store'
import { useDebugStore } from '@/store/debug-store'
import { getAllFiles } from '@/vfs/volume'
import { useEngine } from '@/engine/EngineContext'
import { DebugControls } from './DebugControls'

export function Toolbar() {
    const engine = useEngine()
    const { isCompiling, isRunning, setIsCompiling, setIsRunning } = useExecutionStore()
    const { cacheState, downloadProgress } = useCompilerStore()
    const { debugMode, currentLine, currentFile, pushHistoryState, setDebugMode, reset } = useDebugStore()
    const compilerReady = cacheState === 'ready'

    useEffect(() => {
        const u1 = engine.onDebugPaused.subscribe((state) => pushHistoryState(state))
        const u2 = engine.onDebugResumed.subscribe(() => setDebugMode('running'))
        const u3 = engine.onExit.subscribe(() => {
            setIsRunning(false)
            if (useDebugStore.getState().debugMode !== 'idle') setDebugMode('idle')
        })
        return () => { u1(); u2(); u3() }
    }, [engine, pushHistoryState, setDebugMode, setIsRunning])

    const executePipeline = async (debug: boolean) => {
        if (isCompiling || isRunning) return
        setIsCompiling(true)
        const result = await engine.compile(getAllFiles(), debug)
        setIsCompiling(false)
        if (result.success) {
            setIsRunning(true)
            setDebugMode(debug ? 'running' : 'idle')
            await engine.run(debug)
        }
    }

    const handleRun = () => executePipeline(false)
    const handleDebug = () => executePipeline(true)
    const handleStop = () => { engine.stop(); reset() }

    return (
        <div className="flex items-center h-10 px-3 gap-2 border-b bg-card">
            <span className="font-bold text-sm tracking-wide text-foreground mr-auto">
                NOVA
            </span>

            {/* Compiler download progress */}
            {cacheState === 'downloading' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading compiler…</span>
                    <Progress value={downloadProgress} className="w-24 h-1.5" />
                </div>
            )}

            {/* Debug status */}
            {debugMode === 'paused' && (
                <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-400">
                    Paused in {currentFile ? currentFile.split('/').pop() : 'unknown'} at line {currentLine}
                </Badge>
            )}

            {/* Status badge */}
            <Badge variant={isCompiling ? 'default' : isRunning ? 'default' : 'secondary'} className="text-xs">
                {isCompiling ? 'Compiling' : isRunning ? 'Running' : 'Ready'}
            </Badge>

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
                                    className="bg-green-600 hover:bg-green-500 text-white gap-1"
                                >
                                    <Play className="h-3.5 w-3.5" /> Run
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
                        onClick={handleDebug}
                        disabled={!compilerReady || isCompiling}
                        className="bg-purple-600 hover:bg-purple-500 text-white gap-1"
                    >
                        <Bug className="h-3.5 w-3.5" /> Debug
                    </Button>
                </div>
            ) : isRunning && debugMode !== 'paused' ? (
                <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1">
                    <Square className="h-3.5 w-3.5" /> Stop
                </Button>
            ) : null}
        </div>
    )
}
