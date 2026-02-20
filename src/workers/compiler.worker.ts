// ── Compiler Worker ────────────────────────────────────────────────
// Receives files from main thread, runs @yowasp/clang, returns WASM

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { commands, Exit } from '@yowasp/clang';

const clangpp = commands['clang++'];

self.onmessage = async (e) => {
    if (e.data.type !== 'COMPILE') return;

    const files: Record<string, string> = e.data.files;

    try {
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

        // Build args — use wasm32-wasip1 target to match @yowasp/clang's sysroot layout
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
            'wasm32-wasip1',
            '-o',
            '/workspace/program.wasm',
        ];

        // Capture stderr for error messages
        const decoder = new TextDecoder();
        let stderrOutput = '';

        self.postMessage({ type: 'COMPILE_PROGRESS', message: 'Running clang++...' });

        const output = await clangpp(args, inputTree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) {
                    const text = decoder.decode(bytes, { stream: true });
                    stderrOutput += text;
                    // Stream errors back to terminal in real-time
                    self.postMessage({ type: 'COMPILE_STDERR', text });
                }
            },
        });

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

        // No WASM output but also no error — maybe warnings only
        self.postMessage({
            type: 'COMPILE_ERROR',
            errors: stderrOutput
                ? stderrOutput.split('\n').filter(Boolean)
                : ['Compilation produced no output.'],
        });
    } catch (err: unknown) {
        if (err instanceof Exit) {
            // Clang exited with non-zero status — error messages already streamed via stderr
            self.postMessage({
                type: 'COMPILE_ERROR',
                errors: [err.message],
            });
            return;
        }

        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({
            type: 'COMPILE_ERROR',
            errors: [message],
        });
    }
};

export { }; // Make it a module
