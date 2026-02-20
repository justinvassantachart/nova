import { Play, Square, Loader2, Bug, StepForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useExecutionStore } from '@/store/execution-store'
import { useCompilerStore } from '@/store/compiler-store'
import { useDebugStore } from '@/store/debug-store'
import { getAllFiles } from '@/vfs/volume'
import { compile } from '@/engine/compiler'
import { execute, stop, debugStep, debugStop } from '@/engine/executor'
import { instrumentWasmForStepping } from '@/engine/instrumenter'

export function Toolbar() {
    const { isCompiling, isRunning, setIsCompiling, setIsRunning } = useExecutionStore()
    const { cacheState, downloadProgress } = useCompilerStore()
    const { debugMode, currentLine, dwarfInfo } = useDebugStore()
    const compilerReady = cacheState === 'ready'

    const handleRun = async () => {
        const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!term) return
        try {
            term.clear()
            term.writeln('\x1b[1;33m⏳ Compiling…\x1b[0m')
            setIsCompiling(true)
            const result = await compile(getAllFiles())
            setIsCompiling(false)
            if (!result.success) {
                term.writeln('\x1b[1;31m✗ Compilation failed:\x1b[0m')
                result.errors.forEach((e) => term.writeln(`  \x1b[31m${e}\x1b[0m`))
                return
            }
            term.writeln('\x1b[1;32m✓ Compiled successfully\x1b[0m')
            term.writeln('\x1b[90m─────────────────────────\x1b[0m')
            setIsRunning(true)
            await execute(result.wasmBinary!)
        } catch (err: unknown) {
            term.writeln(`\x1b[1;31m✗ ${err instanceof Error ? err.message : err}\x1b[0m`)
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
            term.writeln('\x1b[1;33m⏳ Compiling with debug info…\x1b[0m')
            setIsCompiling(true)
            const result = await compile(getAllFiles())
            setIsCompiling(false)
            if (!result.success) {
                term.writeln('\x1b[1;31m✗ Compilation failed:\x1b[0m')
                result.errors.forEach((e) => term.writeln(`  \x1b[31m${e}\x1b[0m`))
                return
            }
            term.writeln('\x1b[1;32m✓ Compiled successfully\x1b[0m')
            term.writeln('\x1b[1;35m🔍 Instrumenting for debug stepping…\x1b[0m')

            // Instrument the WASM binary for line-level stepping
            const instrumented = instrumentWasmForStepping(result.wasmBinary!, dwarfInfo)

            term.writeln('\x1b[90m─────────────────────────\x1b[0m')
            setIsRunning(true)
            await execute(instrumented, true) // debugMode = true
        } catch (err: unknown) {
            term.writeln(`\x1b[1;31m✗ ${err instanceof Error ? err.message : err}\x1b[0m`)
        } finally {
            setIsCompiling(false)
            setIsRunning(false)
        }
    }

    const handleStop = () => { stop(); setIsRunning(false) }

    return (
        <div className="flex items-center h-10 px-3 gap-2 border-b bg-card">
            <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent mr-auto">
                ✦ NOVA
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
                    ⏸ Paused @ line {currentLine}
                </Badge>
            )}

            {/* Status badge */}
            <Badge variant={isCompiling ? 'default' : isRunning ? 'default' : 'secondary'} className="text-xs">
                {isCompiling ? '⏳ Compiling' : isRunning ? '▶ Running' : '● Ready'}
            </Badge>

            {/* Debug controls when paused */}
            {debugMode === 'paused' && (
                <>
                    <Button size="sm" onClick={debugStep} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white">
                        <StepForward className="h-3.5 w-3.5" /> Step
                    </Button>
                    <Button size="sm" variant="destructive" onClick={debugStop} className="gap-1">
                        <Square className="h-3.5 w-3.5" /> Stop Debug
                    </Button>
                </>
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
