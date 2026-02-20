// ── Compiler Bridge ────────────────────────────────────────────────
// Treats the compiler worker as a LONG-LIVED background service.
// Never terminates it — the preloaded WASM stays in memory.

import { getCompilerWorker } from '@/lib/compiler-cache'
import { getSysrootFiles } from '@/vfs/sysroot-loader'
import { parseDwarf } from './dwarf-parser'
import { useDebugStore } from '@/store/debug-store'

export interface CompileResult {
    success: boolean
    errors: string[]
    wasmBinary: Uint8Array | null
}

let worker: Worker | null = null

function ensureWorker(): Worker {
    if (!worker) {
        worker = getCompilerWorker()
        setupWorkerHandlers()
    }
    return worker
}

let currentResolve: ((result: CompileResult) => void) | null = null
let stderrLines: string[] = []

function setupWorkerHandlers() {
    if (!worker) return
    const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any

    worker.onmessage = (e) => {
        const { type } = e.data
        if (type === 'COMPILE_DONE') {
            const wasmBinary = new Uint8Array(e.data.wasmBinary)

            // Parse DWARF debug info from the compiled binary
            try {
                const dwarfInfo = parseDwarf(wasmBinary)
                useDebugStore.getState().setDwarfInfo(dwarfInfo)
                useDebugStore.getState().setWasmBinary(wasmBinary)
            } catch (err) {
                console.warn('[compiler] DWARF parse failed:', err)
            }

            currentResolve?.({ success: true, errors: [], wasmBinary })
            currentResolve = null
            stderrLines = []
        } else if (type === 'COMPILE_ERROR') {
            currentResolve?.({ success: false, errors: stderrLines.length ? stderrLines : (e.data.errors || ['Unknown error']), wasmBinary: null })
            currentResolve = null
            stderrLines = []
        } else if (type === 'COMPILE_STDERR') {
            if (term) term.write(e.data.text.replace(/\n/g, '\r\n'))
            stderrLines.push(...e.data.text.split('\n').filter(Boolean))
        } else if (type === 'COMPILE_PROGRESS') {
            if (term) term.writeln(`\x1b[90m${e.data.message}\x1b[0m`)
        } else if (type === 'PRELOAD_DONE') {
            // Worker just preloaded — if we have a pending compile, send it
        }
    }

    worker.onerror = (err) => {
        currentResolve?.({ success: false, errors: [err.message || 'Worker error'], wasmBinary: null })
        currentResolve = null
        stderrLines = []
        // Worker died — allow recreation on next compile
        worker = null
    }
}

export function compile(files: Record<string, string>, debugMode = false): Promise<CompileResult> {
    return new Promise((resolve) => {
        const w = ensureWorker()
        currentResolve = resolve
        stderrLines = []
        const sysrootFiles = getSysrootFiles()
        w.postMessage({ type: 'COMPILE', files, sysrootFiles, debugMode })
    })
}
