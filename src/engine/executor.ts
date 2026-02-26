// ── Executor Bridge ────────────────────────────────────────────────
// Safari-safe: uses requestAnimationFrame polling on SharedArrayBuffer
// instead of postMessage for debug state, avoiding the WebKit deadlock.

import { useExecutionStore } from '@/store/execution-store'
import { useDebugStore } from '@/store/debug-store'
import type { DrawCommand } from '@/store/execution-store'
import { readMemorySnapshot } from '@/lib/memory-reader'

let executorWorker: Worker | null = null
let sab: SharedArrayBuffer | null = null
let debugSab: SharedArrayBuffer | null = null
let memorySab: SharedArrayBuffer | null = null
let rafId: number | null = null
let debugRafId: number | null = null

export async function execute(wasmBinary: Uint8Array, debugMode = false) {
    stop()
    sab = new SharedArrayBuffer(4)
    const pacer = new Int32Array(sab)
    const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any

    if (debugMode) {
        useDebugStore.getState().setKnownHeapTypes({})
        useDebugStore.getState().setMemorySnapshot(null)

        debugSab = new SharedArrayBuffer(1024) // 256 Int32s — deep recursion support
        memorySab = new SharedArrayBuffer(16 * 1024 * 1024) // 16MB memory snapshot buffer
        const arr = new Int32Array(debugSab)
        arr[0] = 3 // 3 = Running
        useDebugStore.getState().setDebugMode('running')

        // Safari-safe polling loop: reads SAB state via requestAnimationFrame
        const pollDebug = () => {
            if (!debugSab || !memorySab) return
            const ctrl = new Int32Array(debugSab)

            if (Atomics.load(ctrl, 0) === 1) { // 1 = PAUSED
                const stepId = Atomics.load(ctrl, 1)
                const depth = Atomics.load(ctrl, 3)

                // Read interleaved (callId, sp, frameSize) triples
                const framesData: Array<{ id: number; sp: number; frameSize: number }> = []
                for (let i = 0; i < depth && i < 40; i++) {
                    framesData.push({
                        id: Atomics.load(ctrl, 4 + i * 3),
                        sp: Atomics.load(ctrl, 4 + i * 3 + 1),
                        frameSize: Atomics.load(ctrl, 4 + i * 3 + 2),
                    })
                }

                // Read native heap tracker pointers
                const countPtr = Atomics.load(ctrl, 128)
                const allocsPtr = Atomics.load(ctrl, 129)

                const store = useDebugStore.getState()
                const mapEntry = store.stepMap[stepId]
                const line = mapEntry ? mapEntry.line : -1
                const func = mapEntry ? mapEntry.func : 'unknown'

                if (store.currentLine !== line || store.debugMode !== 'paused') {
                    // Safari-safe: Use ArrayBuffer copy, NOT SharedArrayBuffer.slice()
                    const memCopy = new ArrayBuffer(memorySab.byteLength)
                    new Uint8Array(memCopy).set(new Uint8Array(memorySab))

                    // Build the recursive call stack with guaranteed-unique React keys
                    const newCallStack = framesData.map((fData, i) => {
                        const isTop = i === depth - 1
                        const frameIdStr = `frame-${fData.id}` // Guaranteed unique!
                        const existing = store.callStack.find(f => f.id === frameIdStr)
                        return {
                            id: frameIdStr,
                            sp: fData.sp,
                            frameSize: fData.frameSize,
                            func: isTop ? func : (existing ? existing.func : 'unknown'),
                            line: isTop ? line : (existing ? existing.line : -1),
                        }
                    })

                    const ptrs = { countPtr, allocsPtr }
                    const { snapshot, nextKnownTypes } = readMemorySnapshot(
                        memCopy, store.dwarfInfo, newCallStack, ptrs, store.knownHeapTypes
                    )

                    store.setMemoryBuffer(memCopy)
                    store.setCallStack(newCallStack)
                    store.setHeapPointers(ptrs)
                    store.setKnownHeapTypes(nextKnownTypes)
                    store.setMemorySnapshot(snapshot)
                    store.setCurrentLine(line)
                    store.setCurrentFunc(func)
                    store.setStackPointer(framesData.length > 0 ? framesData[framesData.length - 1].sp : 0)
                    store.setDebugMode('paused')
                }
            }
            debugRafId = requestAnimationFrame(pollDebug)
        }
        debugRafId = requestAnimationFrame(pollDebug)
    }

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
                case 'EXIT':
                    term?.writeln(`\r\n\x1b[90m─── Program exited with code ${msg.data.code ?? 0} ───\x1b[0m`)
                    useExecutionStore.getState().setIsRunning(false)
                    if (debugMode) useDebugStore.getState().setDebugMode('idle')
                    resolve()
                    break
                case 'ERROR':
                    term?.writeln(`\x1b[1;31mRuntime error: ${msg.data.message}\x1b[0m`)
                    useExecutionStore.getState().setIsRunning(false)
                    if (debugMode) useDebugStore.getState().setDebugMode('idle')
                    resolve()
                    break
            }
        }
        executorWorker!.onerror = (err) => {
            term?.writeln(`\x1b[1;31mWorker error: ${err.message}\x1b[0m`)
            useExecutionStore.getState().setIsRunning(false)
            if (debugMode) useDebugStore.getState().setDebugMode('idle')
            resolve()
        }
        executorWorker!.postMessage({
            type: 'EXECUTE',
            wasmBinary: wasmBinary.buffer,
            sab,
            debugMode,
            debugSab: debugMode ? debugSab : undefined,
            memorySab: debugMode ? memorySab : undefined,
            stepMap: debugMode ? useDebugStore.getState().stepMap : undefined,
        }, [wasmBinary.buffer])
    })
}

/** Resume the paused debugger (step to next line) */
export function debugStep() {
    if (!debugSab) return
    const arr = new Int32Array(debugSab)
    Atomics.store(arr, 0, 3) // 3 = Resume
    Atomics.notify(arr, 0, 1)
    useDebugStore.getState().setDebugMode('running')
}

/** Stop debugging and terminate execution */
export function debugStop() {
    if (debugSab) {
        const arr = new Int32Array(debugSab)
        Atomics.store(arr, 0, 2) // 2 = Stop
        Atomics.notify(arr, 0, 1)
    }
    stop()
    useDebugStore.getState().reset()
}

export function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    if (debugRafId !== null) { cancelAnimationFrame(debugRafId); debugRafId = null }
    if (executorWorker) { executorWorker.terminate(); executorWorker = null }
    sab = null
    debugSab = null
    memorySab = null
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
