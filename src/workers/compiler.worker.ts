/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { commands, Exit } from '@yowasp/clang'

const clangpp = commands['clang++']

// Notify main thread that the WASM is loaded
self.postMessage({ type: 'PRELOAD_DONE' })

// OPTIMIZATION: Centralize instances to eliminate GC thrashing inside tight compilation loops
const enc = new TextEncoder()
const dec = new TextDecoder()

const BASE_INCLUDES = [
    '-I/workspace/',
    '-I/sysroot/',
    '-isystem', '/sysroot/include/c++/v1',
    '-isystem', '/sysroot/include',
    '-fno-exceptions',
    '-fno-rtti',
]

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        || (typeof (value as any).byteLength === 'number' && typeof (value as any).buffer === 'object')
}

// Global cached state inside the worker to avoid repetitive IPC transfers
let cachedSysrootTree: Record<string, unknown> = {}
let globalPchBytes: Uint8Array | null = null

// Constant definition of headers we bundle into the PCH
const PCH_HEADERS = [
    '<iostream>', '<vector>', '<string>', '<map>', '<algorithm>',
    '<memory>', '<functional>', '<utility>', '<unordered_map>',
    '<unordered_set>', '<set>', '<queue>', '<stack>', '<iomanip>'
]
// IMPORTANT: Clang strictly requires C/C++ files to end with a newline!
const PCH_CONTENT = PCH_HEADERS.map(h => `#include ${h}`).join('\n') + '\n'

function buildFileTree(files: Record<string, string>): Record<string, unknown> {
    const tree: Record<string, unknown> = {}

    // Fast shallow copy of the seeded sysroot tree
    for (const [k, v] of Object.entries(cachedSysrootTree)) {
        tree[k] = v
    }

    for (const [path, content] of Object.entries(files)) {
        insertIntoTree(tree, path, enc.encode(content))
    }
    return tree
}

function extractAssemblyText(rawData: unknown): string {
    if (typeof rawData === 'string') return rawData
    if (rawData instanceof Uint8Array) return dec.decode(rawData)
    if (isBufferLike(rawData)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bytes = new Uint8Array((rawData as any).buffer || rawData, (rawData as any).byteOffset || 0, (rawData as any).byteLength)
        return dec.decode(bytes)
    }
    return String(rawData)
}

// STRICT TYPING: Eliminate `any` payloads.
export type CompilerMessage =
    | { type: 'PRELOAD' }
    | { type: 'SEED_SYSROOT'; sysrootFiles: Record<string, string> }
    | { type: 'GENERATE_PCH' }
    | { type: 'LOAD_PCH'; pchBinary: ArrayBuffer }
    | { type: 'COMPILE_ONE'; src: string; files: Record<string, string>; requestId: string }
    | { type: 'LINK_ASM'; asmEntries: Array<{ name: string; assembly: string }>; sysrootFiles: Record<string, string>; requestId: string }
    | { type: 'COMPILE'; files: Record<string, string>; sysrootFiles: Record<string, string>; requestId: string };

self.onmessage = async (e: MessageEvent<CompilerMessage>) => {
    const data = e.data
    if (data.type === 'PRELOAD') return

    switch (data.type) {
        case 'SEED_SYSROOT': return handleSeedSysroot(data)
        case 'GENERATE_PCH': return handleGeneratePCH()
        case 'LOAD_PCH': return handleLoadPCH(data)
        case 'COMPILE': return handleCompile(data)
        case 'COMPILE_ONE': return handleCompileOne(data)
        case 'LINK_ASM': return handleLinkAsm(data)
    }
}

function handleSeedSysroot(data: Extract<CompilerMessage, { type: 'SEED_SYSROOT' }>) {
    cachedSysrootTree = {}
    for (const [path, content] of Object.entries(data.sysrootFiles)) {
        insertIntoTree(cachedSysrootTree, path, enc.encode(content))
    }
    self.postMessage({ type: 'SEED_SYSROOT_DONE' })
}

async function handleGeneratePCH() {
    try {
        let tree = buildFileTree({})
        insertIntoTree(tree, '/workspace/nova_pch.h', enc.encode(PCH_CONTENT))

        // FIXED: -Xclang propagates the -emit-pch command cleanly to cc1. Input source goes LAST.
        const args = [
            ...BASE_INCLUDES,
            '-std=c++20', '-g', '-gdwarf-4', '-O0',
            '-target', 'wasm32-wasip1',
            '-Xclang', '-emit-pch', '-o', '/workspace/nova_pch.pch',
            '-x', 'c++-header', '/workspace/nova_pch.h'
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outTree = await clangpp(args, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: dec.decode(bytes, { stream: true }) })
            }
        }) as any

        const pchBytes = getTreeNode(outTree, '/workspace/nova_pch.pch') as Uint8Array | undefined

        if (pchBytes) {
            // We need a local copy for this worker, and a transfer copy for the main thread.
            // Using `slice()` on the buffer creates a new ArrayBuffer entirely.
            const transferBuf = pchBytes.buffer.slice(pchBytes.byteOffset, pchBytes.byteOffset + pchBytes.byteLength)
            globalPchBytes = new Uint8Array(transferBuf.slice(0))
            self.postMessage({ type: 'GENERATE_PCH_DONE', pchBinary: transferBuf }, [transferBuf])
        } else {
            self.postMessage({ type: 'GENERATE_PCH_ERROR', errors: ['Failed to emit .pch binary'] })
        }
    } catch (err: unknown) {
        self.postMessage({ type: 'GENERATE_PCH_ERROR', errors: [err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))] })
    }
}

