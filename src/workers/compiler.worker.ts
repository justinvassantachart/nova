/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope
import { commands, Exit } from '@yowasp/clang'

const clangpp = commands['clang++']
self.postMessage({ type: 'PRELOAD_DONE' })

const enc = new TextEncoder()
const dec = new TextDecoder()
const BASE_INCLUDES = ['-I/workspace/', '-I/sysroot/', '-isystem', '/sysroot/include/c++/v1', '-isystem', '/sysroot/include', '-fno-exceptions', '-fno-rtti']

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
    return ArrayBuffer.isView(value) || value instanceof ArrayBuffer || (typeof (value as any).byteLength === 'number' && typeof (value as any).buffer === 'object') // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Extractor Helpers
function extractBinaryData(rawData: unknown): Uint8Array {
    if (rawData instanceof Uint8Array) return rawData
    if (isBufferLike(rawData)) {
        const anyData = rawData as any // eslint-disable-line @typescript-eslint/no-explicit-any
        return new Uint8Array(anyData.buffer || anyData, anyData.byteOffset || 0, anyData.byteLength)
    }
    throw new Error("Expected binary data")
}

function extractTextData(rawData: unknown): string {
    if (typeof rawData === 'string') return rawData
    if (rawData instanceof Uint8Array) return dec.decode(rawData)
    if (isBufferLike(rawData)) return dec.decode(extractBinaryData(rawData))
    return String(rawData)
}

let cachedSysrootTree: Record<string, unknown> = {}
let globalPchBytes: Uint8Array | null = null
let globalMemoryTrackerObj: Uint8Array | null = null // Lead's Pro-Tip!

const PCH_HEADERS = ['<iostream>', '<vector>', '<string>', '<map>', '<algorithm>', '<memory>', '<functional>', '<utility>', '<unordered_map>', '<unordered_set>', '<set>', '<queue>', '<stack>', '<iomanip>']
const PCH_CONTENT = PCH_HEADERS.map(h => `#include ${h}`).join('\n') + '\n'

function buildFileTree(files: Record<string, string>): Record<string, unknown> {
    const tree: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(cachedSysrootTree)) tree[k] = v
    for (const [path, content] of Object.entries(files)) insertIntoTree(tree, path, enc.encode(content))
    return tree
}

export type CompilerMessage =
    | { type: 'PRELOAD' }
    | { type: 'SEED_SYSROOT'; sysrootFiles: Record<string, string> }
    | { type: 'GENERATE_PCH' }
    | { type: 'LOAD_PCH'; pchBinary: ArrayBuffer }
    | { type: 'COMPILE_ONE'; src: string; files: Record<string, string>; requestId: string }
    | { type: 'LINK_OBJECTS'; objEntries: Array<{ name: string; objectData: ArrayBuffer }>; sysrootFiles: Record<string, string>; requestId: string }
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
        case 'LINK_OBJECTS': return handleLinkObjects(data)
    }
}

async function handleSeedSysroot(data: Extract<CompilerMessage, { type: 'SEED_SYSROOT' }>) {
    cachedSysrootTree = {}
    for (const [path, content] of Object.entries(data.sysrootFiles)) {
        insertIntoTree(cachedSysrootTree, path, enc.encode(content))
    }

    // PRO-TIP: Precompile memory_tracker.cpp into memory_tracker.o so we never have to parse C++ during user debug linking.
    try {
        let mtStderr = ""
        const args = [
            ...BASE_INCLUDES,
            '-std=c++20', '-O2', '-c',
            '-target', 'wasm32-wasip1',
            '-o', '/sysroot/memory_tracker.o',
            '/sysroot/memory_tracker.cpp'
        ]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outTree = await clangpp(args, cachedSysrootTree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) mtStderr += dec.decode(bytes, { stream: true })
            }
        }) as any
        const objData = getTreeNode(outTree, '/sysroot/memory_tracker.o')
        if (objData) {
            globalMemoryTrackerObj = extractBinaryData(objData)
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn("Worker: Failed to precompile memory_tracker.cpp", msg)
    }

    self.postMessage({ type: 'SEED_SYSROOT_DONE' })
}

