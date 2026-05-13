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

export class JsonStream {
    private inJson = false
    private rawText: number[] = []
    private unbalancedBraces = 0
    private inString = false
    // While in a string, how many more chars are part of an escape (`ሴ`
    // uses 5 — the `u` plus 4 hex digits — others use 1).
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
                this.inJson = false
                return this.decoder.decode(new Uint8Array(this.rawText))
            }
        } else if (charCode === QUOT) {
            this.inString = true
        }
        return null
    }
}
