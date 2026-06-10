import { useCallback } from 'react'
import { useExecutionStore } from '@/store/execution-store'
import { useDebugStore } from '@/store/debug-store'
import { useTestStore } from '@/testing/test-store'
import { getAllFiles } from '@/vfs/volume'
import { useEngine } from '@/engine/engine-context'
import { useIDEHost } from '@/use-ide-host'

// One shared compile-and-run pipeline so the toolbar buttons, the floating
// debug toolbar's Restart, and the F5 hotkey all launch sessions through the
// same code path.
export function useRunPipeline() {
    const engine = useEngine()
    const host = useIDEHost()

    const run = useCallback(async (debug: boolean, isTest = false) => {
        const exec = useExecutionStore.getState()
        if (exec.isCompiling || exec.isRunning) return
        if (isTest) {
            useTestStore.getState().reset()
            exec.setRightTab('tests')
        }
        exec.setIsCompiling(true)
        host?.onEvent?.(isTest ? 'compile_test' : debug ? 'compile_debug' : 'compile', {})
        // compile() is a no-op file-staging step in NpmDapEngine; actual
        // compilation happens inside engine.run(). Compile failures surface
        // asynchronously via engine.onCompileError.
        await engine.compile(getAllFiles(), debug, isTest)
        useExecutionStore.getState().setIsCompiling(false)
        useExecutionStore.getState().setIsRunning(true)
        useDebugStore.getState().setDebugMode(debug ? 'running' : 'idle')
        host?.onEvent?.(isTest ? 'run_tests' : 'run', { debug })
        await engine.run(debug)
    }, [engine, host])

    const stop = useCallback(() => {
        engine.stop()
        useDebugStore.getState().reset()
    }, [engine])

    const restart = useCallback(async (debug: boolean) => {
        host?.onEvent?.('debug_restart', {})
        engine.stop()
        useDebugStore.getState().reset()
        await run(debug)
    }, [engine, host, run])

    return { run, stop, restart }
}
