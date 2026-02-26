// ── Compiler Bridge ────────────────────────────────────────────────
// Orchestrates compilation for both Release and Debug modes.
//
// Release mode: delegates to a single long-lived compiler worker.
// Debug mode:   3-stage pipeline with parallel compilation + caching:
//
//   Stage 1 — Compile .cpp → .s (parallel, cached)
//     • Hash each source file
//     • Return cached .s on hit, compile on miss (via worker pool)
//     • Store new results in cache
//
//   Stage 2 — Instrument .s with debug breakpoints (fast, <100ms)
//     • Inject JS_debug_step / JS_notify_enter / JS_notify_exit
//     • Build the global step → source-line map
//
//   Stage 3 — Link instrumented .s → .wasm
//     • Single worker assembles + links the final debug binary

import { getCompilerWorker, popPreloadWorker } from '@/lib/compiler-cache'
import { CompilerPool, createPool } from '@/lib/compiler-pool'
import { computeSourceHash, getCached, setCached } from '@/lib/compile-cache'
import { getSysrootFiles } from '@/vfs/sysroot-loader'
import { instrumentAssemblyDetailed } from './asm-interceptor'
import { parseDwarf } from './dwarf-parser'
import { useDebugStore } from '@/store/debug-store'

// ── Types ──────────────────────────────────────────────────────────

export interface CompileResult {
    success: boolean
    errors: string[]
    wasmBinary: Uint8Array | null
    stepMap?: Record<number, { line: number; func: string }>
}

// ── Release Mode Worker (long-lived singleton) ─────────────────────

let worker: Worker | null = null

function ensureWorker(): Worker {
    if (!worker) {
        worker = getCompilerWorker()
        setupReleaseWorkerHandlers()
    }
    return worker
}

let currentResolve: ((result: CompileResult) => void) | null = null
let stderrLines: string[] = []

function setupReleaseWorkerHandlers() {
    if (!worker) return
    const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any

    worker.onmessage = (e) => {
        const { type } = e.data
        if (type === 'COMPILE_DONE') {
            const wasmBinary = new Uint8Array(e.data.wasmBinary)

            try {
                const dwarfInfo = parseDwarf(wasmBinary)
                useDebugStore.getState().setDwarfInfo(dwarfInfo)
                useDebugStore.getState().setWasmBinary(wasmBinary)
            } catch (err) {
                console.warn('[compiler] DWARF parse failed:', err)
            }

            currentResolve?.({ success: true, errors: [], wasmBinary })
            currentResolve = null
            stderrLines = []
        } else if (type === 'COMPILE_ERROR') {
            currentResolve?.({ success: false, errors: stderrLines.length ? stderrLines : (e.data.errors || ['Unknown error']), wasmBinary: null })
            currentResolve = null
            stderrLines = []
        } else if (type === 'COMPILE_STDERR') {
            if (term) term.write(e.data.text.replace(/\n/g, '\r\n'))
            stderrLines.push(...e.data.text.split('\n').filter(Boolean))
        }
    }

    worker.onerror = (err) => {
        currentResolve?.({ success: false, errors: [err.message || 'Worker error'], wasmBinary: null })
        currentResolve = null
        stderrLines = []
        worker = null
    }
}

// ── Public API ─────────────────────────────────────────────────────

export function compile(files: Record<string, string>, debugMode = false): Promise<CompileResult> {
    return debugMode ? compileDebug(files) : compileRelease(files)
}

// ── Release Mode ───────────────────────────────────────────────────

function compileRelease(files: Record<string, string>): Promise<CompileResult> {
    return new Promise((resolve) => {
        const w = ensureWorker()
        currentResolve = resolve
        stderrLines = []
        const sysrootFiles = getSysrootFiles()
        w.postMessage({ type: 'COMPILE', files, sysrootFiles })
    })
}

// ── Debug Mode: Parallel + Cached Pipeline ─────────────────────────

let debugPool: CompilerPool | null = null

/** Steal the preloaded release-mode worker for use in the debug pool. */
function takePreloadedWorker(): Worker | undefined {
    if (worker) {
        const w = worker
        worker = null // Release the singleton — debug mode takes ownership
        return w
    }
    // Fallback: steal the background preload worker
    const preloaded = popPreloadWorker()
    if (preloaded) return preloaded
    return undefined
}

