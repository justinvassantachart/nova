// ── ASM Interceptor ────────────────────────────────────────────────
// Architecture C: LLVM Assembly Intercept — Strict Token Lexer
//
// Reads the intermediate Clang `.s` assembly file and injects:
// 1. `JS_debug_step(stepId)` calls at source-line boundaries
// 2. `JS_notify_enter()` at function entry (after local declarations)
// 3. `JS_notify_exit()` before function returns
//
// Uses a strict tokenizer that treats the assembly as a whitespace-
// separated token stream. Deterministic and will never break.
//
// Key invariants:
// 1. Pristine Source — student C++ is 100% untouched
// 2. Perfect Stack Frames — waits for .loc prologue_end before injecting
// 3. "Just My Code" — filters by .file ID so we skip std library
// 4. Native Recursion — enter/exit calls paired with unique IDs in the worker

export interface InstrumentResult {
    output: string
    injectedCount: number
    stepMap: Record<number, { line: number; func: string }>
}

export function instrumentAssemblyDetailed(asmText: string, startStepId: number = 1): InstrumentResult {
    const lines = asmText.split('\n')
    const output: string[] = []
    const stepMap: Record<number, { line: number; func: string }> = {}

    let inFunc = false; let stackReady = false; let currentLine = -1
    let currentFuncName = 'unknown'; let stepIdCounter = startStepId
    let injectedLines = new Set<number>()
    let needsEnterCall = false // True after we see prologue_end in a user function
    let enteredCurrentFunc = false // Whether we've injected enter for current function
    const userFileIds = new Set<string>()

    // We need to skip injecting enter/exit for the memory tracker functions
    const skipInstrument = new Set([
        '__wrap_malloc', '__wrap_free',
        '__cyg_profile_func_enter', '__cyg_profile_func_exit',
        'operator new', 'operator new[]', 'operator delete', 'operator delete[]',
    ])

    output.push('\t.functype\tJS_debug_step (i32) -> ()')
    output.push('\t.functype\tJS_notify_enter () -> ()')
    output.push('\t.functype\tJS_notify_exit () -> ()')

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) { output.push(line); continue }

        // STRICT LEXER: No regex guessing. Process absolute tokens.
        const tokens = trimmed.split(/\s+/)
        const opcode = tokens[0]

        // 1. Map Workspace Files
        if (opcode === '.file') {
            const fileId = tokens[1]
            const pathIdx = line.indexOf('"')
            if (pathIdx !== -1) {
                const path = line.substring(pathIdx + 1, line.lastIndexOf('"'))
                if (path.includes('/workspace/') || path.includes('main.cpp') || !path.includes('/sysroot/')) {
                    userFileIds.add(fileId)
                }
            }
        }
        // 2. Track Function Boundaries & Demangle Names cleanly
        else if (opcode === '.functype' && !trimmed.includes('JS_debug_step') && !trimmed.includes('JS_notify_enter') && !trimmed.includes('JS_notify_exit')) {
            let rawName = tokens[1] || 'unknown'
            if (rawName === '__original_main') currentFuncName = 'main'
            else if (rawName.startsWith('_Z')) {
                let i = 2
                while (i < rawName.length && rawName[i] >= '0' && rawName[i] <= '9') i++
                if (i > 2) {
                    const len = parseInt(rawName.substring(2, i), 10)
                    currentFuncName = rawName.substring(i, i + len)
                } else currentFuncName = rawName
            } else currentFuncName = rawName

            inFunc = true; stackReady = false; currentLine = -1; injectedLines.clear()
            needsEnterCall = false; enteredCurrentFunc = false
        }
        // 3. Track DWARF Lines
        else if (opcode === '.loc') {
            const fileId = tokens[1]
            currentLine = userFileIds.has(fileId) ? parseInt(tokens[2], 10) : -1
            if (tokens.includes('prologue_end')) {
                stackReady = true
                // Mark that we need to inject enter call before the next instruction
                if (!enteredCurrentFunc && !skipInstrument.has(currentFuncName)) {
                    needsEnterCall = true
                }
            }
        }
        else if (opcode === 'end_function') {
            // Inject exit before end_function if we entered this function
            if (enteredCurrentFunc) {
                output.push('\tcall\tJS_notify_exit')
            }
            inFunc = false; stackReady = false; enteredCurrentFunc = false
        }

        // 4. Safe WASM Instruction Detection
        const isInstruction = !opcode.startsWith('.') && !opcode.startsWith('#') &&
            !opcode.startsWith('@') && !opcode.endsWith(':') &&
            opcode !== 'end_function' && /^[a-z_]/.test(opcode)

        // 5. Inject enter call at the first real instruction after prologue_end
        if (needsEnterCall && isInstruction) {
            output.push('\tcall\tJS_notify_enter')
            needsEnterCall = false
            enteredCurrentFunc = true
        }

        // 6. Inject exit before return instruction
        if (inFunc && isInstruction && opcode === 'return' && enteredCurrentFunc) {
            output.push('\tcall\tJS_notify_exit')
        }

        // 7. Inject Deterministic Breakpoint
        if (inFunc && stackReady && currentLine > 0 && isInstruction && !injectedLines.has(currentLine)) {
            stepMap[stepIdCounter] = { line: currentLine, func: currentFuncName }
            output.push(`\ti32.const\t${stepIdCounter}`)
            output.push(`\tcall\tJS_debug_step`)
            injectedLines.add(currentLine)
            stepIdCounter++
        }
        output.push(line)
    }

    return { output: output.join('\n'), injectedCount: stepIdCounter - startStepId, stepMap }
}

export function instrumentAssembly(asmText: string): string {
    return instrumentAssemblyDetailed(asmText).output
}
