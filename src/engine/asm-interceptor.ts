//   ASM Interceptor  //
// Architecture C: LLVM Assembly Intercept -> Strict Token Lexer

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
    let needsEnterCall = false
    let enteredCurrentFunc = false
    let frameAllocSize = 0
    let lastI32Const = 0
    let updatedGlobalSp = false
    const userFileIds = new Set<string>()

    const skipInstrument = new Set([
        '__wrap_malloc', '__wrap_free',
        '__cyg_profile_func_enter', '__cyg_profile_func_exit',
        'operator new', 'operator new[]', 'operator delete', 'operator delete[]',
    ])

    output.push('\t.functype\tJS_debug_step (i32) -> ()')
    output.push('\t.functype\tJS_notify_enter (i32, i32) -> ()')
    output.push('\t.functype\tJS_notify_exit () -> ()')

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) { output.push(line); continue }

        // ROBUST TOKENIZER FIX: Match the exact first whitespace regardless of space vs tab
        const firstSpaceMatch = trimmed.match(/\s/)
        const opcode = firstSpaceMatch ? trimmed.substring(0, firstSpaceMatch.index) : trimmed

        let tokens: string[] | null = null
        const getTokens = () => {
            if (!tokens) tokens = trimmed.split(/\s+/)
            return tokens
        }

        if (opcode === '.file') {
            const tok = getTokens()
            const fileId = tok[1]
            const pathIdx = line.indexOf('"')
            if (pathIdx !== -1) {
                const path = line.substring(pathIdx + 1, line.lastIndexOf('"'))
                // JMC: Mark file as user code if it's not in the sysroot
                if (path.includes('/workspace/') || path.includes('main.cpp') || !path.includes('/sysroot/')) {
                    userFileIds.add(fileId)
                }
            }
        }
        else if (opcode === '.functype' && !trimmed.includes('JS_debug_step') && !trimmed.includes('JS_notify_enter') && !trimmed.includes('JS_notify_exit')) {
            const tok = getTokens()
            let rawName = tok[1] || 'unknown'
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
            frameAllocSize = 0; lastI32Const = 0; updatedGlobalSp = false
        }
        else if (opcode === '.loc') {
            const tok = getTokens()
            const fileId = tok[1]
            const isUserCode = userFileIds.has(fileId)
            currentLine = isUserCode ? parseInt(tok[2], 10) : -1

            if (tok.includes('prologue_end')) {
                stackReady = true
                if (!enteredCurrentFunc && !skipInstrument.has(currentFuncName) && isUserCode) {
                    needsEnterCall = true
                }
            }
        }
        else if (opcode === 'end_function') {
            if (enteredCurrentFunc) {
                output.push('\tcall\tJS_notify_exit')
            }
            inFunc = false; stackReady = false; enteredCurrentFunc = false
        }

        const isInstruction = !opcode.startsWith('.') && !opcode.startsWith('#') &&
            !opcode.startsWith('@') && !opcode.endsWith(':') &&
            opcode !== 'end_function' && /^[a-z_]/.test(opcode)

        if (inFunc && !stackReady && isInstruction) {
            if (opcode === 'i32.const') {
                const tok = getTokens()
                if (tok[1]) lastI32Const = parseInt(tok[1], 10) || 0
            } else if (opcode === 'i32.sub' && frameAllocSize === 0) {
                frameAllocSize = lastI32Const
            } else if (opcode === 'global.set') {
                const tok = getTokens()
                if (tok[1] === '__stack_pointer') updatedGlobalSp = true
            }
        }

        if (needsEnterCall && isInstruction) {
            output.push(`\ti32.const\t${frameAllocSize}`)
            output.push(`\ti32.const\t${updatedGlobalSp ? 1 : 0}`)
            output.push('\tcall\tJS_notify_enter')
            needsEnterCall = false
            enteredCurrentFunc = true
        }

        if (inFunc && isInstruction && opcode === 'return' && enteredCurrentFunc) {
            output.push('\tcall\tJS_notify_exit')
        }

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