function handleLoadPCH(data: Extract<CompilerMessage, { type: 'LOAD_PCH' }>) {
    globalPchBytes = new Uint8Array(data.pchBinary)
    self.postMessage({ type: 'LOAD_PCH_DONE' })
}

async function handleCompile(data: Extract<CompilerMessage, { type: 'COMPILE' }>) {
    const { files, sysrootFiles, requestId } = data

    try {
        let tree: Record<string, unknown> = {}
        for (const [path, content] of Object.entries(sysrootFiles)) {
            insertIntoTree(tree, path, enc.encode(content))
        }
        for (const [path, content] of Object.entries(files)) {
            insertIntoTree(tree, path, enc.encode(content))
        }

        const sources = Object.keys(files).filter(f => f.endsWith('.cpp') && !f.includes('sysroot/'))

        const args = [
            ...BASE_INCLUDES,
            '-std=c++20', '-O2',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-Wl,--wrap=free',
            '-Wl,--export=__nova_allocs',
            '-Wl,--export=__nova_alloc_count',
            '-target', 'wasm32-wasip1',
            '-o', '/workspace/program.wasm',
            ...sources,
            '/sysroot/memory_tracker.cpp',
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let outTree = await clangpp(args, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', requestId, text: dec.decode(bytes, { stream: true }) })
            },
        }) as any

        const wasmBytes = getTreeNode(outTree, '/workspace/program.wasm') as Uint8Array | undefined
        if (wasmBytes) {
            const buf = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
            self.postMessage({ type: 'COMPILE_DONE', requestId, wasmBinary: buf }, [buf])
        } else {
            self.postMessage({ type: 'COMPILE_ERROR', requestId, errors: ['No output produced.'] })
        }
    } catch (err: unknown) {
        self.postMessage({ type: 'COMPILE_ERROR', requestId, errors: [err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))] })
    }
}

async function handleCompileOne(data: Extract<CompilerMessage, { type: 'COMPILE_ONE' }>) {
    const { src, files, requestId } = data

    try {
        let tree = buildFileTree(files)
        const asmName = src.replace('.cpp', '.s')

        const args = [
            ...BASE_INCLUDES,
            '-std=c++20', '-g', '-gdwarf-4', '-O0',
            '-target', 'wasm32-wasip1',
        ]

        if (globalPchBytes) {
            insertIntoTree(tree, '/workspace/nova_pch.h', enc.encode(PCH_CONTENT))
            insertIntoTree(tree, '/workspace/nova_pch.pch', globalPchBytes)
            args.push('-include-pch', '/workspace/nova_pch.pch')
        }

        args.push('-S', '-o', asmName, src)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let outTree = await clangpp(args, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', requestId, text: dec.decode(bytes, { stream: true }) })
            },
        }) as any

        let rawData = getTreeNode(outTree, asmName)
        if (rawData === undefined || rawData === null) {
            rawData = findFileInTree(outTree, asmName.split('/').pop()!)
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

async function handleLinkAsm(data: Extract<CompilerMessage, { type: 'LINK_ASM' }>) {
    const { asmEntries, sysrootFiles, requestId } = data

    try {
        let tree: Record<string, unknown> = {}
        for (const [path, content] of Object.entries(sysrootFiles)) {
            insertIntoTree(tree, path, enc.encode(content))
        }
        const asmNames: string[] = []
        for (const entry of asmEntries) {
            insertIntoTree(tree, entry.name, enc.encode(entry.assembly))
            asmNames.push(entry.name)
        }

        const linkArgs = [
            '-O0',
            '-target', 'wasm32-wasip1',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-Wl,--wrap=free',
            '-Wl,--export=__stack_pointer',
            '-Wl,--export=__nova_allocs',
            '-Wl,--export=__nova_alloc_count',
            '-o', '/workspace/program.wasm',
            ...asmNames,
            '/sysroot/memory_tracker.cpp', // Inputs last
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let outTree = await clangpp(linkArgs, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', requestId, text: dec.decode(bytes, { stream: true }) })
            },
        }) as any

        const wasmBytes = getTreeNode(outTree, '/workspace/program.wasm') as Uint8Array | undefined
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