async function handleGeneratePCH() {
    try {
        const tree = buildFileTree({})
        insertIntoTree(tree, '/workspace/nova_pch.h', enc.encode(PCH_CONTENT))

        const args = [...BASE_INCLUDES, '-std=c++20', '-g', '-gdwarf-4', '-O0', '-target', 'wasm32-wasip1', '-Xclang', '-emit-pch', '-o', '/workspace/nova_pch.pch', '-x', 'c++-header', '/workspace/nova_pch.h']
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outTree = await clangpp(args, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: dec.decode(bytes, { stream: true }) })
            }
        }) as any

        const pchRaw = getTreeNode(outTree, '/workspace/nova_pch.pch') as Uint8Array | undefined
        if (pchRaw) {
            const transferBuf = pchRaw.buffer.slice(pchRaw.byteOffset, pchRaw.byteOffset + pchRaw.byteLength)
            globalPchBytes = new Uint8Array(transferBuf.slice(0))
            self.postMessage({ type: 'GENERATE_PCH_DONE', pchBinary: transferBuf }, [transferBuf])
        } else {
            self.postMessage({ type: 'GENERATE_PCH_ERROR', errors: ['Failed to emit .pch binary'] })
        }
    } catch (err: unknown) {
        self.postMessage({ type: 'GENERATE_PCH_ERROR', errors: [err instanceof Exit ? err.message : String(err)] })
    }
}

function handleLoadPCH(data: Extract<CompilerMessage, { type: 'LOAD_PCH' }>) {
    globalPchBytes = new Uint8Array(data.pchBinary)
    self.postMessage({ type: 'LOAD_PCH_DONE' })
}

async function handleCompile(data: Extract<CompilerMessage, { type: 'COMPILE' }>) {
    const { files, sysrootFiles, requestId } = data
    try {
        const tree: Record<string, unknown> = {}
        for (const [path, content] of Object.entries(sysrootFiles)) insertIntoTree(tree, path, enc.encode(content))
        for (const [path, content] of Object.entries(files)) insertIntoTree(tree, path, enc.encode(content))

        const sources = Object.keys(files).filter(f => f.endsWith('.cpp') && !f.includes('sysroot/'))
        const args = [
            ...BASE_INCLUDES, '-std=c++20', '-O2',
            '-Wl,--allow-undefined', '-Wl,--wrap=malloc', '-Wl,--wrap=free',
            '-Wl,--export=__nova_allocs', '-Wl,--export=__nova_alloc_count',
            '-target', 'wasm32-wasip1', '-o', '/workspace/program.wasm',
            ...sources,
        ]

        if (globalMemoryTrackerObj) {
            insertIntoTree(tree, '/sysroot/memory_tracker.o', globalMemoryTrackerObj)
            args.push('/sysroot/memory_tracker.o')
        } else {
            args.push('/sysroot/memory_tracker.cpp')
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outTree = await clangpp(args, tree as any, {
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
        self.postMessage({ type: 'COMPILE_ERROR', requestId, errors: [err instanceof Exit ? err.message : String(err)] })
    }
}

async function handleCompileOne(data: Extract<CompilerMessage, { type: 'COMPILE_ONE' }>) {
    const { src, files, requestId } = data
    let stderrLog = ""
    try {
        const tree = buildFileTree(files)
        const objName = src.replace('.cpp', '.o')
        // The LLVM pass auto-derives this path from the source filename
        const stepMapName = src.replace(/\//g, '_').replace(/^_/, '').replace('.cpp', '.stepmap.json')

        const args = [
            ...BASE_INCLUDES,
            '-std=c++20', '-g', '-gdwarf-4', '-O0',
            // No -mllvm flags needed! The Nova fork pass is always-on.
            '-target', 'wasm32-wasip1',
        ]

        if (globalPchBytes && src.endsWith('.cpp')) {
            insertIntoTree(tree, '/workspace/nova_pch.h', enc.encode(PCH_CONTENT))
            insertIntoTree(tree, '/workspace/nova_pch.pch', globalPchBytes)
            args.push('-include-pch', '/workspace/nova_pch.pch')
        }

        args.push('-c', '-o', objName, src) // -c forces Object File output

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outTree = await clangpp(args, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) {
                    const text = dec.decode(bytes, { stream: true })
                    stderrLog += text
                    self.postMessage({ type: 'COMPILE_STDERR', requestId, text })
                }
            },
        }) as any

        let stepMap = {}
        const mapData = getTreeNode(outTree, `/workspace/${stepMapName}`) || findFileInTree(outTree, stepMapName)
        if (mapData) {
            try { stepMap = JSON.parse(extractTextData(mapData)) } catch { /* ignore parse errors if empty */ }
        }

        const rawData = getTreeNode(outTree, objName) || findFileInTree(outTree, objName.split('/').pop()!)
        if (!rawData) {
            self.postMessage({ type: 'COMPILE_ONE_ERROR', requestId, errors: [`No object output for ${src}`] })
            return
        }

        const objectBytes = extractBinaryData(rawData)
        const transferBuf = objectBytes.buffer.slice(objectBytes.byteOffset, objectBytes.byteOffset + objectBytes.byteLength)

        self.postMessage({ type: 'COMPILE_ONE_DONE', requestId, src, objectData: transferBuf, stepMap }, [transferBuf])
    } catch (err: unknown) {
        let msg = err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))

        // Append the buffered LLVM trace if the compiler trapped
        if (msg.includes("unreachable") && stderrLog.length > 0) {
            msg = `Compiler Trap (Unreachable). LLVM Output:\n${stderrLog}`
        }
        self.postMessage({ type: 'COMPILE_ONE_ERROR', requestId, errors: [msg] })
    }
}

