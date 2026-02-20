/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { createWasiShim } from '@/engine/wasi-shim'

self.onmessage = async (e) => {
    if (e.data.type !== 'EXECUTE') return
    const wasmBytes = new Uint8Array(e.data.wasmBinary)
    const pacer = new Int32Array(e.data.sab as SharedArrayBuffer)
    const debugMode = e.data.debugMode === true
    const debugSab = e.data.debugSab
        ? new Int32Array(e.data.debugSab as SharedArrayBuffer)
        : null
    let drawQueue: Array<Record<string, unknown>> = []
    let exitCode = 0

    function readCString(mem: WebAssembly.Memory, ptr: number): string {
        const b = new Uint8Array(mem.buffer)
        let end = ptr
        while (b[end] !== 0) end++
        return new TextDecoder().decode(b.slice(ptr, end))
    }

    try {
        let wasmMemory: WebAssembly.Memory
        const memProxy = { get buffer() { return wasmMemory.buffer } } as WebAssembly.Memory

        const wasi = createWasiShim({
            memory: memProxy,
            onStdout: (text: string) => self.postMessage({ type: 'STDOUT', text }),
            onExit: (code: number) => { exitCode = code },
        })

        const imports: WebAssembly.Imports = {
            wasi_snapshot_preview1: wasi,
            env: {
                JS_notify_alloc: (ptr: number, size: number) => self.postMessage({ type: 'ALLOC', ptr, size }),
                clear_screen: () => { drawQueue.push({ type: 'CLEAR' }) },
                draw_circle: (x: number, y: number, r: number, cp: number) => {
                    drawQueue.push({ type: 'CIRCLE', x, y, r, color: readCString(wasmMemory, cp) })
                },
                render_frame: () => {
                    self.postMessage({ type: 'RENDER_BATCH', queue: drawQueue })
                    drawQueue = []
                    Atomics.store(pacer, 0, 0)
                    Atomics.wait(pacer, 0, 0)
                },

                // ── Debug stepping ─────────────────────────────────────
                // Called by instrumented WASM when hitting a source line.
                // Freezes the worker thread until React tells us to continue.
                JS_debug_step: (lineNumber: number) => {
                    if (!debugMode || !debugSab) return

                    // Tell React we hit a source line
                    self.postMessage({ type: 'DEBUG_PAUSED', line: lineNumber })

                    // FREEZE the worker thread (0% CPU while frozen)
                    // React will Atomics.store(debugSab, 0, 1) + notify to resume
                    Atomics.store(debugSab, 0, 0)
                    Atomics.wait(debugSab, 0, 0)

                    // After resuming, check if we should stop (value = 2 means "stop")
                    const action = Atomics.load(debugSab, 0)
                    if (action === 2) {
                        throw new Error('__debug_stop')
                    }
                },
            },
        }

        const mod = await WebAssembly.compile(wasmBytes)
        const inst = await WebAssembly.instantiate(mod, imports)
        wasmMemory = inst.exports.memory as WebAssembly.Memory

        // Expose memory buffer reference for React to read during debug pauses
        if (debugMode) {
            // Transfer memory buffer reference via postMessage
            self.postMessage({
                type: 'DEBUG_MEMORY_READY',
                memoryBuffer: wasmMemory.buffer,
            })
        }

        const start = inst.exports._start as (() => void) | undefined
        if (start) {
            try { start() } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err)
                if (msg.includes('__wasi_proc_exit')) { /* normal exit */ }
                else if (msg.includes('__debug_stop')) { /* user stopped debug */ }
                else throw err
            }
        }
        self.postMessage({ type: 'EXIT', code: exitCode })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('__wasi_proc_exit')) self.postMessage({ type: 'EXIT', code: exitCode })
        else if (msg.includes('__debug_stop')) self.postMessage({ type: 'EXIT', code: 0 })
        else self.postMessage({ type: 'ERROR', message: msg })
    }
}

export { }
