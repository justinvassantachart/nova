// ── WASM Instrumenter ──────────────────────────────────────────────
// Uses Binaryen.js to inject JS_debug_step(lineNumber) calls into a
// compiled WASM binary for line-level debugging.
//
// Strategy:
// 1. Read the compiled WASM binary into Binaryen's AST
// 2. Add JS_debug_step as an imported function
// 3. For each user function, remove it and re-add it with a wrapper body
//    that calls JS_debug_step before the original body
// 4. Emit the modified binary

import binaryen from 'binaryen'
import type { DwarfInfo } from './dwarf-types'

/** Helper: collect all exports that reference a given function name */
function getFunctionExports(mod: binaryen.Module, funcName: string): string[] {
    const exports: string[] = []
    const numExports = mod.getNumExports()
    for (let i = 0; i < numExports; i++) {
        const expRef = mod.getExportByIndex(i)
        const expInfo = binaryen.getExportInfo(expRef)
        if (expInfo.kind === binaryen.ExternalFunction && expInfo.value === funcName) {
            exports.push(expInfo.name)
        }
    }
    return exports
}

/** Helper: get function local variable types */
function getFuncVarTypes(funcInfo: binaryen.FunctionInfo): binaryen.Type[] {
    const vars: binaryen.Type[] = []
    if (funcInfo.vars) {
        for (const v of funcInfo.vars) {
            vars.push(v)
        }
    }
    return vars
}

/**
 * Instrument a WASM binary for debug stepping.
 * Injects JS_debug_step(lineNumber) calls using the DWARF line map.
 */
export function instrumentWasmForStepping(
    wasmBinary: Uint8Array,
    dwarfInfo: DwarfInfo,
): Uint8Array {
    console.time('[instrumenter] instrument')

    const mod = binaryen.readBinary(wasmBinary)

    // 1. Add the debug step function import: env.JS_debug_step(i32) → void
    mod.addFunctionImport(
        'JS_debug_step',
        'env',
        'JS_debug_step',
        binaryen.i32,
        binaryen.none,
    )

    // 2. Collect unique source lines from the DWARF lineMap
    const uniqueLines = new Set<number>()
    for (const line of Object.values(dwarfInfo.lineMap)) {
        if (line > 0 && line < 10000) {
            uniqueLines.add(line)
        }
    }
    const sortedLines = [...uniqueLines].sort((a, b) => a - b)

    if (sortedLines.length === 0) {
        console.warn('[instrumenter] No source lines found in DWARF lineMap')
        const result = mod.emitBinary()
        mod.dispose()
        console.timeEnd('[instrumenter] instrument')
        return result
    }

    console.log(`[instrumenter] ${sortedLines.length} source lines to instrument: ${sortedLines.slice(0, 10).join(', ')}${sortedLines.length > 10 ? '...' : ''}`)

    // 3. Collect function info first (we can't iterate and modify simultaneously)
    interface FuncData {
        name: string
        params: binaryen.Type
        results: binaryen.Type
        vars: binaryen.Type[]
        body: binaryen.ExpressionRef
        exports: string[]
        isMain: boolean
    }

    const funcsToInstrument: FuncData[] = []

    const numFunctions = mod.getNumFunctions()
    for (let i = 0; i < numFunctions; i++) {
        const funcRef = mod.getFunctionByIndex(i)
        const funcInfo = binaryen.getFunctionInfo(funcRef)

        // Skip imported functions (no body)
        if (!funcInfo.body) continue

        // Skip standard library / runtime internals
        const funcName = funcInfo.name
        if (funcName.startsWith('__') || funcName.startsWith('wasi_')) continue

        // Determine if this is a main-like function
        const isMain = funcName === 'main' || funcName === '__main_void' ||
            funcName === '_start'

        funcsToInstrument.push({
            name: funcName,
            params: funcInfo.params,
            results: funcInfo.results,
            vars: getFuncVarTypes(funcInfo),
            body: funcInfo.body,
            exports: getFunctionExports(mod, funcName),
            isMain,
        })
    }

    // 4. Remove and re-add each function with instrumented body
    let instrumented = 0

    for (const func of funcsToInstrument) {
        // Remove exports first
        for (const expName of func.exports) {
            mod.removeExport(expName)
        }

        // Remove the function
        mod.removeFunction(func.name)

        // Create the new body with step calls
        let newBody: binaryen.ExpressionRef

        if (func.isMain && sortedLines.length > 0) {
            // For main, inject step calls for ALL source lines before the body
            const steps = sortedLines.map(line =>
                mod.call('JS_debug_step', [mod.i32.const(line)], binaryen.none)
            )
            newBody = mod.block(null, [...steps, func.body])
        } else {
            // For other functions, inject a single step at entry
            const stepCall = mod.call(
                'JS_debug_step',
                [mod.i32.const(0)],
                binaryen.none,
            )
            newBody = mod.block(null, [stepCall, func.body])
        }

        // Re-add the function with the new body
        mod.addFunction(func.name, func.params, func.results, func.vars, newBody)

        // Re-add exports
        for (const expName of func.exports) {
            mod.addFunctionExport(func.name, expName)
        }

        instrumented++
    }

    console.log(`[instrumenter] Instrumented ${instrumented} functions`)

    // 5. Validate and emit
    if (!mod.validate()) {
        console.warn('[instrumenter] Module failed validation, returning original binary')
        mod.dispose()
        return wasmBinary
    }

    const result = mod.emitBinary()
    mod.dispose()

    console.timeEnd('[instrumenter] instrument')
    console.log(`[instrumenter] Output: ${result.length} bytes (was ${wasmBinary.length})`)

    return result
}