async function compileDebug(files: Record<string, string>): Promise<CompileResult> {
    const term = (window as any).__novaTerminal // eslint-disable-line @typescript-eslint/no-explicit-any
    const progress = (msg: string) => term?.writeln?.(`\x1b[90m${msg}\x1b[0m`)
    const stderr = (text: string) => term?.write?.(text.replace(/\n/g, '\r\n'))

    const sysrootFiles = getSysrootFiles()
    const sources = Object.keys(files).filter(
        (f) => f.endsWith('.cpp') && !f.includes('sysroot/'),
    )

    try {
        // PERSIST the worker pool. Workers stay warm across compiles.
        const cpuCount = navigator.hardwareConcurrency || 2
        const targetPoolSize = Math.max(1, Math.min(cpuCount, sources.length, 4))

        if (!debugPool) {
            debugPool = createPool(targetPoolSize, takePreloadedWorker())
        } else {
            debugPool.ensureSize(targetPoolSize)
        }

        // ── Stage 1: Compile .cpp → .s (parallel, cached) ─────────
        const assemblyMap = await compileSourcesWithCache(
            sources, files, sysrootFiles, debugPool, progress, stderr,
        )

        // ── Stage 2: Instrument assembly with debug breakpoints ───
        progress('🔍 Instrumenting assembly…')
        const { asmEntries, globalStepMap } = instrumentAllAssembly(assemblyMap, progress)

        // ── Stage 3: Link instrumented .s → .wasm ─────────────────
        // 🚀 Only send the memory tracker. We don't need to rebuild a 5,000-file VFS tree for linking!
        const linkSysrootFiles: Record<string, string> = {}
        for (const key of Object.keys(sysrootFiles)) {
            if (key.includes('memory_tracker')) {
                linkSysrootFiles[key] = sysrootFiles[key]
            }
        }
        const wasmBinary = await linkInstrumented(asmEntries, linkSysrootFiles, progress, stderr)

        // ── Parse DWARF and store results ─────────────────────────
        try {
            const dwarfInfo = parseDwarf(wasmBinary)
            useDebugStore.getState().setDwarfInfo(dwarfInfo)
            useDebugStore.getState().setWasmBinary(wasmBinary)
            useDebugStore.getState().setStepMap(globalStepMap)
        } catch (err) {
            console.warn('[compiler] DWARF parse failed:', err)
        }

        return {
            success: true,
            errors: [],
            wasmBinary,
            stepMap: globalStepMap,
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, errors: [msg], wasmBinary: null }
    }
}

// ── Stage 1: Parallel Compilation with Caching ─────────────────────

async function compileSourcesWithCache(
    sources: string[],
    files: Record<string, string>,
    sysrootFiles: Record<string, string>,
    pool: CompilerPool,
    progress: (msg: string) => void,
    stderr: (text: string) => void,
): Promise<Map<string, string>> {
    const assemblyMap = new Map<string, string>()
    const uncachedSources: string[] = []

    // Check cache for each source file
    for (const src of sources) {
        const content = files[src]
        if (!content) { uncachedSources.push(src); continue }

        const hash = await computeSourceHash(content, sysrootFiles)
        const cached = getCached(hash)

        if (cached) {
            progress(`Cache hit: ${src.split('/').pop()} (skipped compilation)`)
            assemblyMap.set(src, cached.assembly)
        } else {
            uncachedSources.push(src)
        }
    }

    // Compile uncached sources in parallel
    if (uncachedSources.length > 0) {
        const count = uncachedSources.length
        const total = sources.length
        progress(`Compiling ${count}/${total} files in parallel…`)

        const freshResults = await pool.compileAll(
            uncachedSources, files, sysrootFiles, progress, stderr,
        )

        // Store fresh results in cache and merge into assemblyMap
        for (const [src, assembly] of freshResults) {
            const content = files[src]
            if (content) {
                const hash = await computeSourceHash(content, sysrootFiles)
                setCached(hash, { assembly, sourceHash: hash })
            }
            assemblyMap.set(src, assembly)
        }
    } else {
        progress('All files cached, no compilation needed')
    }

    return assemblyMap
}

// ── Stage 2: Assembly Instrumentation ──────────────────────────────

function instrumentAllAssembly(
    assemblyMap: Map<string, string>,
    progress: (msg: string) => void,
): {
    asmEntries: Array<{ name: string; assembly: string }>
    globalStepMap: Record<number, { line: number; func: string }>
} {
    const asmEntries: Array<{ name: string; assembly: string }> = []
    const globalStepMap: Record<number, { line: number; func: string }> = {}
    let currentStepId = 1

    for (const [src, rawAsm] of assemblyMap) {
        const asmName = src.replace('.cpp', '.s')
        const result = instrumentAssemblyDetailed(rawAsm, currentStepId)
        currentStepId += result.injectedCount
        Object.assign(globalStepMap, result.stepMap)

        progress(`Injected ${result.injectedCount} breakpoints into ${asmName.split('/').pop()}`)
        asmEntries.push({ name: asmName, assembly: result.output })
    }

    return { asmEntries, globalStepMap }
}

// ── Stage 3: Linking ───────────────────────────────────────────────

async function linkInstrumented(
    asmEntries: Array<{ name: string; assembly: string }>,
    sysrootFiles: Record<string, string>,
    progress: (msg: string) => void,
    stderr: (text: string) => void,
): Promise<Uint8Array> {
    if (!debugPool) throw new Error('No compiler pool available for linking')

    const result = await debugPool.linkAssembly(asmEntries, sysrootFiles, progress, stderr)
    return new Uint8Array(result.wasmBinary)
}
