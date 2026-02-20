// ── ASM Interceptor ────────────────────────────────────────────────
// Architecture C: LLVM Assembly Intercept
//
// Reads the intermediate Clang `.s` assembly file and injects
// `JS_debug_step(stepId)` calls at source-line boundaries.
//
// Three key invariants:
// 1. Pristine Source — student C++ is 100% untouched
// 2. Perfect Stack Frames — waits for .loc prologue_end before injecting
// 3. "Just My Code" — filters by .file ID so we skip std library
//
// The stepMap records which stepId maps to which (line, func) pair,
// enabling the UI to show the correct function scope and call stack.

export interface InstrumentResult {
    output: string
    injectedCount: number
    userFileIds: string[]
    diagnostics: string
    stepMap: Record<number, { line: number; func: string }>
}

export function instrumentAssembly(asmText: string): string {
    return instrumentAssemblyDetailed(asmText).output
}

export function instrumentAssemblyDetailed(asmText: string, startStepId: number = 1): InstrumentResult {
    const lines = asmText.split('\n')
    const output: string[] = []
    const diagnostics: string[] = []
    const stepMap: Record<number, { line: number; func: string }> = {}

    let inFunc = false
    let stackReady = false
    let currentLine = -1
    let currentFuncName = 'unknown'
    let stepIdCounter = startStepId
    let injectedLines = new Set<number>()
    const userFileIds = new Set<string>()
    let funcCount = 0
    let locCount = 0
    let prologueEndCount = 0

    // Declare the JS_debug_step function signature at the top of the assembly
    output.push('\t.functype\tJS_debug_step (i32) -> ()')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // 1. Identify File IDs that belong to the student's /workspace
        const fileMatch = line.match(/^\s*\.file\s+(\d+)\s+"([^"]+)"/) || line.match(/^\s*\.file\s+(\d+)\s+(\S+)/)
        if (fileMatch) {
            const fileId = fileMatch[1]
            const filePath = fileMatch[2]
            diagnostics.push(`File ${fileId}: ${filePath}`)
            if (filePath.includes('/workspace/') || filePath.includes('main.cpp') || !filePath.includes('/sysroot/')) {
                userFileIds.add(fileId)
            }
        }

        // 2. Detect function boundaries + demangle name
        const funcMatch = line.match(/^\s*\.functype\s+([^\s()]+)/)
        if (funcMatch && !line.includes('JS_debug_step')) {
            funcCount++
            let rawName = funcMatch[1]
            if (rawName === '__original_main') {
                currentFuncName = 'main'
            } else if (rawName.startsWith('_Z')) {
                // Itanium C++ name mangling: _Z{len}{name}{type suffixes}
                const lenMatch = rawName.match(/^_Z(\d+)/)
                if (lenMatch) {
                    const nameLen = parseInt(lenMatch[1], 10)
                    const start = lenMatch[0].length
                    currentFuncName = rawName.substring(start, start + nameLen)
                } else {
                    currentFuncName = rawName
                }
            } else {
                currentFuncName = rawName
            }
            inFunc = true
            stackReady = false
            currentLine = -1
            injectedLines = new Set<number>()
        }

        // 3. Detect source code line mappings & stack readiness
        const locMatch = line.match(/^\s*\.loc\s+(\d+)\s+(\d+)/)
        if (locMatch) {
            locCount++
            const fileId = locMatch[1]
            currentLine = parseInt(locMatch[2], 10)
            if (line.includes('prologue_end')) {
                stackReady = true
                prologueEndCount++
            }
            if (!userFileIds.has(fileId)) currentLine = -1
        }

        // 4. Identify an executable WebAssembly instruction
        const trimmed = line.trim()
        const isInstruction = trimmed.length > 0
            && !trimmed.startsWith('.')
            && !trimmed.startsWith('#')
            && !trimmed.startsWith('@')
            && !trimmed.endsWith(':')
            && !trimmed.startsWith('end_function')
            && /^[a-z_]/.test(trimmed)

        // 5. INJECT PAUSE with unique step ID
        if (inFunc && stackReady && currentLine > 0 && isInstruction) {
            if (!injectedLines.has(currentLine)) {
                stepMap[stepIdCounter] = { line: currentLine, func: currentFuncName }
                output.push(`\ti32.const\t${stepIdCounter}`)
                output.push(`\tcall\tJS_debug_step`)
                injectedLines.add(currentLine)
                stepIdCounter++
            }
        }

        output.push(line)
    }

    diagnostics.push(`Functions: ${funcCount}, .loc entries: ${locCount}, prologue_end: ${prologueEndCount}`)
    diagnostics.push(`User file IDs: [${[...userFileIds].join(', ')}]`)
    diagnostics.push(`Injected: ${stepIdCounter - startStepId}`)

    return {
        output: output.join('\n'),
        injectedCount: stepIdCounter - startStepId,
        userFileIds: [...userFileIds],
        diagnostics: diagnostics.join(' | '),
        stepMap,
    }
}
