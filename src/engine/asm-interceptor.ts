// ── ASM Interceptor ────────────────────────────────────────────────
// Architecture C: LLVM Assembly Intercept — Clean Token Lexer
//
// Reads the intermediate Clang `.s` assembly file and injects
// `JS_debug_step(stepId)` calls at source-line boundaries, plus
// `JS_notify_enter/exit` calls at function entry/exit for
// hardware call stack tracking.
//
// Uses a strict tokenizer that understands the LLVM architecture
// deterministically. No regex guessing — processes absolute tokens.
//
// Key invariants:
// 1. Pristine Source — student C++ is 100% untouched
// 2. Perfect Stack Frames — waits for .loc prologue_end before injecting
// 3. "Just My Code" — filters by .file ID so we skip std library
// 4. Recursion Tracking — injects enter/exit at function boundaries

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
    const userFileIds = new Set<string>()
    let needsEnterCall = false  // Flag: inject JS_notify_enter after prologue_end

    output.push('\t.functype\tJS_debug_step (i32) -> ()')
    output.push('\t.functype\tJS_notify_enter () -> ()')
    output.push('\t.functype\tJS_notify_exit () -> ()')

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) { output.push(line); continue }

        // STRICT LEXER: No regex guessing. Process absolute tokens.
        const tokens = trimmed.split(/\s+/)
        const opcode = tokens[0]

        // 1. Map Workspace Files (Hide Standard Library)
        if (opcode === '.file') {
            const fileId = tokens[1]
            const pathMatch = line.match(/"([^"]+)"/)
            const path = pathMatch ? pathMatch[1] : (tokens[2] || '')
            if (path.includes('/workspace/') || path.includes('main.cpp') || !path.includes('/sysroot/')) {
                userFileIds.add(fileId)
            }
        }
        // 2. Track Function Boundaries & Demangle Names cleanly
        else if (opcode === '.functype' && !trimmed.includes('JS_')) {
            let rawName = tokens[1] || 'unknown'
            if (rawName === '__original_main') currentFuncName = 'main'
            else if (rawName.startsWith('_Z')) {
                const lenMatch = rawName.match(/^_Z(\d+)/)
                currentFuncName = lenMatch ? rawName.substring(lenMatch[0].length, lenMatch[0].length + parseInt(lenMatch[1], 10)) : rawName
            } else currentFuncName = rawName
            inFunc = true; stackReady = false; currentLine = -1; injectedLines.clear()
            needsEnterCall = true  // Will inject enter after prologue_end
        }
        // 3. Track DWARF Lines
        else if (opcode === '.loc') {
            currentLine = userFileIds.has(tokens[1]) ? parseInt(tokens[2], 10) : -1
            if (trimmed.includes('prologue_end')) stackReady = true
        }

        // Inject JS_notify_exit before end_function
        if (opcode === 'end_function' && inFunc) {
            output.push('\tcall\tJS_notify_exit')
            inFunc = false; stackReady = false
        }

        // 4. Safe WASM Instruction Detection
        const isInstruction = !opcode.startsWith('.') && !opcode.startsWith('#') &&
            !opcode.startsWith('@') && !opcode.endsWith(':') &&
            !opcode.startsWith('end_function') && /^[a-z_]/.test(opcode)

        // 5. Inject enter call after prologue is ready (first instruction after prologue_end)
        if (needsEnterCall && stackReady && isInstruction) {
            output.push('\tcall\tJS_notify_enter')
            needsEnterCall = false
        }

        // 6. Inject Deterministic Breakpoint
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
