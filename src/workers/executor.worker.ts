// ── Executor Worker ────────────────────────────────────────────────
// Runs compiled WASM with WASI shim + graphics bridge + SAB pacer

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { createWasiShim } from '../engine/wasi-shim';

self.onmessage = async (e) => {
    if (e.data.type !== 'EXECUTE') return;

    const wasmBytes = new Uint8Array(e.data.wasmBinary);
    const sab: SharedArrayBuffer = e.data.sab;
    const pacer = new Int32Array(sab);

    let drawQueue: Array<Record<string, unknown>> = [];
    let exitCode = 0;
    let hasExited = false;

    // Helper to read a null-terminated string from WASM memory
    function readCString(memory: WebAssembly.Memory, ptr: number): string {
        const bytes = new Uint8Array(memory.buffer);
        let end = ptr;
        while (bytes[end] !== 0) end++;
        return new TextDecoder().decode(bytes.slice(ptr, end));
    }

    try {
        // We need a reference to wasm memory — set after instantiation
        let wasmMemory: WebAssembly.Memory;

        // Create a proxy object that lazily returns the memory
        const memoryProxy = {
            get buffer() {
                return wasmMemory.buffer;
            },
        } as WebAssembly.Memory;

        const wasiShim = createWasiShim({
            memory: memoryProxy,
            onStdout: (text: string) => {
                self.postMessage({ type: 'STDOUT', text });
            },
            onExit: (code: number) => {
                exitCode = code;
                hasExited = true;
            },
        });

        const wasmImports = {
            wasi_snapshot_preview1: wasiShim,
            env: {
                // ── Memory Tracker Bridge ──
                JS_notify_alloc: (ptr: number, size: number) => {
                    self.postMessage({ type: 'ALLOC', ptr, size });
                },

                // ── Graphics Bridge ──
                clear_screen: () => {
                    drawQueue.push({ type: 'CLEAR' });
                },
                draw_circle: (x: number, y: number, r: number, colorPtr: number) => {
                    const color = readCString(wasmMemory, colorPtr);
                    drawQueue.push({ type: 'CIRCLE', x, y, r, color });
                },

                // ── THE 60 FPS PACER ──
                render_frame: () => {
                    // Send the batch of draw commands to main thread
                    self.postMessage({ type: 'RENDER_BATCH', queue: drawQueue });
                    drawQueue = [];

                    // FREEZE — wait until main thread signals after rendering
                    Atomics.store(pacer, 0, 0);
                    Atomics.wait(pacer, 0, 0);
                },
            },
        };

        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, wasmImports);

        // Grab the exported memory
        wasmMemory = instance.exports.memory as WebAssembly.Memory;

        // Call _start (WASI entry point)
        const start = instance.exports._start as (() => void) | undefined;
        if (start) {
            try {
                start();
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (!message.includes('__wasi_proc_exit')) {
                    throw err;
                }
            }
        }

        self.postMessage({ type: 'EXIT', code: exitCode });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('__wasi_proc_exit')) {
            self.postMessage({ type: 'EXIT', code: exitCode });
        } else if (!hasExited) {
            self.postMessage({ type: 'ERROR', message });
        }
    }
};

export { }; // Make it a module
