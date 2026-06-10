// Live evaluation of a step's CheckSpec against the IDE's observable state.
// Re-evaluates when any input changes: the debug store (pauses, breakpoints,
// snapshots), the right-panel tab, the test store, the lesson runtime
// (host events: stdout / exit / action counts), or the workspace files.
// Workspace events fire per keystroke, so re-evaluation is throttled.

import { useEffect, useMemo, useState } from 'react'
import { useDebugStore } from '@/store/debug-store'
import { useExecutionStore } from '@/store/execution-store'
import { useTestStore } from '@/testing/test-store'
import { getAllFiles, subscribeWorkspaceChange } from '@/vfs/volume'
import { evaluateCheck, type CheckContext, type CheckResult } from './checks'
import type { CheckSpec, Lesson } from './types'
import type { LessonRuntime } from './runtime'

const EDIT_THROTTLE_MS = 200

export function useStepCheck(
    spec: CheckSpec,
    lesson: Lesson,
    runtime: LessonRuntime,
): CheckResult {
    const [tick, setTick] = useState(0)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const bump = () => setTick((t) => t + 1)
        const bumpThrottled = () => {
            if (timer) return
            timer = setTimeout(() => { timer = undefined; bump() }, EDIT_THROTTLE_MS)
        }
        const unsubs = [
            useDebugStore.subscribe(bump),
            useExecutionStore.subscribe(bump),
            useTestStore.subscribe(bump),
            runtime.subscribe(bump),
            subscribeWorkspaceChange(bumpThrottled),
        ]
        return () => {
            if (timer) clearTimeout(timer)
            unsubs.forEach((u) => u())
        }
    }, [runtime])

    return useMemo(() => {
        const debug = useDebugStore.getState()
        const ctx: CheckContext = {
            debug: {
                debugMode: debug.debugMode,
                currentLine: debug.currentLine,
                currentFile: debug.currentFile,
                currentFunc: debug.currentFunc,
                breakpoints: debug.breakpoints,
                callStack: debug.callStack,
                memorySnapshot: debug.memorySnapshot,
            },
            rightTab: useExecutionStore.getState().rightTab,
            tests: useTestStore.getState().tests,
            files: safeGetAllFiles(),
            stdout: runtime.stdout,
            lastExit: runtime.lastExit,
            eventCounts: runtime.eventCounts,
            primaryFile: lesson.primaryFile,
        }
        return evaluateCheck(spec, ctx)
        // `tick` is the change signal for every external source read above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spec, lesson, runtime, tick])
}

// The VFS may not have /workspace yet on the very first render.
function safeGetAllFiles(): Record<string, string> {
    try { return getAllFiles() } catch { return {} }
}
