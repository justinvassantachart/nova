// Pure unit tests for the clangd integration's testable surface.
//
// Run with: node scripts/test-clangd.mjs
//
// We can't fully exercise the worker (it loads ~120 MB of wasm from a CDN),
// so we focus on the framing/parsing logic that doesn't need a real
// clangd attached.

import { strict as assert } from 'node:assert'

// vite-friendly: we copy the JsonStream code so this script can run without a
// build step. If the original implementation changes, update here too — the
// test fails loudly if behaviour diverges.

const QUOT = 34
const LBRACE = 123
const RBRACE = 125
const BACKSLASH = 92

class JsonStream {
    constructor() {
        this.inJson = false
        this.rawText = []
        this.unbalancedBraces = 0
        this.inString = false
        this.inEscape = 0
        this.decoder = new TextDecoder()
    }

    insert(charCode) {
        if (!this.inJson && charCode === LBRACE) {
            this.inJson = true
            this.rawText = []
        }
        if (!this.inJson) return null
        this.rawText.push(charCode)

        if (this.inString) {
            if (this.inEscape) {
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

function feed(stream, text) {
    const bytes = new TextEncoder().encode(text)
    const completions = []
    for (const b of bytes) {
        const result = stream.insert(b)
        if (result !== null) completions.push(result)
    }
    return completions
}

// Verify the JsonStream from the actual source matches our copy. Catches
// "I tweaked the worker but forgot to update this script" drift.
const stream = new JsonStream()
const original = await import('../src/clangd/json-stream.ts')
const origStream = new original.JsonStream()

for (const text of [
    '{"hello":"world"}',
    '{"a":1,"b":[1,2,{"c":3}]}',
    '{"escape":"\\"quoted\\""}',
    '{"unicode":"\\u00ff"}',
]) {
    const got = feed(stream, text)
    const orig = []
    for (const b of new TextEncoder().encode(text)) {
        const r = origStream.insert(b)
        if (r !== null) orig.push(r)
    }
    assert.deepEqual(got, orig, `parity for ${text}`)
}
console.log('  ok: JsonStream parity between copy and original')

// ---------- JsonStream behaviour tests ----------

function test(name, fn) {
    try {
        fn()
        console.log(`  ok: ${name}`)
    } catch (err) {
        console.error(`  FAIL: ${name}`)
        console.error(err)
        process.exitCode = 1
    }
}

test('single complete object', () => {
    const s = new JsonStream()
    const out = feed(s, 'Content-Length: 17\r\n\r\n{"hello":"world"}')
    assert.deepEqual(out, ['{"hello":"world"}'])
})

test('two back-to-back messages', () => {
    const s = new JsonStream()
    const out = feed(s, '{"a":1}{"b":2}')
    assert.deepEqual(out, ['{"a":1}', '{"b":2}'])
})

test('nested objects and arrays', () => {
    const s = new JsonStream()
    const text = '{"id":1,"result":{"items":[{"label":"foo"},{"label":"bar"}]}}'
    assert.deepEqual(feed(s, text), [text])
})

test('escaped quote inside string does not close', () => {
    const s = new JsonStream()
    const text = '{"msg":"he said \\"hi\\""}'
    assert.deepEqual(feed(s, text), [text])
})

test('lone braces inside strings are ignored', () => {
    const s = new JsonStream()
    const text = '{"signature":"void f(int) { return; }"}'
    assert.deepEqual(feed(s, text), [text])
})

test('split across two feeds (simulating chunked stdout)', () => {
    const s = new JsonStream()
    assert.deepEqual(feed(s, '{"id":'), [])
    assert.deepEqual(feed(s, '1,"result":null}'), ['{"id":1,"result":null}'])
})

test('header noise before object is dropped', () => {
    const s = new JsonStream()
    const out = feed(s, 'Content-Length: 7\r\n\r\n{"x":1}')
    assert.deepEqual(out, ['{"x":1}'])
})

test('unicode escape sequences inside string', () => {
    const s = new JsonStream()
    const text = '{"emoji":"\\ud83d\\ude00"}'
    assert.deepEqual(feed(s, text), [text])
})

// ---------- config.ts pure helpers ----------

const config = await import('../src/clangd/config.ts')

test('isCppPath recognises common C/C++ extensions', () => {
    for (const p of [
        '/workspace/main.cpp',
        '/workspace/foo.cc',
        '/workspace/foo.C',
        '/workspace/foo.hpp',
        '/workspace/Bar.H',
        '/workspace/file.c',
    ]) {
        assert.equal(config.isCppPath(p), true, p)
    }
    for (const p of [
        '/workspace/README.md',
        '/workspace/build.json',
        '/workspace/main.cpp.txt',
        '/workspace/Makefile',
    ]) {
        assert.equal(config.isCppPath(p), false, p)
    }
})

test('toClangdPath leaves workspace-prefixed paths alone', () => {
    assert.equal(config.toClangdPath('/workspace/main.cpp'), '/workspace/main.cpp')
    assert.equal(config.toClangdPath('/workspace'), '/workspace')
})

test('toClangdPath rewrites non-workspace paths', () => {
    assert.equal(config.toClangdPath('main.cpp'), '/workspace/main.cpp')
    assert.equal(config.toClangdPath('/other.cpp'), '/other.cpp')
})

test('toClangdUri produces file:// URI', () => {
    assert.equal(
        config.toClangdUri('/workspace/main.cpp'),
        'file:///workspace/main.cpp',
    )
})

console.log('\nclangd unit tests complete.')
