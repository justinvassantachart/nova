// Accumulates the host-event stream (IDEHost.onEvent) into the bits of
// runtime state that lesson checks consume: per-run stdout, the last exit
// code, and how often each instrumented action fired. One instance lives
// for the duration of a LessonRunner mount.

import type { EventType } from '@/ide-host'

export class LessonRuntime {
    private stdoutBuf = ''
    private exitCode: number | null = null
    private counts: Partial<Record<EventType, number>> = {}
    private listeners = new Set<() => void>()
    private snapshot = 0

    record = (type: EventType, payload: Record<string, unknown>) => {
        this.counts[type] = (this.counts[type] ?? 0) + 1
        if (type === 'run' || type === 'run_tests' || type === 'debug_restart') {
            // A new run starts a fresh output window so 'stdout' checks see
            // only what THIS execution printed.
            this.stdoutBuf = ''
            this.exitCode = null
        }
        // stderr chunks share the terminal event type (tagged via `stream`)
        // for replay fidelity; lesson stdout checks stay stdout-only.
        if (type === 'terminal_stdout' && payload.stream !== 'stderr') {
            this.stdoutBuf += String(payload.text ?? '')
        }
        if (type === 'program_exit') this.exitCode = Number(payload.code ?? 0)
        this.snapshot++
        this.listeners.forEach((fn) => fn())
    }

    // Clears accumulated state on "reset lesson" so action-count checks
    // can't auto-pass from a previous attempt.
    reset() {
        this.stdoutBuf = ''
        this.exitCode = null
        this.counts = {}
        this.snapshot++
        this.listeners.forEach((fn) => fn())
    }

    get stdout() { return this.stdoutBuf }
    get lastExit() { return this.exitCode }
    get eventCounts(): Partial<Record<string, number>> { return this.counts }

    // useSyncExternalStore contract.
    subscribe = (fn: () => void) => {
        this.listeners.add(fn)
        return () => { this.listeners.delete(fn) }
    }
    getSnapshot = () => this.snapshot
}
