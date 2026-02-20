/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { commands, Exit } from '@yowasp/clang'
import { instrumentAssemblyDetailed } from '@/engine/asm-interceptor'

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

// Traverse a nested tree to get a node by path
function getTreeNode(tree: Record<string, unknown>, path: string): unknown {
    const parts = (path.startsWith('/') ? path.slice(1) : path).split('/')
    let node: unknown = tree
    for (const part of parts) {
        if (!node || typeof node !== 'object') return undefined
        node = (node as Record<string, unknown>)[part]
    }
    return node
}

// Recursively search the tree for a file with the given name
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

// Duck-type check for ArrayBuffer views (handles cross-realm typed arrays)
function isBufferLike(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    return ArrayBuffer.isView(value) || value instanceof ArrayBuffer
        || (typeof (value as any).byteLength === 'number' && typeof (value as any).buffer === 'object') // eslint-disable-line @typescript-eslint/no-explicit-any
}

self.onmessage = async (e) => {
    if (e.data.type === 'PRELOAD') return // Already loaded via static import

    if (e.data.type !== 'COMPILE') return
    const files: Record<string, string> = e.data.files
    const sysrootFiles: Record<string, string> = e.data.sysrootFiles || {}
    const isDebug = e.data.debugMode === true

    try {
        // Build input tree
        let tree: Record<string, unknown> = {}
        const enc = new TextEncoder()
        const decoder = new TextDecoder()

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

        const baseIncludes = [
            '-I/sysroot/',
            '-isystem', '/sysroot/include/c++/v1',
            '-isystem', '/sysroot/include',
        ]

        let finalWasmBytes: Uint8Array | undefined
        let globalStepMap: Record<number, { line: number; func: string }> = {}

        if (isDebug) {
            // ════════════════════════════════════════════
            // DEBUG PIPELINE: C++ → .s → Intercept → .wasm
            // ════════════════════════════════════════════
            const asmFiles: string[] = []

            // STAGE 1: Compile each C++ source to WebAssembly Assembly (.s)
            for (const src of sources) {
                const asmName = src.replace('.cpp', '.s')
                asmFiles.push(asmName)

                self.postMessage({ type: 'COMPILE_PROGRESS', message: `Generating assembly for ${src}…` })

                const compileArgs = [
                    src, ...baseIncludes,
                    '-std=c++20',
                    '-g', '-gdwarf-4', '-O0',  // DWARF-4 for our parser
                    '-S',                       // Emit assembly (not binary)
                    '-target', 'wasm32-wasip1',
                    '-o', asmName,
                ]

                tree = await clangpp(compileArgs, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
                    stderr: (bytes: Uint8Array | null) => {
                        if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
                    },
                }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
            }

            // STAGE 2: Instrument the assembly with JS_debug_step calls
            // NOTE: @yowasp/clang returns text output files (.s) as plain
            // JavaScript strings, NOT Uint8Array. Handle both types.
            self.postMessage({ type: 'COMPILE_PROGRESS', message: '🔍 Instrumenting assembly…' })

            let currentStepId = 1

            for (const asmName of asmFiles) {
                // Look up the .s file in the tree (may be String or Uint8Array)
                let rawData = getTreeNode(tree, asmName)

                // Fallback: search the tree recursively
                if (rawData === undefined || rawData === null) {
                    const basename = asmName.split('/').pop()!
                    rawData = findFileInTree(tree, basename)
                }

                if (rawData === undefined || rawData === null) {
                    self.postMessage({ type: 'COMPILE_PROGRESS', message: `⚠ Could not find assembly file: ${asmName}, skipping instrumentation` })
                    continue
                }

                // Convert to string: @yowasp/clang may return String or Uint8Array
                let rawAsm: string
                if (typeof rawData === 'string') {
                    rawAsm = rawData
                } else if (rawData instanceof Uint8Array) {
                    rawAsm = decoder.decode(rawData)
                } else if (isBufferLike(rawData)) {
                    const bytes = new Uint8Array((rawData as any).buffer || rawData, (rawData as any).byteOffset || 0, (rawData as any).byteLength) // eslint-disable-line @typescript-eslint/no-explicit-any
                    rawAsm = decoder.decode(bytes)
                } else {
                    rawAsm = String(rawData)
                }

                const result = instrumentAssemblyDetailed(rawAsm, currentStepId)
                const instrumentedAsm = result.output
                currentStepId += result.injectedCount
                Object.assign(globalStepMap, result.stepMap)

                // Log instrumentation diagnostics
                self.postMessage({ type: 'COMPILE_PROGRESS', message: result.diagnostics })
                self.postMessage({ type: 'COMPILE_PROGRESS', message: `Injected ${result.injectedCount} debug breakpoints into ${asmName.split('/').pop()}` })

                // Overwrite the .s file in the virtual tree with instrumented version
                insertIntoTree(tree, asmName, enc.encode(instrumentedAsm))
            }

            // STAGE 3: Assemble + link the instrumented .s files into .wasm
            self.postMessage({ type: 'COMPILE_PROGRESS', message: 'Assembling debug binary…' })

            const linkArgs = [
                ...asmFiles,
                '/sysroot/memory_tracker.cpp',
                ...baseIncludes,
                '-g', '-gdwarf-4', '-O0',
                '-target', 'wasm32-wasip1',
                '-Wl,--allow-undefined',
                '-Wl,--wrap=malloc',
                '-Wl,--export=__stack_pointer',
                '-o', '/workspace/program.wasm',
            ]

            tree = await clangpp(linkArgs, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
                stderr: (bytes: Uint8Array | null) => {
                    if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
                },
            }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

            finalWasmBytes = getTreeNode(tree, '/workspace/program.wasm') as Uint8Array | undefined

        } else {
            // ════════════════════════════════════════════
            // RELEASE PIPELINE: Standard 1-pass compile
            // ════════════════════════════════════════════
            const args = [
                ...sources,
                '/sysroot/memory_tracker.cpp',
                ...baseIncludes,
                '-std=c++20', '-O2',
                '-Wl,--allow-undefined',
                '-Wl,--wrap=malloc',
                '-target', 'wasm32-wasip1',
                '-o', '/workspace/program.wasm',
            ]

            tree = await clangpp(args, tree as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
                stderr: (bytes: Uint8Array | null) => {
                    if (bytes) self.postMessage({ type: 'COMPILE_STDERR', text: decoder.decode(bytes, { stream: true }) })
                },
            }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

            finalWasmBytes = getTreeNode(tree, '/workspace/program.wasm') as Uint8Array | undefined
        }

        if (finalWasmBytes) {
            const buf = finalWasmBytes.buffer.slice(finalWasmBytes.byteOffset, finalWasmBytes.byteOffset + finalWasmBytes.byteLength)
            self.postMessage({
                type: 'COMPILE_DONE',
                wasmBinary: buf,
                stepMap: isDebug ? globalStepMap : undefined,
            }, [buf])
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