async function handleLinkObjects(data: Extract<CompilerMessage, { type: 'LINK_OBJECTS' }>) {
    const { objEntries, sysrootFiles, requestId } = data
    try {
        const tree = buildFileTree(sysrootFiles)

        const objNames: string[] = []
        for (const entry of objEntries) {
            insertIntoTree(tree, entry.name, new Uint8Array(entry.objectData))
            objNames.push(entry.name)
        }

        const linkArgs = [
            '-O0', '-g',
            '-target', 'wasm32-wasip1',
            '-Wl,--allow-undefined',
            '-Wl,--wrap=malloc',
            '-Wl,--wrap=free',
            '-Wl,--export=__stack_pointer',
            '-Wl,--export=__nova_allocs',
            '-Wl,--export=__nova_alloc_count',
            '-o', '/workspace/program.wasm',
            ...objNames,
        ]

        // PRO-TIP: We just link the precompiled .o to skip C++ parsing completely!
        if (globalMemoryTrackerObj) {
            insertIntoTree(tree, '/sysroot/memory_tracker.o', globalMemoryTrackerObj)
            linkArgs.push('/sysroot/memory_tracker.o')
        } else {
            linkArgs.push('/sysroot/memory_tracker.cpp') // Fallback 
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outTree = await clangpp(linkArgs, tree as any, {
            stderr: (bytes: Uint8Array | null) => {
                if (bytes) self.postMessage({ type: 'COMPILE_STDERR', requestId, text: dec.decode(bytes, { stream: true }) })
            },
        }) as any

        const wasmBytes = getTreeNode(outTree, '/workspace/program.wasm') as Uint8Array | undefined
        if (wasmBytes) {
            const buf = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
            self.postMessage({ type: 'LINK_OBJECTS_DONE', requestId, wasmBinary: buf }, [buf])
        } else {
            self.postMessage({ type: 'LINK_OBJECTS_ERROR', requestId, errors: ['No output produced during linking.'] })
        }
    } catch (err: unknown) {
        self.postMessage({ type: 'LINK_OBJECTS_ERROR', requestId, errors: [err instanceof Exit ? err.message : (err instanceof Error ? err.message : String(err))] })
    }
}

export { }
