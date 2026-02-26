import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function Terminal() {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<XTerm | null>(null)

    useEffect(() => {
        if (!containerRef.current || termRef.current) return

        const term = new XTerm({
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13, lineHeight: 1.4,
            theme: {
                background: 'oklch(0.145 0 0)',
                foreground: 'oklch(0.925 0 0)',
                cursor: 'oklch(0.75 0.12 230)',
                selectionBackground: '#264f78',
            },
            cursorBlink: true, allowProposedApi: true,
        })

        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(containerRef.current)
        fit.fit()

        term.writeln('\x1b[1;36mNova Terminal\x1b[0m')
        term.writeln('\x1b[90mReady\x1b[0m')
        term.writeln('')

        termRef.current = term
            ; (window as any).__novaTerminal = term // eslint-disable-line @typescript-eslint/no-explicit-any

        const ro = new ResizeObserver(() => fit.fit())
        ro.observe(containerRef.current)

        // Cleanup when component unmounts (prevents memory leaks with routing)
        return () => {
            ro.disconnect()
            term.dispose()
            termRef.current = null
            delete (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any
        }
    }, [])

    return <div ref={containerRef} className="w-full h-full" />
}
