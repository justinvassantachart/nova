// ── Executor Bridge ────────────────────────────────────────────────
// Manages the executor Web Worker + SharedArrayBuffer pacer

import { useNovaStore } from '../store';
import type { DrawCommand } from '../store';

let executorWorker: Worker | null = null;
let sab: SharedArrayBuffer | null = null;
let rafId: number | null = null;

export async function execute(wasmBinary: Uint8Array) {
    // Clean up previous execution
    stop();

    // Create SharedArrayBuffer for the 60 FPS pacer
    sab = new SharedArrayBuffer(4);
    const pacer = new Int32Array(sab);

    executorWorker = new Worker(
        new URL('../workers/executor.worker.ts', import.meta.url),
        { type: 'module' },
    );

    const term = (window as any).__novaTerminal; // eslint-disable-line @typescript-eslint/no-explicit-any

    return new Promise<void>((resolve) => {
        executorWorker!.onmessage = (msg) => {
            const { type } = msg.data;

            switch (type) {
                case 'STDOUT': {
                    // Write to xterm
                    if (term) {
                        const text: string = msg.data.text;
                        // Replace \n with \r\n for proper xterm rendering
                        term.write(text.replace(/\n/g, '\r\n'));
                    }
                    break;
                }

                case 'RENDER_BATCH': {
                    const queue: DrawCommand[] = msg.data.queue;

                    // Wait for browser's native refresh, then draw & unfreeze worker
                    if (rafId !== null) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => {
                        const canvas = (window as any).__novaCanvas as HTMLCanvasElement; // eslint-disable-line @typescript-eslint/no-explicit-any
                        if (canvas) {
                            const ctx = canvas.getContext('2d');
                            if (ctx) executeDrawQueue(ctx, queue);
                        }

                        // UNFREEZE the C++ worker
                        Atomics.store(pacer, 0, 1);
                        Atomics.notify(pacer, 0, 1);
                    });
                    break;
                }

                case 'ALLOC': {
                    useNovaStore.getState().addAllocation({
                        ptr: msg.data.ptr,
                        size: msg.data.size,
                        timestamp: Date.now(),
                    });
                    break;
                }

                case 'EXIT': {
                    if (term) {
                        term.writeln('');
                        term.writeln(
                            `\x1b[90m─── Program exited with code ${msg.data.code ?? 0} ───\x1b[0m`,
                        );
                    }
                    useNovaStore.getState().setIsRunning(false);
                    resolve();
                    break;
                }

                case 'ERROR': {
                    if (term) {
                        term.writeln(`\x1b[1;31m✗ Runtime error: ${msg.data.message}\x1b[0m`);
                    }
                    useNovaStore.getState().setIsRunning(false);
                    resolve();
                    break;
                }
            }
        };

        executorWorker!.onerror = (err) => {
            if (term) {
                term.writeln(`\x1b[1;31m✗ Worker error: ${err.message}\x1b[0m`);
            }
            useNovaStore.getState().setIsRunning(false);
            resolve();
        };

        // Send the WASM binary + SharedArrayBuffer to the worker
        executorWorker!.postMessage(
            { type: 'EXECUTE', wasmBinary: wasmBinary.buffer, sab },
            [wasmBinary.buffer],
        );
    });
}

export function stop() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if (executorWorker) {
        executorWorker.terminate();
        executorWorker = null;
    }
    sab = null;
}

// ── Draw Queue Processor ──────────────────────────────────────────
function executeDrawQueue(
    ctx: CanvasRenderingContext2D,
    queue: DrawCommand[],
) {
    for (const cmd of queue) {
        switch (cmd.type) {
            case 'CLEAR':
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                break;
            case 'CIRCLE':
                ctx.beginPath();
                ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
                ctx.fillStyle = cmd.color;
                ctx.fill();
                break;
            case 'RECT':
                ctx.fillStyle = cmd.color;
                ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
                break;
        }
    }
}
