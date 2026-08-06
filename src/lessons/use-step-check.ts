// Live evaluation of a step's CheckSpec against the IDE's observable state.
// Re-evaluates when any input changes: the debug store (pauses, breakpoints,
// snapshots), the right-panel tab, the test store, the lesson runtime
// (host events: stdout / exit / action counts), or the workspace files.
// Workspace events fire per keystroke, so re-evaluation is throttled.

import { useEffect, useMemo, useState } from 'react'
import type { WebIDEInstanceHandle } from 'web-ide'
import { evaluateCheck, type CheckContext, type CheckResult } from './checks'
import type { CheckSpec, Lesson } from './types'
import type { LessonRuntime } from './runtime'

export function useStepCheck(
    spec: CheckSpec,
    lesson: Lesson,
    runtime: LessonRuntime,
    getIDEInstance: () => WebIDEInstanceHandle | null,
): CheckResult {
    const [tick, setTick] = useState(0)

    useEffect(() => {
        const bump = () => setTick((t) => t + 1)
        const instance = getIDEInstance()
        const unsubs = [
            runtime.subscribe(bump),
            ...(instance ? [instance.subscribe(bump)] : []),
        ]
        return () => {
            unsubs.forEach((u) => u())
        }
    }, [getIDEInstance, runtime])

    return useMemo(() => {
        const snapshot = getIDEInstance()?.snapshot()
        const ctx: CheckContext = {
            debug: snapshot?.debug ?? {
                debugMode: 'idle',
                currentLine: null,
                currentFile: null,
                currentFunc: null,
                breakpoints: {},
                callStack: [],
                memorySnapshot: null,
            },
            rightTab: snapshot?.rightPanel ?? '',
            tests: snapshot?.tests ?? [],
            files: snapshot?.workspace ?? {},
            stdout: runtime.stdout,
            lastExit: runtime.lastExit,
            eventCounts: runtime.eventCounts,
            primaryFile: lesson.primaryFile,
        }
        return evaluateCheck(spec, ctx)
        // `tick` is the change signal for every external source read above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getIDEInstance, spec, lesson, runtime, tick])
}
