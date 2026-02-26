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
    const stepMap: Record<number, { line: number; func: string }> = e.data.stepMap || {}
    let drawQueue: Array<Record<string, unknown>> = []
    let exitCode = 0
    let inst: WebAssembly.Instance

    // ── Native Hardware Call Stack ──────────────────────────────
    // JS_notify_enter/exit are called by __cyg_profile_func_enter/exit
    // which Clang generates automatically with -finstrument-functions.
    // Each entry has a unique ID so React Flow can track nodes across renders.
    let callStack: Array<{ id: number; func: string; sp: number; frameSize: number }> = []
    let nextCallId = 1

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

        // Base environment — functions we explicitly implement
        const baseEnv: Record<string, Function> = {
            // Natively handled by C++ Memory Tracker
            JS_notify_alloc: () => { },
            JS_notify_free: () => { },

            // Explicit Exception & System Stubs
            __cxa_allocate_exception: () => { throw new Error("C++ Exception Thrown"); },
            __cxa_throw: () => { throw new Error("C++ Exception Thrown"); },
            __cxa_begin_catch: () => 0,
            __cxa_end_catch: () => { },
            __cxa_atexit: () => { },
            __cxa_pure_virtual: () => { },
            _ZSt28__throw_bad_array_new_lengthv: () => { throw new Error("Bad array length"); },

            // Hardware tells us exactly when a frame is pushed/popped!
            JS_notify_enter: (frameSize: number, updated: number) => {
                if (!debugMode) return
                const sp = inst.exports.__stack_pointer ? (inst.exports.__stack_pointer as WebAssembly.Global).value as number : 0
                // If it's a leaf function, the global pointer wasn't updated, so we subtract the size to get the true frame base
                const trueSp = updated ? sp : sp - frameSize
                console.log(`[executor] ENTER: depth=${callStack.length} sp=0x${trueSp.toString(16)} (global=0x${sp.toString(16)}, updated=${updated}) frameSize=${frameSize}`)
                callStack.push({ id: nextCallId++, func: 'unknown', sp: trueSp, frameSize })
            },
            JS_notify_exit: () => {
                if (!debugMode) return
                callStack.pop()
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
            // Protocol (4096-byte SAB):
            //   [0]  = control: 1=PAUSED, 2=STOP, 3=RESUME/RUNNING
            //   [1]  = current step ID
            //   [2]  = run mode: 0=Continue, 1=StepInto, 2=StepOver
            //   [3]  = call stack depth
            //   [4..123] = interleaved (callId, sp, frameSize) triples
            //   [128] = __nova_alloc_count ptr
            //   [129] = __nova_allocs ptr
            //   [130] = target call depth (for StepOver)
            //   [200] = breakpoint count
            //   [201..1000] = breakpoint line numbers
            JS_debug_step: (stepId: number) => {
                if (!debugMode || !debugSab) return
                const stateArr = new Int32Array(debugSab.buffer)

                // 1. Fast check for STOP
                if (Atomics.load(stateArr, 0) === 2) {
                    throw new Error('__debug_stop')
                }

                // 2. Update the active frame's function name
                const mapEntry = stepMap[stepId]
                const currentFunc = mapEntry ? mapEntry.func : 'unknown'
                const line = mapEntry ? mapEntry.line : -1

                const sp = inst.exports.__stack_pointer ? (inst.exports.__stack_pointer as WebAssembly.Global).value as number : 0
                if (callStack.length > 0) {
                    callStack[callStack.length - 1].func = currentFunc
                } else {
                    callStack.push({ id: nextCallId++, func: currentFunc, sp, frameSize: 0 })
                }

                // 3. Read run mode and breakpoints dynamically from SAB
                const runMode = Atomics.load(stateArr, 2) // 0=Continue, 1=StepInto, 2=StepOver
                const targetDepth = Atomics.load(stateArr, 130)

                let isBreakpoint = false
                const bpCount = Atomics.load(stateArr, 200)
                for (let i = 0; i < bpCount; i++) {
                    if (Atomics.load(stateArr, 201 + i) === line) {
                        isBreakpoint = true
                        break
                    }
                }

                // 4. Evaluate if we should physically freeze the thread
                let shouldPause = false
                if (isBreakpoint) {
                    shouldPause = true
                } else if (runMode === 1) { // Step Into
                    shouldPause = true
                } else if (runMode === 2) { // Step Over
                    if (callStack.length <= targetDepth) {
                        shouldPause = true
                    }
                }
                // runMode === 0 (Continue) → only pause at breakpoints

                // FAST-PATH: skip the 16MB memory copy and run at native speed!
                if (!shouldPause) {
                    return
                }

                // ── PAUSING LOGIC ──────────────────────────────────────

                // 5. Clone live WASM memory into the shared snapshot buffer
                if (e.data.memorySab) {
                    const memArr = new Uint8Array(wasmMemory.buffer)
                    const sabArr = new Uint8Array(e.data.memorySab as SharedArrayBuffer)
                    sabArr.set(memArr.subarray(0, Math.min(memArr.length, sabArr.length)))
                }

                // 6. Write step ID + call stack into the SAB
                Atomics.store(stateArr, 1, stepId)
                Atomics.store(stateArr, 3, callStack.length)

                for (let i = 0; i < callStack.length && i < 40; i++) {
                    Atomics.store(stateArr, 4 + i * 3, callStack[i].id)
                    Atomics.store(stateArr, 4 + i * 3 + 1, callStack[i].sp)
                    Atomics.store(stateArr, 4 + i * 3 + 2, callStack[i].frameSize)
                }

                // 7. Export native heap tracker pointers
                const getExportAddr = (name: string) => {
                    const exp = inst.exports[name]
                    if (typeof exp === 'number') return exp
                    if (exp && typeof (exp as any).value === 'number') return (exp as any).value // eslint-disable-line @typescript-eslint/no-explicit-any
                    return 0
                }
                Atomics.store(stateArr, 128, getExportAddr('__nova_alloc_count'))
                Atomics.store(stateArr, 129, getExportAddr('__nova_allocs'))

                // 8. Signal PAUSED state (1)
                Atomics.store(stateArr, 0, 1)
                Atomics.notify(stateArr, 0, 1)

                // 9. Safari-safe wait loop: spin until resumed (3) or stopped (2)
                while (Atomics.load(stateArr, 0) === 1) {
                    Atomics.wait(stateArr, 0, 1)
                }

                // 10. Check if we should stop
                if (Atomics.load(stateArr, 0) === 2) {
                    throw new Error('__debug_stop')
                }
            },
        };

        const mod = await WebAssembly.compile(wasmBytes)

        // ── Dynamic Import Proxy ───────────────────────────────────
        // Dynamically satisfy any required C++ system imports to prevent
        // WebAssembly.instantiate from crashing on missing callables.
        const expectedImports = WebAssembly.Module.imports(mod);
        for (const imp of expectedImports) {
            if (imp.module === 'env' && !(imp.name in baseEnv)) {
                baseEnv[imp.name] = () => {
                    console.warn(`[WASM] Safely ignored unimplemented C++ system call: env.${imp.name}`);
                    if (imp.name.includes('exception') || imp.name.includes('throw') || imp.name.includes('cxa')) {
                        throw new Error(`C++ Exception: ${imp.name}`);
                    }
                    return 0;
                };
            } else if (imp.module === 'wasi_snapshot_preview1' && !(imp.name in wasi)) {
                (wasi as any)[imp.name] = () => 0; // Stub missing WASI calls safely
            }
        }

        const imports: WebAssembly.Imports = {
            wasi_snapshot_preview1: wasi,
            env: baseEnv,
        }

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
