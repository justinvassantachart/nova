import { Play, Square, Loader2, Bug, StepForward, SkipBack, FastForward, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useExecutionStore } from '@/store/execution-store'
import { useCompilerStore } from '@/store/compiler-store'
import { useDebugStore } from '@/store/debug-store'
import { getAllFiles } from '@/vfs/volume'
import { compile } from '@/engine/compiler'
import { execute, stop, debugStepInto, debugStepOver, debugContinue, debugStop } from '@/engine/executor'

export function Toolbar() {
    const { isCompiling, isRunning, setIsCompiling, setIsRunning } = useExecutionStore()
    const { cacheState, downloadProgress } = useCompilerStore()
    const { debugMode, currentLine, stepHistory, stepIndex, stepBack, stepForward } = useDebugStore()
    const compilerReady = cacheState === 'ready'

    const handleRun = async () => {
        const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!term) return
        try {
            term.clear()
            term.writeln('\x1b[1;33mCompiling…\x1b[0m')
            setIsCompiling(true)
            const result = await compile(getAllFiles())
            setIsCompiling(false)
            if (!result.success) {
                term.writeln('\x1b[1;31mCompilation failed:\x1b[0m')
                result.errors.forEach((e) => term.writeln(`  \x1b[31m${e}\x1b[0m`))
                return
            }
            term.writeln('\x1b[1;32mCompiled successfully\x1b[0m')
            term.writeln('\x1b[90m─────────────────────────\x1b[0m')
            setIsRunning(true)
            await execute(result.wasmBinary!)
        } catch (err: unknown) {
            term.writeln(`\x1b[1;31m${err instanceof Error ? err.message : err}\x1b[0m`)
        } finally {
            setIsCompiling(false)
            setIsRunning(false)
        }
    }

    const handleDebug = async () => {
        const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!term) return
        try {
            term.clear()
            term.writeln('\x1b[1;35mDebug build starting…\x1b[0m')
            setIsCompiling(true)

            const result = await compile(getAllFiles(), true)
            setIsCompiling(false)

            if (!result.success) {
                term.writeln('\x1b[1;31mCompilation failed:\x1b[0m')
                result.errors.forEach((e) => term.writeln(`  \x1b[31m${e}\x1b[0m`))
                return
            }
            term.writeln('\x1b[1;32mDebug build ready\x1b[0m')
            term.writeln('\x1b[90m─────────────────────────\x1b[0m')
            setIsRunning(true)

            await execute(result.wasmBinary!, true)
        } catch (err: unknown) {
            term.writeln(`\x1b[1;31m${err instanceof Error ? err.message : err}\x1b[0m`)
        } finally {
            setIsCompiling(false)
            setIsRunning(false)
        }
    }

    const handleStop = () => { stop(); setIsRunning(false) }

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
                    Paused at line {currentLine}
                </Badge>
            )}

            {/* Status badge */}
            <Badge variant={isCompiling ? 'default' : isRunning ? 'default' : 'secondary'} className="text-xs">
                {isCompiling ? 'Compiling' : isRunning ? 'Running' : 'Ready'}
            </Badge>

            {/* Debug controls when paused */}
            {debugMode === 'paused' && (
                <div className="flex gap-1.5">
                    <Button size="sm" onClick={debugContinue} className="gap-1 bg-green-600 hover:bg-green-500 text-white">
                        <FastForward className="h-3.5 w-3.5" /> Continue
                    </Button>
                    <Button size="sm" onClick={debugStepOver} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white">
                        <StepForward className="h-3.5 w-3.5" /> Step Over
                    </Button>
                    <Button size="sm" onClick={() => {
                        if (stepIndex >= 0 && stepIndex < stepHistory.length - 1) {
                            stepForward()
                        } else {
                            debugStepInto()
                        }
                    }} className="gap-1 bg-indigo-600 hover:bg-indigo-500 text-white">
                        <ArrowDown className="h-3.5 w-3.5" /> Step Into
                    </Button>
                    <Button size="sm" onClick={stepBack} disabled={stepHistory.length === 0 || stepIndex === 0}
                        className="gap-1 bg-zinc-700 hover:bg-zinc-600 text-white">
                        <SkipBack className="h-3.5 w-3.5" /> Back
                    </Button>
                    <Button size="sm" variant="destructive" onClick={debugStop} className="gap-1">
                        <Square className="h-3.5 w-3.5" /> Stop
                    </Button>
                </div>
            )}

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
