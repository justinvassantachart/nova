// ── Executor Bridge ────────────────────────────────────────────────
// Safari-safe: uses requestAnimationFrame polling on SharedArrayBuffer
// instead of postMessage for debug state, avoiding the WebKit deadlock.

import type { DrawCommand } from '@/store/execution-store'
import { readMemorySnapshot } from '@/lib/memory-reader'
import type { DebugPauseState } from '@/engine/IIDEEngine'
import type { DwarfInfo } from '@/engine/dwarf-types'

export interface ExecuteOptions {
    wasmBinary: Uint8Array
    debugMode: boolean
    dwarfInfo?: DwarfInfo | null
    stepMap?: Record<number, { line: number; func: string; file: string }>
    knownHeapTypes?: Record<number, string>
    activeBreakpoints?: Record<string, number[]>
    onStdout: (text: string) => void
    onStderr: (text: string) => void
    onCanvasDraw: (queue: DrawCommand[]) => void
    onExited: (code: number) => void
    onPaused: (state: DebugPauseState & { nextKnownTypes: Record<number, string> }) => void
}

let executorWorker: Worker | null = null
let sab: SharedArrayBuffer | null = null
let debugSab: SharedArrayBuffer | null = null
let memorySab: SharedArrayBuffer | null = null
let rafId: number | null = null
let debugRafId: number | null = null

export async function execute(options: ExecuteOptions) {
    stop()
    const {
        wasmBinary, debugMode, dwarfInfo, stepMap,
        knownHeapTypes = {}, activeBreakpoints = {},
        onStdout, onStderr, onCanvasDraw, onExited, onPaused
    } = options

    sab = new SharedArrayBuffer(4)
    const pacer = new Int32Array(sab)

    if (debugMode) {
        debugSab = new SharedArrayBuffer(4096) // 1024 Int32s — room for breakpoints
        memorySab = new SharedArrayBuffer(16 * 1024 * 1024) // 16MB memory snapshot buffer
        const arr = new Int32Array(debugSab)
        arr[0] = 3 // 3 = Running
        arr[2] = 1 // 1 = Step Into (pause on first instruction)
        syncBreakpoints(activeBreakpoints, stepMap || {}) // Load initial breakpoints into SAB

        let lastStepId = -1

        // Safari-safe polling loop: reads SAB state via requestAnimationFrame
        const pollDebug = () => {
            if (!debugSab || !memorySab) return
            const ctrl = new Int32Array(debugSab)

            if (Atomics.load(ctrl, 0) === 1) { // 1 = PAUSED
                const stepId = Atomics.load(ctrl, 1)
                const depth = Atomics.load(ctrl, 3)

                // Read interleaved (callId, sp, stepId) tuples
                const framesData: Array<{ id: number; sp: number; stepId: number }> = []
                for (let i = 0; i < depth && i < 40; i++) {
                    framesData.push({
                        id: Atomics.load(ctrl, 4 + i * 3),
                        sp: Atomics.load(ctrl, 4 + i * 3 + 1),
                        stepId: Atomics.load(ctrl, 4 + i * 3 + 2),
                    })
                }

                // Read native heap tracker pointers
                const countPtr = Atomics.load(ctrl, 128)
                const allocsPtr = Atomics.load(ctrl, 129)

                const mapEntry = stepMap ? stepMap[stepId] : undefined
                const line = mapEntry ? mapEntry.line : -1
                const func = mapEntry ? mapEntry.func : 'unknown'
                const file = mapEntry ? mapEntry.file : null

                if (lastStepId !== stepId) {
                    lastStepId = stepId
                    // Safari-safe: Use ArrayBuffer copy, NOT SharedArrayBuffer.slice()
                    const memCopy = new ArrayBuffer(memorySab.byteLength)
                    new Uint8Array(memCopy).set(new Uint8Array(memorySab))

                    // Build the recursive call stack with guaranteed-unique React keys
                    const newCallStack = framesData.map((fData, i) => {
                        const isTop = i === depth - 1
                        // Top frame uses current stepId. Older frames use their last known stepId.
                        const activeStepId = isTop ? stepId : fData.stepId
                        
                        // Look up exact location mapping
                        const frameMapEntry = (activeStepId !== -1 && stepMap) ? stepMap[activeStepId] : undefined
                        
                        return {
                            id: `frame-${fData.id}`,
                            sp: fData.sp,
                            // DAP Standard: If we can't map it (e.g. C++ STL internals), explicitly mark as [External Code]
                            func: frameMapEntry ? frameMapEntry.func : '[External Code]',
                            line: frameMapEntry ? frameMapEntry.line : -1,
                        }
                    })

                    const ptrs = { countPtr, allocsPtr }
                    const { snapshot, nextKnownTypes } = readMemorySnapshot(
                        memCopy, dwarfInfo || null, newCallStack, ptrs, knownHeapTypes
                    )

                    onPaused({
                        line, func, file, callStack: newCallStack, memorySnapshot: snapshot, nextKnownTypes
                    })
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
                    onStdout(msg.data.text)
                    break
                case 'RENDER_BATCH': {
                    const queue: DrawCommand[] = msg.data.queue
                    onCanvasDraw(queue)
                    Atomics.store(pacer, 0, 1)
                    Atomics.notify(pacer, 0, 1)
                    break
                }
                case 'EXIT':
                    onExited(msg.data.code ?? 0)
                    resolve()
                    break
                case 'ERROR':
                    onStderr(`Runtime error: ${msg.data.message}`)
                    onExited(1)
                    resolve()
                    break
            }
        }
        executorWorker!.onerror = (err) => {
            onStderr(`Worker error: ${err.message}`)
            onExited(1)
            resolve()
        }
        executorWorker!.postMessage({
            type: 'EXECUTE',
            wasmBinary: wasmBinary.buffer,
            sab,
            debugMode,
            debugSab: debugMode ? debugSab : undefined,
            memorySab: debugMode ? memorySab : undefined,
            stepMap: debugMode ? stepMap : undefined,
        }, [wasmBinary.buffer])
    })
}

