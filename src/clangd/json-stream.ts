// clangd writes LSP messages as `Content-Length: N\r\n\r\n{json}`, but
// emscripten hands us bytes one at a time. Trusting Content-Length is
// flaky (gzip + UTF-8 escaping can desync the byte count), so we scan for
// a top-level `{`, track brace/string state, and emit when braces balance.
//
// Adapted from guyutongxue/clangd-in-browser (MIT).

const QUOT = 34 // "
const LBRACE = 123 // {
const RBRACE = 125 // }
const BACKSLASH = 92 // \

// Defensive cap. If clangd crashes mid-message we'd otherwise accumulate
// forever. 16 MB is well above any real LSP payload.
const MAX_BUFFER_BYTES = 16 * 1024 * 1024

export class JsonStream {
    private inJson = false
    private rawText: number[] = []
    private unbalancedBraces = 0
    private inString = false
    // Number of bytes left to consume as part of the current escape. Most
    // escapes use 1 (\", \\, \n…); \uXXXX uses 5 — the `u` plus 4 hex
    // digits — so we add 4 more when we see `u`.
    private inEscape = 0
    private readonly decoder = new TextDecoder()

    /** Returns the JSON text when a top-level object completes, else null. */
    insert(charCode: number): string | null {
        if (!this.inJson && charCode === LBRACE) {
            this.inJson = true
            this.rawText = []
        }
        if (!this.inJson) return null

        this.rawText.push(charCode)
        if (this.rawText.length > MAX_BUFFER_BYTES) {
            // Mid-message corruption — drop the buffer and let the next `{` re-sync.
            this.reset()
            return null
        }

        if (this.inString) {
            if (this.inEscape) {
                if (charCode === 117) this.inEscape += 4 // 'u' starts \uXXXX
                this.inEscape--
            } else if (charCode === BACKSLASH) {
                this.inEscape = 1
            } else if (charCode === QUOT) {
                this.inString = false
            }
            return null
        }

        if (charCode === LBRACE) {
            this.unbalancedBraces++
        } else if (charCode === RBRACE) {
            this.unbalancedBraces--
            if (this.unbalancedBraces === 0) {
                const text = this.decoder.decode(new Uint8Array(this.rawText))
                this.reset()
                return text
            }
        } else if (charCode === QUOT) {
            this.inString = true
        }
        return null
    }

    private reset(): void {
        this.inJson = false
        this.rawText = []
        this.unbalancedBraces = 0
        this.inString = false
        this.inEscape = 0
    }
}
