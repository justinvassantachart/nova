import { useEffect } from 'react'
import { useEngine } from '@/engine/engine-context'
import { useIDEHost } from '@/use-ide-host'

// Forwards engine runtime events to the host's onEvent channel:
// 'terminal_stdout' with { text } per output chunk and 'program_exit'
// with { code } when the program ends. Gated on host.wantsRuntimeEvents
// because stdout is high-volume — persistence-oriented hosts (the LMS
// Firestore sink) shouldn't receive a Firestore write per cout line.
//
// Renders nothing; it exists so the subscription lives inside
// EngineProvider without coupling instrumentation to any visible panel.
export function HostEventBridge() {
    const engine = useEngine()
    const host = useIDEHost()

    useEffect(() => {
        if (!host?.wantsRuntimeEvents || !host.onEvent) return
        const onEvent = host.onEvent
        const u1 = engine.onStdout.subscribe((text) => onEvent('terminal_stdout', { text }))
        const u2 = engine.onExit.subscribe((code) => onEvent('program_exit', { code }))
        return () => { u1(); u2() }
    }, [engine, host])

    return null
}
