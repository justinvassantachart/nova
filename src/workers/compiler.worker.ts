/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { commands, Exit } from '@yowasp/clang'

const clangpp = commands['clang++']

// Notify main thread that the WASM is loaded (import succeeded)
self.postMessage({ type: 'PRELOAD_DONE' })

// ── Message Protocol ───────────────────────────────────────────────
//
// COMPILE      — Release mode: single-pass .cpp → .wasm (unchanged)
// COMPILE_ONE  — Debug mode:   compile one .cpp → .s assembly text
// LINK_ASM     — Debug mode:   link pre-instrumented .s files → .wasm
//
// The debug pipeline is orchestrated by the main thread (compiler.ts),
// which fans out COMPILE_ONE messages across a pool of workers, then
// sends LINK_ASM to one worker for the final link step.

// ── Shared Constants ───────────────────────────────────────────────

const BASE_INCLUDES = [
    '-I/workspace/',
    '-I/sysroot/',
    '-isystem', '/sysroot/include/c++/v1',
    '-isystem', '/sysroot/include',
    '-fno-exceptions',
    '-fno-rtti',
]

// ── Virtual Filesystem Helpers ─────────────────────────────────────

function insertIntoTree(tree: Record<string, unknown>, path: string, data: Uint8Array) {
    const parts = (path.startsWith('/') ? path.slice(1) : path).split('/')
    let node: Record<string, unknown> = tree
    for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]]) node[parts[i]] = {}
        node = node[parts[i]] as Record<string, unknown>
    }
    node[parts[parts.length - 1]] = data
}

function getTreeNode(tree: Record<string, unknown>, path: string): unknown {
    const parts = (path.startsWith('/') ? path.slice(1) : path).split('/')
    let node: unknown = tree
    for (const part of parts) {
        if (!node || typeof node !== 'object') return undefined
        node = (node as Record<string, unknown>)[part]
    }
    return node
}

function findFileInTree(tree: Record<string, unknown>, filename: string): unknown {
    for (const [key, value] of Object.entries(tree)) {
        if (key === filename && isBufferLike(value)) return value
        if (value && typeof value === 'object' && !isBufferLike(value)) {
            const found = findFileInTree(value as Record<string, unknown>, filename)
            if (found) return found
        }
    }
    return undefined
}

function isBufferLike(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    return ArrayBuffer.isView(value) || value instanceof ArrayBuffer
        || (typeof (value as any).byteLength === 'number' && typeof (value as any).buffer === 'object') // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Build the full virtual filesystem tree from workspace + sysroot files. */
function buildFileTree(files: Record<string, string>, sysrootFiles: Record<string, string>): Record<string, unknown> {
    const tree: Record<string, unknown> = {}
    const enc = new TextEncoder()
    for (const [path, content] of Object.entries(files)) {
        insertIntoTree(tree, path, enc.encode(content))
    }
    for (const [path, content] of Object.entries(sysrootFiles)) {
        insertIntoTree(tree, path, enc.encode(content))
    }
    return tree
}

/** Extract assembly text from a tree node (may be String or Uint8Array). */
function extractAssemblyText(rawData: unknown): string {
    if (typeof rawData === 'string') return rawData
    if (rawData instanceof Uint8Array) return new TextDecoder().decode(rawData)
    if (isBufferLike(rawData)) {
        const bytes = new Uint8Array(
            (rawData as any).buffer || rawData, // eslint-disable-line @typescript-eslint/no-explicit-any
            (rawData as any).byteOffset || 0,   // eslint-disable-line @typescript-eslint/no-explicit-any
            (rawData as any).byteLength,         // eslint-disable-line @typescript-eslint/no-explicit-any
        )
        return new TextDecoder().decode(bytes)
    }
    return String(rawData)
}

// ── Message Handlers ───────────────────────────────────────────────

self.onmessage = async (e) => {
    if (e.data.type === 'PRELOAD') return

    switch (e.data.type) {
        case 'COMPILE': return handleCompile(e.data)
        case 'COMPILE_ONE': return handleCompileOne(e.data)
        case 'LINK_ASM': return handleLinkAsm(e.data)
    }
}

/**
 * COMPILE — Release mode: single-pass .cpp → .wasm
 * Unchanged from the original implementation.
 */
async function handleCompile(data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const files: Record<string, string> = data.files
    const sysrootFiles: Record<string, string> = data.sysrootFiles || {}
    const decoder = new TextDecoder()

    try {
        let tree = buildFileTree(files, sysrootFiles)
        const sources = Object.keys(files).filter(
            (f) => f.endsWith('.cpp') && !f.includes('sysroot/'),
        )

        const args = [
            ...sources,
            '/sysroot/memory_tracker.cpp',
            ...BASE_INCLUDES,
            '-std=c++20', '-O2',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-Wl,--wrap=free',
            '-Wl,--export=__nova_allocs',
            '-Wl,--export=__nova_alloc_count',
            '-target', 'wasm32-wasip1',
            '-o', '/workspace/program.wasm',
        ]

        tree = await clangpp(args, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
            },
        }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

        const wasmBytes = getTreeNode(tree, '/workspace/program.wasm') as Uint8Array | undefined
        if (wasmBytes) {
            const buf = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
            self.postMessage({ type: 'COMPILE_DONE', wasmBinary: buf }, [buf])
        } else {
            self.postMessage({ type: 'COMPILE_ERROR', errors: ['No output produced.'] })
        }
    } catch (err: unknown) {
        self.postMessage({ type: 'COMPILE_ERROR', errors: [err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))] })
    }
}

