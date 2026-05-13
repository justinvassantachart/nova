// clangd writes LSP messages to stdout as `Content-Length: N\r\n\r\n{json}`,
// but emscripten hands us a stream of byte codes one-at-a-time. We don't
// trust the Content-Length header (gzipped UTF-8 escaping can desync it) —
// instead we scan for a top-level `{`, track brace/string state, and emit
// once braces balance.
//
// Adapted from guyutongxue/clangd-in-browser (MIT).

const QUOT = 34 // "
const LBRACE = 123 // {
const RBRACE = 125 // }
const BACKSLASH = 92 // \

// Defensive ceiling on the size of one in-progress message. If clangd crashes
// mid-write the parser would otherwise accumulate bytes forever; this caps
// runaway growth at 16 MB (well above any real LSP payload) and resets when
// exceeded so the next `{` starts fresh.
const MAX_BUFFER_BYTES = 16 * 1024 * 1024

export class JsonStream {
    private inJson = false
    private rawText: number[] = []
    private unbalancedBraces = 0
    private inString = false
    // While in a string, how many more chars are part of an escape. Most
    // escapes (`\"`, `\\`, `\n`, …) advance one. `\uXXXX` is special: when
    // we see the `u` we add 4 more so the four hex digits don't get
    // interpreted as JSON structure.
    private inEscape = 0
    private readonly decoder = new TextDecoder()

    /**
     * Feed one byte. Returns the full JSON text when a top-level object
     * completes, or null otherwise.
     */
    insert(charCode: number): string | null {
        if (!this.inJson && charCode === LBRACE) {
            this.inJson = true
            this.rawText = []
        }
        if (!this.inJson) return null

        this.rawText.push(charCode)
        if (this.rawText.length > MAX_BUFFER_BYTES) {
            // Probably mid-message corruption (clangd crashed mid-write,
            // framing went sideways). Drop the buffer; the next top-level
            // `{` re-syncs us.
            this.reset()
            return null
        }

        if (this.inString) {
            if (this.inEscape) {
                // `u` (117) starts a 4-hex-digit escape; treat the `u` itself
                // as one of the chars already consumed by inEscape=1, then add
                // 4 more for the digits.
                if (charCode === 117) this.inEscape += 4
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
