// ── Compiler Worker ────────────────────────────────────────────────
// Receives files from main thread, runs @yowasp/clang, returns WASM

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e) => {
    if (e.data.type !== 'COMPILE') return;

    const files: Record<string, string> = e.data.files;

    try {
        // Dynamically import yowasp-clang
        const { commands } = await import('@yowasp/clang');
        const clangpp = commands['clang++'];

        // Build the input file tree for yowasp (Tree = { [name]: string | Uint8Array | Tree })
        const inputTree: Record<string, unknown> = {};
        const encoder = new TextEncoder();
        for (const [path, content] of Object.entries(files)) {
            // Convert /workspace/main.cpp → workspace/main.cpp for tree
            const treePath = path.startsWith('/') ? path.slice(1) : path;
            const parts = treePath.split('/');

            let node: Record<string, unknown> = inputTree;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!node[parts[i]]) node[parts[i]] = {};
                node = node[parts[i]] as Record<string, unknown>;
            }
            node[parts[parts.length - 1]] = encoder.encode(content);
        }

        // Collect all .cpp source files
        const cppFiles = Object.keys(files).filter(
            (f) => f.endsWith('.cpp') && !f.includes('sysroot/memory_tracker'),
        );

        // Build args per spec (without the initial 'clang++' — the command handles that)
        const args = [
            ...cppFiles,
            '/workspace/sysroot/memory_tracker.cpp',
            '-I/workspace/sysroot/',
            '-std=c++20',
            '-g',
            '-O0',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-target',
            'wasm32-wasi',
            '-o',
            '/workspace/program.wasm',
        ];

        const output = await clangpp(args, inputTree as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        // Check if output contains the wasm file
        if (output) {
            // Navigate the output tree to find program.wasm
            const workspace = (output as Record<string, unknown>)['workspace'] as Record<string, unknown> | undefined;
            const wasmOutput = workspace?.['program.wasm'] as Uint8Array | undefined;

            if (wasmOutput) {
                const buffer = wasmOutput.buffer.slice(
                    wasmOutput.byteOffset,
                    wasmOutput.byteOffset + wasmOutput.byteLength,
                );
                self.postMessage(
                    { type: 'COMPILE_DONE', wasmBinary: buffer },
                    [buffer],
                );
                return;
            }
        }

        self.postMessage({
            type: 'COMPILE_ERROR',
            errors: ['Compilation produced no output. Check for errors.'],
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        // yowasp Exit type contains error info
        const errObj = err as { files?: Record<string, unknown> };
        if (errObj.files) {
            // Try to read stderr from exit
            self.postMessage({
                type: 'COMPILE_ERROR',
                errors: [message],
            });
            return;
        }

        // Try to extract compiler error messages
        const errors = message
            .split('\n')
            .filter((line: string) => line.includes('error:') || line.includes('warning:'));

        self.postMessage({
            type: 'COMPILE_ERROR',
            errors: errors.length > 0 ? errors : [message],
        });
    }
};

export { }; // Make it a module
