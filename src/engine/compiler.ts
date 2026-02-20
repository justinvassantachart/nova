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

        const stderrLines: string[] = [];
        const term = (window as any).__novaTerminal; // eslint-disable-line @typescript-eslint/no-explicit-any

        compilerWorker.onmessage = (e) => {
            const { type } = e.data;

            switch (type) {
                case 'COMPILE_DONE': {
                    resolve({
                        success: true,
                        errors: [],
                        wasmBinary: new Uint8Array(e.data.wasmBinary),
                    });
                    compilerWorker?.terminate();
                    compilerWorker = null;
                    break;
                }

                case 'COMPILE_ERROR': {
                    resolve({
                        success: false,
                        errors: stderrLines.length > 0 ? stderrLines : (e.data.errors || ['Unknown compilation error']),
                        wasmBinary: null,
                    });
                    compilerWorker?.terminate();
                    compilerWorker = null;
                    break;
                }

                case 'COMPILE_STDERR': {
                    // Stream stderr to terminal in real-time
                    const text: string = e.data.text;
                    if (term) {
                        term.write(text.replace(/\n/g, '\r\n'));
                    }
                    // Collect lines for error reporting
                    const lines = text.split('\n').filter(Boolean);
                    stderrLines.push(...lines);
                    break;
                }

                case 'COMPILE_PROGRESS': {
                    if (term) {
                        term.writeln(`\x1b[90m${e.data.message}\x1b[0m`);
                    }
                    break;
                }
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
