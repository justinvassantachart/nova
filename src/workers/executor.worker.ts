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
    let inst: WebAssembly.Instance
    let callStackSPs: number[] = []

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
                JS_notify_free: (ptr: number) => self.postMessage({ type: 'FREE', ptr }),

                JS_notify_enter: () => {
                    if (!debugMode) return
                    const sp = inst.exports.__stack_pointer ? (inst.exports.__stack_pointer as WebAssembly.Global).value as number : 0
                    callStackSPs.push(sp)
                },
                JS_notify_exit: () => {
                    if (!debugMode) return
                    callStackSPs.pop()
                },

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

                // ── Debug stepping (Safari-safe) ───────────────────────
                // Uses SharedArrayBuffer state machine instead of postMessage
                // to avoid Safari's WebKit postMessage-before-Atomics.wait deadlock.
                //
                // Protocol:
                //   stateArr[0] = control: 1=PAUSED, 2=STOP, 3=RESUME/RUNNING
                //   stateArr[1] = current step ID
                //   stateArr[2] = (reserved)
                //   stateArr[3] = call stack depth
                //   stateArr[4..63] = call stack SPs
                JS_debug_step: (stepId: number) => {
                    if (!debugMode || !debugSab) return
                    const stateArr = new Int32Array(debugSab.buffer)

                    // 1. Clone live WASM memory into the shared snapshot buffer
                    if (e.data.memorySab) {
                        const memArr = new Uint8Array(wasmMemory.buffer)
                        const sabArr = new Uint8Array(e.data.memorySab as SharedArrayBuffer)
                        sabArr.set(memArr.subarray(0, Math.min(memArr.length, sabArr.length)))
                    }

                    // Keep SP accurate for this specific execution frame
                    const sp = inst.exports.__stack_pointer ? (inst.exports.__stack_pointer as WebAssembly.Global).value as number : 0
                    if (callStackSPs.length > 0) callStackSPs[callStackSPs.length - 1] = sp
                    else callStackSPs.push(sp)

                    // 2. Write the step ID
                    Atomics.store(stateArr, 1, stepId)

                    // 3. Send the recursion depths
                    Atomics.store(stateArr, 3, callStackSPs.length)
                    for (let i = 0; i < callStackSPs.length && i < 60; i++) {
                        Atomics.store(stateArr, 4 + i, callStackSPs[i])
                    }

                    // 4. Signal PAUSED state (1)
                    Atomics.store(stateArr, 0, 1)
                    Atomics.notify(stateArr, 0, 1)

                    // 5. Safari-safe wait loop: spin until resumed (3) or stopped (2)
                    while (Atomics.load(stateArr, 0) === 1) {
                        Atomics.wait(stateArr, 0, 1)
                    }

                    // 6. Check if we should stop
                    if (Atomics.load(stateArr, 0) === 2) {
                        throw new Error('__debug_stop')
                    }
                },
            },
        }

        const mod = await WebAssembly.compile(wasmBytes)
        inst = await WebAssembly.instantiate(mod, imports)
        wasmMemory = inst.exports.memory as WebAssembly.Memory

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
