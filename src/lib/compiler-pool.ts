// ── Compiler Pool ──────────────────────────────────────────────────
// Manages a pool of compiler workers for parallel .cpp → .s compilation.
//
// Why a pool?
//   @yowasp/clang is single-threaded WASM — you can't call clangpp()
//   concurrently within one worker. Multiple workers = true parallelism.
//
// Usage:
//   const pool = new CompilerPool(2)
//   const results = await pool.compileAll(sources, files, sysroot, onProgress)
//   const wasm = await pool.linkAssembly(asmEntries, sysroot, onProgress)
//   pool.dispose()

type ProgressCallback = (message: string) => void
type StderrCallback = (text: string) => void

interface CompileOneResult {
    src: string
    assembly: string
}

interface LinkResult {
    wasmBinary: ArrayBuffer
}

/** Spawns a fresh compiler worker. */
function spawnWorker(): Worker {
    return new Worker(
        new URL('../workers/compiler.worker.ts', import.meta.url),
        { type: 'module' },
    )
}

export class CompilerPool {
    #workers: Worker[] = []
    #ready: Promise<void>[] = []
    #size: number

    /**
     * @param size      Number of workers in the pool
     * @param warmWorker Optional pre-warmed worker (already loaded Clang WASM).
     *                   Used as the first worker — avoids a ~30s WASM preload.
     */
    constructor(size: number, warmWorker?: Worker) {
        this.#size = size

        // Slot 0: reuse the pre-warmed worker if available (already loaded)
        if (warmWorker) {
            this.#workers.push(warmWorker)
            this.#ready.push(Promise.resolve()) // Already ready!
        }

        // Remaining slots: spawn fresh workers
        const startIndex = warmWorker ? 1 : 0
        for (let i = startIndex; i < size; i++) {
            const w = spawnWorker()
            this.#workers.push(w)
            this.#ready.push(new Promise((resolve) => {
                const handler = (e: MessageEvent) => {
                    if (e.data.type === 'PRELOAD_DONE') {
                        w.removeEventListener('message', handler)
                        resolve()
                    }
                }
                w.addEventListener('message', handler)
            }))
        }
    }

    /** Wait for all workers to finish loading their Clang WASM. */
    async waitUntilReady(): Promise<void> {
        await Promise.all(this.#ready)
    }

    /**
     * Compile a single .cpp → .s using the specified worker.
     * Returns the raw assembly text.
     */
    compileOne(
        workerIndex: number,
        src: string,
        files: Record<string, string>,
        sysrootFiles: Record<string, string>,
        onStderr?: StderrCallback,
    ): Promise<CompileOneResult> {
        const worker = this.#workers[workerIndex]
        const requestId = `${src}-${Date.now()}`

        return new Promise((resolve, reject) => {
            const handler = (e: MessageEvent) => {
                if (e.data.type === 'COMPILE_STDERR' && onStderr) {
                    onStderr(e.data.text)
                    return
                }
                if (e.data.requestId !== requestId) return

                worker.removeEventListener('message', handler)
                if (e.data.type === 'COMPILE_ONE_DONE') {
                    resolve({ src: e.data.src, assembly: e.data.assembly })
                } else if (e.data.type === 'COMPILE_ONE_ERROR') {
                    reject(new Error(e.data.errors?.join('\n') || `Failed to compile ${src}`))
                }
            }
            worker.addEventListener('message', handler)
            worker.postMessage({ type: 'COMPILE_ONE', src, files, sysrootFiles, requestId })
        })
    }

    /**
     * Compile all source files in parallel across the pool.
     * Returns a Map of source filename → assembly text.
     */
    async compileAll(
        sources: string[],
        files: Record<string, string>,
        sysrootFiles: Record<string, string>,
        onProgress?: ProgressCallback,
        onStderr?: StderrCallback,
    ): Promise<Map<string, string>> {
        await this.waitUntilReady()

        const results = new Map<string, string>()
        const promises: Promise<void>[] = []

        for (let i = 0; i < sources.length; i++) {
            const src = sources[i]
            const workerIndex = i % this.#size
            onProgress?.(`Compiling ${src.split('/').pop()}…`)

            const p = this.compileOne(workerIndex, src, files, sysrootFiles, onStderr)
                .then((result) => {
                    results.set(result.src, result.assembly)
                    onProgress?.(`Compiled ${result.src.split('/').pop()}`)
                })
            promises.push(p)
        }

        await Promise.all(promises)
        return results
    }

    /**
     * Link pre-instrumented .s files into a .wasm binary.
     * Uses the first worker in the pool.
     */
    async linkAssembly(
        asmEntries: Array<{ name: string; assembly: string }>,
        sysrootFiles: Record<string, string>,
        onProgress?: ProgressCallback,
        onStderr?: StderrCallback,
    ): Promise<LinkResult> {
        const worker = this.#workers[0]
        const requestId = `link-${Date.now()}`

        onProgress?.('Assembling debug binary…')

        return new Promise((resolve, reject) => {
            const handler = (e: MessageEvent) => {
                if (e.data.type === 'COMPILE_STDERR' && onStderr) {
                    onStderr(e.data.text)
                    return
                }
                if (e.data.requestId !== requestId) return

                worker.removeEventListener('message', handler)
                if (e.data.type === 'LINK_ASM_DONE') {
                    resolve({ wasmBinary: e.data.wasmBinary })
                } else if (e.data.type === 'LINK_ASM_ERROR') {
                    reject(new Error(e.data.errors?.join('\n') || 'Linking failed'))
                }
            }
            worker.addEventListener('message', handler)
            worker.postMessage({ type: 'LINK_ASM', asmEntries, sysrootFiles, requestId })
        })
    }

    /** Terminate all workers in the pool. */
    dispose(): void {
        for (const w of this.#workers) w.terminate()
        this.#workers = []
        this.#ready = []
    }
}

/**
 * Create a pool sized for the current machine and workload.
 * Caps at 4 to avoid excessive memory usage (each worker loads ~30MB of Clang WASM).
 *
 * @param warmWorker Optional pre-warmed worker to reuse as the first pool slot.
 */
export function createPool(sourceCount: number, warmWorker?: Worker): CompilerPool {
    const cpuCount = navigator.hardwareConcurrency || 2
    const poolSize = Math.min(cpuCount, sourceCount, 4)
    return new CompilerPool(Math.max(poolSize, 1), warmWorker)
}
