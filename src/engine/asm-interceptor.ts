// ── ASM Interceptor ────────────────────────────────────────────────
// Architecture C: LLVM Assembly Intercept
//
// Reads the intermediate Clang `.s` assembly file and injects
// `JS_debug_step(lineNumber)` calls at source-line boundaries.
//
// Three key invariants:
// 1. Pristine Source — student C++ is 100% untouched
// 2. Perfect Stack Frames — waits for .loc prologue_end before injecting
// 3. "Just My Code" — filters by .file ID so we skip std library
//
// The injected WebAssembly instructions:
//   i32.const <lineNumber>
//   call JS_debug_step
//
// These freeze the Worker thread via Atomics.wait in the JS import,
// letting React read the WASM memory snapshot while paused.

export interface InstrumentResult {
    output: string
    injectedCount: number
    userFileIds: string[]
    diagnostics: string
}

export function instrumentAssembly(asmText: string): string {
    const result = instrumentAssemblyDetailed(asmText)
    return result.output
}

export function instrumentAssemblyDetailed(asmText: string): InstrumentResult {
    const lines = asmText.split('\n')
    const output: string[] = []
    const diagnostics: string[] = []

    let inFunc = false
    let stackReady = false
    let currentLine = -1
    let injectedCount = 0
    let injectedLines = new Set<number>()
    const userFileIds = new Set<string>()
    let funcCount = 0
    let locCount = 0
    let prologueEndCount = 0

    // Declare the JS_debug_step function signature at the top of the assembly
    // so the linker knows about it when assembling to WASM
    output.push('\t.functype\tJS_debug_step (i32) -> ()')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // 1. Identify File IDs that belong to the student's /workspace
        //    WASM .s format: .file <id> "<path>" [<checksum>]
        //    or just: .file <id> "<path>"
        const fileMatch = line.match(/^\s*\.file\s+(\d+)\s+"([^"]+)"/)
        if (fileMatch) {
            const fileId = fileMatch[1]
            const filePath = fileMatch[2]
            diagnostics.push(`File ${fileId}: ${filePath}`)

            // Accept files from /workspace/ as user code
            if (filePath.includes('/workspace/') || filePath.includes('main.cpp') || !filePath.includes('/sysroot/')) {
                userFileIds.add(fileId)
            }
        }

        // Also handle .file <id> without quotes (some LLVM versions)
        const fileMatchNoQuote = line.match(/^\s*\.file\s+(\d+)\s+(\S+)/)
        if (fileMatchNoQuote && !fileMatch) {
            const fileId = fileMatchNoQuote[1]
            const filePath = fileMatchNoQuote[2]
            diagnostics.push(`File ${fileId}: ${filePath}`)
            if (filePath.includes('/workspace/') || filePath.includes('main.cpp') || !filePath.includes('/sysroot/')) {
                userFileIds.add(fileId)
            }
        }

        // 2. Detect function boundaries
        //    WASM .s uses: .functype <name> (params) -> (results)
        if (line.match(/^\s*\.functype\s/) && !line.includes('JS_debug_step')) {
            funcCount++
            inFunc = true
            stackReady = false
            currentLine = -1
            injectedLines = new Set<number>()
        }

        // 3. Detect source code line mappings & stack readiness
        //    .loc <fileId> <lineNum> <colNum> [prologue_end]
        const locMatch = line.match(/^\s*\.loc\s+(\d+)\s+(\d+)/)
        if (locMatch) {
            locCount++
            const fileId = locMatch[1]
            currentLine = parseInt(locMatch[2], 10)

            // Wait until the WASM stack pointer is fully initialized!
            if (line.includes('prologue_end')) {
                stackReady = true
                prologueEndCount++
            }

            // If we are in the standard library, ignore the line
            if (!userFileIds.has(fileId)) {
                currentLine = -1
            }
        }

        // 4. Identify an executable WebAssembly instruction
        //    WASM .s instructions: local.set, i32.store, call, i32.add, etc.
        //    They start with whitespace, then a word. NOT a directive (starts with .)
        //    NOT a label (contains :). NOT a comment (starts with #)
        const trimmed = line.trim()
        const isInstruction = trimmed.length > 0
            && !trimmed.startsWith('.')   // Not a directive
            && !trimmed.startsWith('#')   // Not a comment
            && !trimmed.startsWith('@')   // Not a metadata annotation
            && !trimmed.endsWith(':')     // Not a label
            && !trimmed.startsWith('end_function') // Not end marker
            && /^[a-z_]/.test(trimmed)    // Starts with lowercase letter or underscore

        // 5. INJECT PAUSE: If the stack is ready, we are in user code,
        //    and on a new source line we haven't injected yet
        if (inFunc && stackReady && currentLine > 0 && isInstruction) {
            if (!injectedLines.has(currentLine)) {
                output.push(`\ti32.const\t${currentLine}`)   // Push line number
                output.push(`\tcall\tJS_debug_step`)         // Freeze Worker!
                injectedLines.add(currentLine)
                injectedCount++
            }
        }

        // Push the original instruction AFTER our injected hook
        output.push(line)
    }

    diagnostics.push(`Functions: ${funcCount}, .loc entries: ${locCount}, prologue_end: ${prologueEndCount}`)
    diagnostics.push(`User file IDs: [${[...userFileIds].join(', ')}]`)
    diagnostics.push(`Injected: ${injectedCount}`)

    return {
        output: output.join('\n'),
        injectedCount,
        userFileIds: [...userFileIds],
        diagnostics: diagnostics.join(' | '),
    }
}
