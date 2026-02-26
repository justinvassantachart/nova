//   Compiler Pool  //

type ProgressCallback = (message: string) => void
type StderrCallback = (text: string) => void

export interface CompileOneResult {
    src: string
    assembly: string
}

export interface LinkResult {
    wasmBinary: ArrayBuffer
}

function spawnWorker(): Worker {
    return new Worker(
        new URL('../workers/compiler.worker.ts', import.meta.url),
        { type: 'module' },
    )
}

/** 
 * Centralized IPC Wrapper. 
 * Prevents memory leaks by ensuring event listeners are always cleaned up.
 */
function requestWorker<T>(
    worker: Worker,
    message: Record<string, unknown>,
    transfer: Transferable[],
    expectedDone: string,
    expectedErr: string,
    onStderr?: StderrCallback
): Promise<T> {
    return new Promise((resolve, reject) => {
        const handler = (e: MessageEvent) => {
            if (e.data.type === 'COMPILE_STDERR' && onStderr) {
                onStderr(e.data.text)
                return
            }

            if (message.requestId && e.data.requestId && e.data.requestId !== message.requestId) {
                return // Ignore messages belonging to other concurrent requests
            }

            if (e.data.type === expectedDone) {
                cleanup()
                resolve(e.data as T)
            } else if (e.data.type === expectedErr) {
                cleanup()
                reject(new Error(e.data.errors?.join('\n') || 'Worker Error'))
            }
        }

        const errorHandler = (err: ErrorEvent) => {
            cleanup()
            reject(new Error(`Worker fatal crash: ${err.message}`))
        }

        const cleanup = () => {
            worker.removeEventListener('message', handler)
            worker.removeEventListener('error', errorHandler)
        }

        worker.addEventListener('message', handler)
        worker.addEventListener('error', errorHandler)
        worker.postMessage(message, transfer)
    })
}

// STRICT ENCAPSULATION: Track state per-worker cleanly
interface WorkerNode {
    worker: Worker
    ready: Promise<void>
    hasSysroot: boolean
    hasPch: boolean
}

export class CompilerPool {
    #pool: WorkerNode[] = []

    #sysrootFiles: Record<string, string> | null = null
    #pchBinary: ArrayBuffer | null = null

    // PROMISE DEDUPLICATION: Prevents race conditions if user spam-clicks "Debug"
    #seedTask: Promise<void> | null = null
    #pchTask: Promise<boolean> | null = null

