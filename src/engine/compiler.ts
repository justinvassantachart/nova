// ── Compiler Bridge ────────────────────────────────────────────────
// Manages the compiler Web Worker lifecycle

export interface CompileResult {
    success: boolean;
    errors: string[];
    wasmBinary: Uint8Array | null;
}

let compilerWorker: Worker | null = null;

export function compile(
    files: Record<string, string>,
): Promise<CompileResult> {
    return new Promise((resolve) => {
        // Terminate any existing worker
        if (compilerWorker) {
            compilerWorker.terminate();
        }

        compilerWorker = new Worker(
            new URL('../workers/compiler.worker.ts', import.meta.url),
            { type: 'module' },
        );

        compilerWorker.onmessage = (e) => {
            const { type, wasmBinary, errors } = e.data;

            if (type === 'COMPILE_DONE') {
                resolve({
                    success: true,
                    errors: [],
                    wasmBinary: new Uint8Array(wasmBinary),
                });
                compilerWorker?.terminate();
                compilerWorker = null;
            } else if (type === 'COMPILE_ERROR') {
                resolve({
                    success: false,
                    errors: errors || ['Unknown compilation error'],
                    wasmBinary: null,
                });
                compilerWorker?.terminate();
                compilerWorker = null;
            }
        };

        compilerWorker.onerror = (err) => {
            resolve({
                success: false,
                errors: [err.message || 'Worker error'],
                wasmBinary: null,
            });
            compilerWorker?.terminate();
            compilerWorker = null;
        };

        compilerWorker.postMessage({ type: 'COMPILE', files });
    });
}
