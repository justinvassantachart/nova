//   Compiler Bridge  //

import { getCompilerWorker, popPreloadWorker } from '@/lib/compiler-cache'
import { CompilerPool, createPool } from '@/lib/compiler-pool'
import { computeSourceHash, getCached, setCached } from '@/lib/compile-cache'
import { getSysrootFiles, isSysrootLoaded, loadSysroot } from '@/vfs/sysroot-loader'
import { instrumentAssemblyDetailed } from './asm-interceptor'
import { parseDwarf } from './dwarf-parser'
import { useDebugStore } from '@/store/debug-store'

export interface CompileResult {
    success: boolean
    errors: string[]
    wasmBinary: Uint8Array | null
    stepMap?: Record<number, { line: number; func: string }>
}

// --- SECURE RELEASE MODE PIPELINE ---
let releaseWorker: Worker | null = null
const activeReleaseRequests = new Map<string, { resolve: (res: CompileResult) => void; stderr: string[] }>()

function ensureReleaseWorker(): Worker {
    if (!releaseWorker) {
        releaseWorker = getCompilerWorker()

        releaseWorker.onmessage = (e) => {
            const { type, requestId } = e.data
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const term = (window as any).__novaTerminal

            const req = activeReleaseRequests.get(requestId)
            if (!req) return // Ignore orphaned messages

            if (type === 'COMPILE_DONE') {
                const wasmBinary = new Uint8Array(e.data.wasmBinary)
                try {
                    const dwarfInfo = parseDwarf(wasmBinary)
                    useDebugStore.getState().setDwarfInfo(dwarfInfo)
                    useDebugStore.getState().setWasmBinary(wasmBinary)
                } catch (err) {
                    console.warn('[compiler] DWARF parse failed:', err)
                }
                req.resolve({ success: true, errors: [], wasmBinary })
                activeReleaseRequests.delete(requestId)

            } else if (type === 'COMPILE_ERROR') {
                const errors = req.stderr.length ? req.stderr : (e.data.errors || ['Unknown error'])
                req.resolve({ success: false, errors, wasmBinary: null })
                activeReleaseRequests.delete(requestId)

            } else if (type === 'COMPILE_STDERR') {
                if (term) term.write(e.data.text.replace(/\n/g, '\r\n'))
                req.stderr.push(...e.data.text.split('\n').filter(Boolean))
            }
        }

        releaseWorker.onerror = (err) => {
            // Reject all active compilation requests safely
            for (const [id, req] of activeReleaseRequests.entries()) {
                req.resolve({ success: false, errors: [err.message || 'Worker crashed natively'], wasmBinary: null })
                activeReleaseRequests.delete(id)
            }
            releaseWorker = null
        }
    }
    return releaseWorker
}

export async function compile(files: Record<string, string>, debugMode = false): Promise<CompileResult> {
    return debugMode ? compileDebug(files) : compileRelease(files)
}

async function compileRelease(files: Record<string, string>): Promise<CompileResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const term = (window as any).__novaTerminal
    const progress = (msg: string) => term?.writeln?.(`\x1b[90m${msg}\x1b[0m`)

    if (!isSysrootLoaded()) {
        progress('Waiting for standard library to load...')
        await loadSysroot()
    }

    return new Promise((resolve) => {
        const w = ensureReleaseWorker()
        const requestId = `release-${Date.now()}-${Math.random().toString(36).substring(2)}`

        activeReleaseRequests.set(requestId, { resolve, stderr: [] })
        const sysrootFiles = getSysrootFiles()

        w.postMessage({ type: 'COMPILE', files, sysrootFiles, requestId })
    })
}

// --- SECURE DEBUG MODE PIPELINE ---
let debugPool: CompilerPool | null = null

/**
 * Initializes the compiler pool and pregenerates the PCH in the background
 * using idle thread cycles before the user even clicks "Debug".
 */
export async function prepareBackgroundPCH() {
    try {
        if (!isSysrootLoaded()) {
            await loadSysroot()
        }
        const sysrootFiles = getSysrootFiles()

        if (!debugPool) {
            // Keep pool size to 1 so background compilation uses minimal system resources
            debugPool = createPool(1, takePreloadedWorker())
        }

        await debugPool.seedSysroot(sysrootFiles)
        await debugPool.generatePCH() // Runs silently
    } catch (err) {
        console.warn('[compiler] Background PCH preparation failed:', err)
    }
}

function takePreloadedWorker(): Worker | undefined {
    if (releaseWorker && activeReleaseRequests.size === 0) {
        const w = releaseWorker
        releaseWorker = null
        return w
    }
    const preloaded = popPreloadWorker()
    if (preloaded) return preloaded
    return undefined
}

async function compileDebug(files: Record<string, string>): Promise<CompileResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const term = (window as any).__novaTerminal
    const progress = (msg: string) => term?.writeln?.(`\x1b[90m${msg}\x1b[0m`)
    const stderr = (text: string) => term?.write?.(text.replace(/\n/g, '\r\n'))

    try {
        if (!isSysrootLoaded()) {
            progress('Waiting for standard library to load...')
            await loadSysroot()
        }

        const sysrootFiles = getSysrootFiles()
        const sources = Object.keys(files).filter(
            (f) => f.endsWith('.cpp') && !f.includes('sysroot/'),
        )

        const cpuCount = navigator.hardwareConcurrency || 2
        const targetPoolSize = Math.max(1, Math.min(cpuCount, sources.length, 4))

        if (!debugPool) {
            debugPool = createPool(targetPoolSize, takePreloadedWorker())
        } else {
            await debugPool.ensureSize(targetPoolSize)
        }

        const assemblyMap = new Map<string, string>()
        const uncachedSources: string[] = []

        for (const src of sources) {
            const content = files[src]
            if (!content) { uncachedSources.push(src); continue }
            const hash = await computeSourceHash(content, sysrootFiles)
            const cached = getCached(hash)

            if (cached) {
                progress(`Cache hit: ${src.split('/').pop()}`)
                assemblyMap.set(src, cached.assembly)
            } else {
                uncachedSources.push(src)
            }
        }

        if (uncachedSources.length > 0) {
            await debugPool.seedSysroot(sysrootFiles)

            const pchGenerated = await debugPool.generatePCH(progress, stderr)
            if (!pchGenerated) {
                progress('Proceeding without PCH cache.')
            }

            progress(`Compiling ${uncachedSources.length}/${sources.length} files...`)
            const freshResults = await debugPool.compileAll(
                uncachedSources, files, progress, stderr
            )

            for (const [src, asm] of freshResults) {
                const content = files[src]
                if (content) {
                    const hash = await computeSourceHash(content, sysrootFiles)
                    setCached(hash, { assembly: asm, sourceHash: hash })
                }
                assemblyMap.set(src, asm)
            }
        } else {
            progress('All files cached, no compilation needed')
        }

        progress('Instrumenting assembly...')
        const { asmEntries, globalStepMap } = instrumentAllAssembly(assemblyMap, progress)

        const linkSysrootFiles: Record<string, string> = {}
        for (const key of Object.keys(sysrootFiles)) {
            if (key.includes('memory_tracker')) linkSysrootFiles[key] = sysrootFiles[key]
        }

        const wasmBinaryResult = await debugPool.linkAssembly(asmEntries, linkSysrootFiles, progress, stderr)
        const wasmBinary = new Uint8Array(wasmBinaryResult.wasmBinary)

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
        progress(`Injected ${result.injectedCount} tracking hooks into ${asmName.split('/').pop()}`)
        asmEntries.push({ name: asmName, assembly: result.output })
    }

    return { asmEntries, globalStepMap }
}
