// Pure unit tests for the clangd integration's testable surface.
//
// Run with: bash scripts/test-clangd.sh
//
// We can't fully exercise the worker (it loads ~120 MB of wasm from a CDN),
// so we focus on the framing/parsing logic that doesn't need a real clangd
// attached. The JsonStream test pulls the real implementation via the
// alias-loader so a bug fix in `src/clangd/json-stream.ts` shows up here
// without anyone needing to remember to update a duplicate.

import { strict as assert } from 'node:assert'

const { JsonStream } = await import('../src/clangd/json-stream.ts')
const config = await import('../src/clangd/config.ts')

function feed(stream, text) {
    const bytes = new TextEncoder().encode(text)
    const completions = []
    for (const b of bytes) {
        const result = stream.insert(b)
        if (result !== null) completions.push(result)
    }
    return completions
}

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

// ---------- JsonStream ----------

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

test('runaway buffer caps gracefully and re-syncs on next object', () => {
    const s = new JsonStream()
    // Open a string and never close it (mid-message corruption shape).
    const giant = '{"' + 'a'.repeat(20 * 1024 * 1024)
    feed(s, giant)
    // After the cap kicks in, a fresh well-formed object should still parse.
    assert.deepEqual(feed(s, '{"recovered":true}'), ['{"recovered":true}'])
})

// ---------- config helpers ----------

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

test('monacoLanguageFor maps all CPP extensions to cpp', () => {
    for (const ext of ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h', '.cp', '.c']) {
        assert.equal(config.monacoLanguageFor(`/workspace/foo${ext}`), 'cpp', ext)
    }
    assert.equal(config.monacoLanguageFor('/workspace/README.md'), 'plaintext')
    assert.equal(config.monacoLanguageFor('/workspace/Makefile'), 'plaintext')
})

test('toClangdPath leaves workspace-prefixed paths alone', () => {
    assert.equal(config.toClangdPath('/workspace/main.cpp'), '/workspace/main.cpp')
    assert.equal(config.toClangdPath('/workspace'), '/workspace')
})

test('toClangdPath rewrites non-workspace paths', () => {
    assert.equal(config.toClangdPath('main.cpp'), '/workspace/main.cpp')
    assert.equal(config.toClangdPath('/other.cpp'), '/other.cpp')
})

test('toClangdUri produces a percent-encoded file:// URI', () => {
    assert.equal(
        config.toClangdUri('/workspace/main.cpp'),
        'file:///workspace/main.cpp',
    )
    // Spaces and `#` are illegal in raw URI paths — must be escaped.
    assert.equal(
        config.toClangdUri('/workspace/with space.cpp'),
        'file:///workspace/with%20space.cpp',
    )
    assert.equal(
        config.toClangdUri('/workspace/hash#sign.cpp'),
        'file:///workspace/hash%23sign.cpp',
    )
})

console.log('\nclangd unit tests complete.')
