// ── Compiler Bridge ────────────────────────────────────────────────
import { getCompilerWorker } from '@/lib/compiler-cache'

export interface CompileResult {
    success: boolean
    errors: string[]
    wasmBinary: Uint8Array | null
}

export function compile(files: Record<string, string>): Promise<CompileResult> {
    return new Promise((resolve) => {
        const worker = getCompilerWorker()
        const stderrLines: string[] = []
        const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any

        worker.onmessage = (e) => {
            const { type } = e.data
            if (type === 'COMPILE_DONE') {
                resolve({ success: true, errors: [], wasmBinary: new Uint8Array(e.data.wasmBinary) })
                worker.terminate()
            } else if (type === 'COMPILE_ERROR') {
                resolve({ success: false, errors: stderrLines.length ? stderrLines : (e.data.errors || ['Unknown error']), wasmBinary: null })
                worker.terminate()
            } else if (type === 'COMPILE_STDERR') {
                if (term) term.write(e.data.text.replace(/\n/g, '\r\n'))
                stderrLines.push(...e.data.text.split('\n').filter(Boolean))
            } else if (type === 'COMPILE_PROGRESS') {
                if (term) term.writeln(`\x1b[90m${e.data.message}\x1b[0m`)
            } else if (type === 'PRELOAD_DONE') {
                // Worker was pre-loaded, now send compile
                worker.postMessage({ type: 'COMPILE', files })
                return
            }
        }

        worker.onerror = (err) => {
            resolve({ success: false, errors: [err.message || 'Worker error'], wasmBinary: null })
            worker.terminate()
        }

        worker.postMessage({ type: 'COMPILE', files })
    })
}
