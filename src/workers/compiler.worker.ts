/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { commands, Exit } from '@yowasp/clang'

const clangpp = commands['clang++']

// Notify main thread that the WASM is loaded (import succeeded)
self.postMessage({ type: 'PRELOAD_DONE' })

// Helper: insert a file into a nested tree structure
function insertIntoTree(tree: Record<string, unknown>, path: string, data: Uint8Array) {
    const parts = (path.startsWith('/') ? path.slice(1) : path).split('/')
    let node: Record<string, unknown> = tree
    for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]]) node[parts[i]] = {}
        node = node[parts[i]] as Record<string, unknown>
    }
    node[parts[parts.length - 1]] = data
}

self.onmessage = async (e) => {
    if (e.data.type === 'PRELOAD') return // Already loaded via static import

    if (e.data.type !== 'COMPILE') return
    const files: Record<string, string> = e.data.files
    const sysrootFiles: Record<string, string> = e.data.sysrootFiles || {}

    try {
        // Build input tree
        const tree: Record<string, unknown> = {}
        const enc = new TextEncoder()

        // Workspace + custom sysroot files (nova.h, memory_tracker.cpp)
        for (const [path, content] of Object.entries(files)) {
            insertIntoTree(tree, path, enc.encode(content))
        }

        // Standard library sysroot headers
        for (const [path, content] of Object.entries(sysrootFiles)) {
            insertIntoTree(tree, path, enc.encode(content))
        }

        // Collect .cpp sources (exclude sysroot — it's headers + memory_tracker)
        const sources = Object.keys(files).filter(
            (f) => f.endsWith('.cpp') && !f.includes('sysroot/'),
        )

        const args = [
            ...sources,
            '/sysroot/memory_tracker.cpp',
            '-I/sysroot/',
            // Standard library include paths
            '-isystem', '/sysroot/include/c++/v1',
            '-isystem', '/sysroot/include',
            '-std=c++20', '-g', '-O0',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-Wl,--export=__stack_pointer',
            '-target', 'wasm32-wasip1',
            '-o', '/workspace/program.wasm',
        ]

        const decoder = new TextDecoder()
        const output = await clangpp(args, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
            },
        })

        // Extract compiled WASM
        const ws = (output as Record<string, unknown>)?.['workspace'] as Record<string, unknown> | undefined
        const wasm = ws?.['program.wasm'] as Uint8Array | undefined
        if (wasm) {
            const buf = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)
            self.postMessage({ type: 'COMPILE_DONE', wasmBinary: buf }, [buf])
        } else {
            self.postMessage({ type: 'COMPILE_ERROR', errors: ['No output produced.'] })
        }
    } catch (err: unknown) {
        if (err instanceof Exit) {
            self.postMessage({ type: 'COMPILE_ERROR', errors: [err.message] })
        } else {
            const msg = err instanceof Error ? err.message : String(err)
            self.postMessage({ type: 'COMPILE_ERROR', errors: [msg] })
        }
    }
}

export { }
