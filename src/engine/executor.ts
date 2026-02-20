// ── Executor Bridge ────────────────────────────────────────────────
import { useExecutionStore } from '@/store/execution-store'
import type { DrawCommand } from '@/store/execution-store'

let executorWorker: Worker | null = null
let sab: SharedArrayBuffer | null = null
let rafId: number | null = null

export async function execute(wasmBinary: Uint8Array) {
    stop()
    sab = new SharedArrayBuffer(4)
    const pacer = new Int32Array(sab)
    const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any

    executorWorker = new Worker(
        new URL('../workers/executor.worker.ts', import.meta.url),
        { type: 'module' },
    )

    return new Promise<void>((resolve) => {
        executorWorker!.onmessage = (msg) => {
            switch (msg.data.type) {
                case 'STDOUT':
                    term?.write(msg.data.text.replace(/\n/g, '\r\n'))
                    break
                case 'RENDER_BATCH': {
                    const queue: DrawCommand[] = msg.data.queue
                    if (rafId !== null) cancelAnimationFrame(rafId)
                    rafId = requestAnimationFrame(() => {
                        const canvas = (window as any).__novaCanvas as HTMLCanvasElement
                        if (canvas) {
                            const ctx = canvas.getContext('2d')
                            if (ctx) drawQueue(ctx, queue)
                        }
                        Atomics.store(pacer, 0, 1)
                        Atomics.notify(pacer, 0, 1)
                    })
                    break
                }
                case 'ALLOC':
                    useExecutionStore.getState().addAllocation({
                        ptr: msg.data.ptr, size: msg.data.size, timestamp: Date.now(),
                    })
                    break
                case 'EXIT':
                    term?.writeln(`\r\n\x1b[90m─── Program exited with code ${msg.data.code ?? 0} ───\x1b[0m`)
                    useExecutionStore.getState().setIsRunning(false)
                    resolve()
                    break
                case 'ERROR':
                    term?.writeln(`\x1b[1;31m✗ Runtime error: ${msg.data.message}\x1b[0m`)
                    useExecutionStore.getState().setIsRunning(false)
                    resolve()
                    break
            }
        }
        executorWorker!.onerror = (err) => {
            term?.writeln(`\x1b[1;31m✗ Worker error: ${err.message}\x1b[0m`)
            useExecutionStore.getState().setIsRunning(false)
            resolve()
        }
        executorWorker!.postMessage({ type: 'EXECUTE', wasmBinary: wasmBinary.buffer, sab }, [wasmBinary.buffer])
    })
}

export function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    if (executorWorker) { executorWorker.terminate(); executorWorker = null }
    sab = null
}

function drawQueue(ctx: CanvasRenderingContext2D, queue: DrawCommand[]) {
    for (const cmd of queue) {
        switch (cmd.type) {
            case 'CLEAR': ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); break
            case 'CIRCLE':
                ctx.beginPath(); ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2)
                ctx.fillStyle = cmd.color; ctx.fill(); break
            case 'RECT': ctx.fillStyle = cmd.color; ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h); break
        }
    }
}
