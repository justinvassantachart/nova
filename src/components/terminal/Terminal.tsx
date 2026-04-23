import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useEngine } from '@/engine/EngineContext'
import '@xterm/xterm/css/xterm.css'

export function Terminal() {
    const containerRef = useRef<HTMLDivElement>(null)
    const engine = useEngine()

    useEffect(() => {
        if (!containerRef.current) return
        const term = new XTerm({
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace'",
            fontSize: 13, lineHeight: 1.4,
            theme: { background: 'oklch(0.145 0 0)', foreground: 'oklch(0.925 0 0)' }, cursorBlink: true, 
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(containerRef.current)
        fit.fit()
        
        term.writeln('\x1b[1;36mNova Terminal\x1b[0m\r\n\x1b[90mReady\x1b[0m\r\n')
        const ro = new ResizeObserver(() => fit.fit())
        ro.observe(containerRef.current)

        // Pure Reactive Subscriptions!
        const unsubOut = engine.onStdout.subscribe((text) => term.write(text.replace(/\n/g, '\r\n')))
        const unsubErr = engine.onStderr.subscribe((text) => term.write(`\x1b[1;31m${text.replace(/\n/g, '\r\n')}\x1b[0m`))
        const unsubClr = engine.onClearTerminal.subscribe(() => term.clear())
        const unsubExt = engine.onExit.subscribe((code) => term.writeln(`\r\n\x1b[90m  Program exited with code ${code ?? 0}  \x1b[0m\r\n`))

        return () => { unsubOut(); unsubErr(); unsubClr(); unsubExt(); ro.disconnect(); term.dispose(); }
    }, [engine])

    return <div ref={containerRef} className="w-full h-full" />
}
