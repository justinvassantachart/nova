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
        let disposed = false
        let cleanup = () => {}

        // xterm measures the cell width at construction time. If JetBrains Mono
        // (a Google web font) hasn't loaded yet, it measures against the fallback
        // and characters render at the wrong stride once the real font arrives —
        // that's the "squished glyphs" / "missing spaces" symptom. Force-load the
        // font before opening the terminal.
        const fontsReady =
            typeof document !== 'undefined' && 'fonts' in document
                ? document.fonts.load('13px "JetBrains Mono"').catch(() => undefined)
                : Promise.resolve()

        void fontsReady.then(() => {
            if (disposed || !containerRef.current) return

            const term = new XTerm({
                fontFamily:
                    '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 13,
                lineHeight: 1.3,
                cursorBlink: true,
                cursorStyle: 'bar',
                theme: {
                    background: '#0a0a0a',
                    foreground: '#d4d4d4',
                    cursor: '#5BC2EE',
                    black: '#000',
                    brightBlack: '#666',
                    red: '#cd3131',
                    brightRed: '#f14c4c',
                    green: '#0dbc79',
                    brightGreen: '#23d18b',
                    yellow: '#e5e510',
                    brightYellow: '#f5f543',
                    blue: '#2472c8',
                    brightBlue: '#3b8eea',
                    magenta: '#bc3fbc',
                    brightMagenta: '#d670d6',
                    cyan: '#11a8cd',
                    brightCyan: '#29b8db',
                    white: '#e5e5e5',
                    brightWhite: '#fff',
                },
            })
            const fit = new FitAddon()
            term.loadAddon(fit)
            term.open(containerRef.current)
            fit.fit()

            term.writeln('\x1b[1;36mNova Terminal\x1b[0m\r\n\x1b[90mReady\x1b[0m\r\n')

            const ro = new ResizeObserver(() => {
                requestAnimationFrame(() => fit.fit())
            })
            ro.observe(containerRef.current)

            const onDataDisposable = term.onData((data) => {
                engine.writeStdin?.(data)
            })

            const unsubOut = engine.onStdout.subscribe((text) => term.write(text.replace(/\n/g, '\r\n')))
            const unsubErr = engine.onStderr.subscribe((text) => term.write(`\x1b[1;31m${text.replace(/\n/g, '\r\n')}\x1b[0m`))
            const unsubClr = engine.onClearTerminal.subscribe(() => term.clear())
            const unsubExt = engine.onExit.subscribe((code) =>
                term.writeln(`\r\n\x1b[90m  Program exited with code ${code ?? 0}  \x1b[0m\r\n`),
            )

            cleanup = () => {
                unsubOut(); unsubErr(); unsubClr(); unsubExt()
                onDataDisposable.dispose()
                ro.disconnect()
                term.dispose()
            }
        })

        return () => {
            disposed = true
            cleanup()
        }
    }, [engine])

    return <div ref={containerRef} className="w-full h-full bg-[#0a0a0a]" />
}