    constructor(size: number, warmWorker?: Worker) {
        if (warmWorker) {
            this.#pool.push({
                worker: warmWorker,
                ready: Promise.resolve(),
                hasSysroot: false,
                hasPch: false
            })
        }

        // Sizing is fire-and-forget initially
        this.ensureSize(size).catch(console.error)
    }

    #spawnOne(): WorkerNode {
        const worker = spawnWorker()
        const ready = new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                worker.removeEventListener('message', handler)
                worker.removeEventListener('error', errorHandler)
            }
            const handler = (e: MessageEvent) => {
                if (e.data.type === 'PRELOAD_DONE') {
                    cleanup()
                    resolve()
                }
            }
            const errorHandler = (err: ErrorEvent) => {
                cleanup()
                reject(new Error(`Worker preload failed: ${err.message}`))
            }
            worker.addEventListener('message', handler)
            worker.addEventListener('error', errorHandler)
        })

        return { worker, ready, hasSysroot: false, hasPch: false }
    }

    async ensureSize(size: number): Promise<void> {
        if (size <= this.#pool.length) return

        const newWorkers: WorkerNode[] = []
        while (this.#pool.length < size) {
            const node = this.#spawnOne()
            newWorkers.push(node)
            this.#pool.push(node)
        }

        await Promise.all(newWorkers.map(w => w.ready))

        // Ensure newly scaled workers catch up on global state
        const promises: Promise<void>[] = []
        if (this.#sysrootFiles) {
            promises.push(...newWorkers.map(w => this.#seedWorker(w, this.#sysrootFiles!)))
        }
        if (this.#pchBinary) {
            promises.push(...newWorkers.map(w => this.#loadPchWorker(w, this.#pchBinary!)))
        }
        await Promise.all(promises)
    }

    seedSysroot(sysrootFiles: Record<string, string>): Promise<void> {
        if (this.#seedTask) return this.#seedTask

        this.#sysrootFiles = sysrootFiles
        this.#seedTask = (async () => {
            const promises = this.#pool.map(w => this.#seedWorker(w, sysrootFiles))
            await Promise.all(promises)
        })()

        return this.#seedTask
    }

    async #seedWorker(node: WorkerNode, sysrootFiles: Record<string, string>): Promise<void> {
        if (node.hasSysroot) return
        await node.ready
        await requestWorker<void>(
            node.worker,
            { type: 'SEED_SYSROOT', sysrootFiles },
            [],
            'SEED_SYSROOT_DONE',
            'SEED_SYSROOT_ERROR'
        )
        node.hasSysroot = true
    }

    generatePCH(onProgress?: ProgressCallback, onStderr?: StderrCallback): Promise<boolean> {
        if (this.#pchTask) return this.#pchTask

        this.#pchTask = (async () => {
            if (this.#pool.length === 0) return false
            const primaryNode = this.#pool[0]
            await primaryNode.ready

            onProgress?.('Generating Precompiled Header (PCH) for standard library...')

            try {
                const res = await requestWorker<{ pchBinary: ArrayBuffer }>(
                    primaryNode.worker,
                    { type: 'GENERATE_PCH' },
                    [],
                    'GENERATE_PCH_DONE',
                    'GENERATE_PCH_ERROR',
                    onStderr
                )
                this.#pchBinary = res.pchBinary
                primaryNode.hasPch = true

                // Broadcast PCH to remaining scaled workers
                const broadcastPromises = this.#pool.slice(1).map(w => this.#loadPchWorker(w, this.#pchBinary!))
                await Promise.all(broadcastPromises)
                return true
            } catch (err: unknown) {
                if (onStderr) {
                    const msg = err instanceof Error ? err.message : String(err)
                    onStderr(`\x1b[33mWarning: PCH generation failed. Falling back to standard compilation.\n${msg}\x1b[0m\n`)
                }
                return false
            }
        })()

        return this.#pchTask
    }

    async #loadPchWorker(node: WorkerNode, pchBinary: ArrayBuffer): Promise<void> {
        if (node.hasPch) return
        await node.ready
        const copy = pchBinary.slice(0) // Safe transfer array clone
        await requestWorker<void>(
            node.worker,
            { type: 'LOAD_PCH', pchBinary: copy },
            [copy],
            'LOAD_PCH_DONE',
            'LOAD_PCH_ERROR'
        )
        node.hasPch = true
    }

    async compileAll(
        sources: string[],
        files: Record<string, string>,
        onProgress?: ProgressCallback,
        onStderr?: StderrCallback,
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>()
        const queue = [...sources]
        let hasError = false

        const promises = this.#pool.map(async (node) => {
            await node.ready
            while (true) {
                if (hasError) break;
                // ALGORITHMIC FIX: O(1) array pop instead of O(N) shift
                const src = queue.pop()
                if (!src) break

                onProgress?.(`Compiling ${src.split('/').pop()}...`)
                try {
                    const requestId = `${src}-${Date.now()}`
                    const result = await requestWorker<CompileOneResult>(
                        node.worker,
                        { type: 'COMPILE_ONE', src, files, requestId },
                        [],
                        'COMPILE_ONE_DONE',
                        'COMPILE_ONE_ERROR',
                        onStderr
                    )
                    results.set(result.src, result.assembly)
                    onProgress?.(`Compiled ${result.src.split('/').pop()}`)
                } catch (err) {
                    hasError = true
                    throw err
                }
            }
        })

        await Promise.all(promises)
        return results
    }

    async linkAssembly(
        asmEntries: Array<{ name: string; assembly: string }>,
        sysrootFiles: Record<string, string>,
        onProgress?: ProgressCallback,
        onStderr?: StderrCallback,
    ): Promise<LinkResult> {
        if (this.#pool.length === 0) throw new Error("Compiler pool is empty")
        const primaryNode = this.#pool[0]
        await primaryNode.ready

        const requestId = `link-${Date.now()}`
        onProgress?.('Assembling debug binary...')

        return requestWorker<LinkResult>(
            primaryNode.worker,
            { type: 'LINK_ASM', asmEntries, sysrootFiles, requestId },
            [],
            'LINK_ASM_DONE',
            'LINK_ASM_ERROR',
            onStderr
        )
    }

    dispose(): void {
        for (const node of this.#pool) node.worker.terminate()
        this.#pool = []
        this.#sysrootFiles = null
        this.#pchBinary = null
        this.#seedTask = null
        this.#pchTask = null
    }
}

export function createPool(sourceCount: number, warmWorker?: Worker): CompilerPool {
    const cpuCount = navigator.hardwareConcurrency || 2
    const poolSize = Math.min(cpuCount, sourceCount, 4)
    return new CompilerPool(Math.max(poolSize, 1), warmWorker)
}