// ── Breakpoint & Step Controls ─────────────────────────────────────
// SAB protocol slots:
//   [2]  = run mode: 0=Continue, 1=StepInto, 2=StepOver
//   [130] = target call depth (for StepOver)
//   [200] = breakpoint count
//   [201..1000] = breakpoint line numbers

/** Push the current breakpoint set into the SAB so the worker reads them instantly */
export function syncBreakpoints(breakpoints: Record<string, number[]>, stepMap: Record<number, { line: number; func: string; file: string }> = {}) {
    if (!debugSab) return
    const arr = new Int32Array(debugSab)

    // Convert "file:line" breakpoints into exact raw stepIds dynamically
    // This allows the worker to just check integers natively, with 0 string passing
    const activeStepIds: number[] = []
    for (const [idStr, info] of Object.entries(stepMap)) {
        const stepId = parseInt(idStr, 10)
        const fileBps = breakpoints[info.file]
        if (fileBps && fileBps.includes(info.line)) {
            activeStepIds.push(stepId)
        }
    }

    const count = Math.min(activeStepIds.length, 800)
    Atomics.store(arr, 200, count)
    for (let i = 0; i < count; i++) {
        Atomics.store(arr, 201 + i, activeStepIds[i])
    }
}

/** Step Into — pause on the very next source line */
export function debugStepInto() {
    if (!debugSab) return
    const arr = new Int32Array(debugSab)
    Atomics.store(arr, 2, 1) // 1 = Step Into
    Atomics.store(arr, 0, 3) // 3 = Resume
    Atomics.notify(arr, 0, 1)
}

/** Step Over — run until we return to the same call depth */
export function debugStepOver(currentDepth: number) {
    if (!debugSab) return
    const arr = new Int32Array(debugSab)
    Atomics.store(arr, 130, currentDepth) // Save target depth constraint
    Atomics.store(arr, 2, 2) // 2 = Step Over
    Atomics.store(arr, 0, 3) // 3 = Resume
    Atomics.notify(arr, 0, 1)
}

/** Continue — run until the next breakpoint or program end */
export function debugContinue() {
    if (!debugSab) return
    const arr = new Int32Array(debugSab)
    Atomics.store(arr, 2, 0) // 0 = Continue
    Atomics.store(arr, 0, 3) // 3 = Resume
    Atomics.notify(arr, 0, 1)
}

/** Stop debugging and terminate execution */
export function debugStop() {
    if (debugSab) {
        const arr = new Int32Array(debugSab)
        Atomics.store(arr, 0, 2) // 2 = Stop
        Atomics.notify(arr, 0, 1)
    }
    stop()
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
    // Moved to CanvasView logic
}