/**
 * COMPILE_ONE — Debug mode: compile a single .cpp → .s assembly text.
 * Called in parallel across a pool of workers.
 */
async function handleCompileOne(data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { src, files, sysrootFiles, requestId } = data
    const decoder = new TextDecoder()

    try {
        let tree = buildFileTree(files, sysrootFiles)
        const asmName = src.replace('.cpp', '.s')

        const args = [
            src, ...BASE_INCLUDES,
            '-std=c++20',
            '-g', '-gdwarf-4', '-O0',
            '-S',
            '-target', 'wasm32-wasip1',
            '-o', asmName,
        ]

        tree = await clangpp(args, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
            },
        }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

        // Extract the .s file from the output tree
        let rawData = getTreeNode(tree, asmName)
        if (rawData === undefined || rawData === null) {
            rawData = findFileInTree(tree, asmName.split('/').pop()!)
        }

        if (rawData === undefined || rawData === null) {
            self.postMessage({ type: 'COMPILE_ONE_ERROR', requestId, errors: [`No assembly output for ${src}`] })
            return
        }

        const assembly = extractAssemblyText(rawData)
        self.postMessage({ type: 'COMPILE_ONE_DONE', requestId, src, assembly })
    } catch (err: unknown) {
        self.postMessage({ type: 'COMPILE_ONE_ERROR', requestId, errors: [err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))] })
    }
}

/**
 * LINK_ASM — Debug mode: link pre-instrumented .s files → .wasm.
 * Called once after all files are compiled and instrumented.
 */
async function handleLinkAsm(data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { asmEntries, sysrootFiles, requestId } = data
    // asmEntries: Array<{ name: string, assembly: string }>
    const decoder = new TextDecoder()
    const enc = new TextEncoder()

    try {
        // Build a tree with just sysroot + instrumented assembly files
        let tree: Record<string, unknown> = {}
        for (const [path, content] of Object.entries(sysrootFiles as Record<string, string>)) {
            insertIntoTree(tree, path, enc.encode(content))
        }
        const asmNames: string[] = []
        for (const entry of asmEntries as Array<{ name: string; assembly: string }>) {
            insertIntoTree(tree, entry.name, enc.encode(entry.assembly))
            asmNames.push(entry.name)
        }

        const linkArgs = [
            ...asmNames,
            '/sysroot/memory_tracker.cpp',
            ...BASE_INCLUDES,
            '-g', '-gdwarf-4', '-O0',
            '-target', 'wasm32-wasip1',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-Wl,--wrap=free',
            '-Wl,--export=__stack_pointer',
            '-Wl,--export=__nova_allocs',
            '-Wl,--export=__nova_alloc_count',
            '-o', '/workspace/program.wasm',
        ]

        tree = await clangpp(linkArgs, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
            },
        }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

        const wasmBytes = getTreeNode(tree, '/workspace/program.wasm') as Uint8Array | undefined
        if (wasmBytes) {
            const buf = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
            self.postMessage({ type: 'LINK_ASM_DONE', requestId, wasmBinary: buf }, [buf])
        } else {
            self.postMessage({ type: 'LINK_ASM_ERROR', requestId, errors: ['No output produced during linking.'] })
        }
    } catch (err: unknown) {
        self.postMessage({ type: 'LINK_ASM_ERROR', requestId, errors: [err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))] })
    }
}

export { }
