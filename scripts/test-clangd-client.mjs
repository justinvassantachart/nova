// Integration test for ClangdClient — uses a fake in-process worker that
// speaks our `ClientToWorker` / `WorkerToClient` protocol. Verifies request
// correlation, notification dispatch, error propagation, and dispose
// semantics without needing the real ~120 MB clangd binary.
//
// Run with: node scripts/test-clangd-client.mjs

import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'

// ---------- Fake DOM-style Worker shim ----------

class FakeWorker extends EventEmitter {
    constructor() {
        super()
        // The "other side" — main thread sends messages we receive here, and
        // we send messages it receives via addEventListener('message').
        this.fromMain = []
        this.toMain = []
        this.terminated = false
    }

    // Worker-side API: receive messages from main, send replies.
    onMain(handler) {
        this.mainHandler = handler
    }

    sendToMain(msg) {
        if (this.terminated) return
        // Defer so it looks asynchronous like a real worker.
        queueMicrotask(() => this.emit('message', { data: msg }))
    }

    // ===== DOM-style Worker surface that ClangdClient uses =====

    postMessage(msg) {
        if (this.terminated) return
        queueMicrotask(() => this.mainHandler?.(msg))
    }

    addEventListener(type, listener) {
        if (type === 'message') this.on('message', listener)
        else if (type === 'error') this.on('error', listener)
    }

    removeEventListener(type, listener) {
        this.off(type, listener)
    }

    terminate() {
        this.terminated = true
    }
}

// Stub the Worker global so `import` of ClangdClient works.
globalThis.Worker = function StubWorker() {
    if (!globalThis.__activeFakeWorker) {
        throw new Error('test bug: no FakeWorker registered')
    }
    return globalThis.__activeFakeWorker
}

// Stub `new URL(spec, import.meta.url)` requirement isn't actually triggered
// because StubWorker ignores its constructor arg, but `import.meta.url`
// resolution may matter for other parts of the file.

// ---------- Import the real ClangdClient ----------

// Node can't import .ts directly; load via tsx-style or copy. We use
// node:dynamic-import with --experimental-strip-types (Node 22+).
const { ClangdClient } = await import('../src/clangd/ClangdClient.ts')

function fresh() {
    const worker = new FakeWorker()
    globalThis.__activeFakeWorker = worker
    const client = new ClangdClient()
    // The worker's main-handler should now be registered. Capture it.
    return { worker, client }
}

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => console.log(`  ok: ${name}`))
        .catch((err) => {
            console.error(`  FAIL: ${name}`)
            console.error(err)
            process.exitCode = 1
        })
}

// ---------- Tests ----------

await test('ready resolves after worker sends ready', async () => {
    const { worker, client } = fresh()
    let resolved = false
    client.ready().then(() => (resolved = true))
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(resolved, false, 'not ready before worker says so')
    worker.sendToMain({ type: 'ready' })
    await client.ready()
    assert.equal(resolved, true)
    assert.equal(client.getStatus().state, 'ready')
    client.dispose()
})

await test('progress events flow to status emitter', async () => {
    const { worker, client } = fresh()
    const statuses = []
    client.onStatus.subscribe((s) => statuses.push(s))
    worker.sendToMain({ type: 'progress', loaded: 1000, total: 5000 })
    worker.sendToMain({ type: 'progress', loaded: 5000, total: 5000 })
    worker.sendToMain({ type: 'ready' })
    await client.ready()
    assert.equal(statuses.length, 3)
    assert.deepEqual(statuses[0], { state: 'starting', loaded: 1000, total: 5000 })
    assert.deepEqual(statuses[1], { state: 'starting', loaded: 5000, total: 5000 })
    assert.deepEqual(statuses[2], { state: 'ready' })
    client.dispose()
})

await test('request gets correlated to its response', async () => {
    const { worker, client } = fresh()
    worker.sendToMain({ type: 'ready' })
    await client.ready()

    // Capture what main sends to worker; reply with a matching id.
    const seen = []
    worker.onMain((msg) => {
        seen.push(msg)
        if (msg.type === 'lsp' && msg.message.method === 'foo') {
            worker.sendToMain({
                type: 'lsp',
                message: { jsonrpc: '2.0', id: msg.message.id, result: { ok: true } },
            })
        }
    })

    const result = await client.request('foo', { a: 1 })
    assert.deepEqual(result, { ok: true })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].message.method, 'foo')
    assert.deepEqual(seen[0].message.params, { a: 1 })
    client.dispose()
})

await test('request rejects on error response', async () => {
    const { worker, client } = fresh()
    worker.sendToMain({ type: 'ready' })
    await client.ready()
    worker.onMain((msg) => {
        if (msg.type === 'lsp') {
            worker.sendToMain({
                type: 'lsp',
                message: {
                    jsonrpc: '2.0',
                    id: msg.message.id,
                    error: { code: -32601, message: 'method not found' },
                },
            })
        }
    })
    let threw = false
    try {
        await client.request('bogus')
    } catch (err) {
        threw = true
        assert.match(err.message, /method not found/)
    }
    assert.equal(threw, true)
    client.dispose()
})

await test('concurrent requests stay correlated', async () => {
    const { worker, client } = fresh()
    worker.sendToMain({ type: 'ready' })
    await client.ready()

    const seen = []
    worker.onMain((msg) => {
        if (msg.type !== 'lsp') return
        seen.push(msg.message)
        // Reply out of order to confirm id-based correlation.
    })

    const p1 = client.request('first')
    const p2 = client.request('second')
    const p3 = client.request('third')
    // Drain the queued sends.
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(seen.length, 3)
    // Reply 3rd → 1st → 2nd.
    worker.sendToMain({ type: 'lsp', message: { jsonrpc: '2.0', id: seen[2].id, result: 'C' } })
    worker.sendToMain({ type: 'lsp', message: { jsonrpc: '2.0', id: seen[0].id, result: 'A' } })
    worker.sendToMain({ type: 'lsp', message: { jsonrpc: '2.0', id: seen[1].id, result: 'B' } })
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    assert.equal(r1, 'A')
    assert.equal(r2, 'B')
    assert.equal(r3, 'C')
    client.dispose()
})

await test('notifications dispatch to subscribed handler', async () => {
    const { worker, client } = fresh()
    worker.sendToMain({ type: 'ready' })
    await client.ready()
    let got
    const unsub = client.on('textDocument/publishDiagnostics', (params) => {
        got = params
    })
    worker.sendToMain({
        type: 'lsp',
        message: {
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: { uri: 'file:///main.cpp', diagnostics: [] },
        },
    })
    await new Promise((r) => setTimeout(r, 0))
    assert.deepEqual(got, { uri: 'file:///main.cpp', diagnostics: [] })
    unsub()
    // Subsequent notifications shouldn't reach the unsubscribed handler.
    got = undefined
    worker.sendToMain({
        type: 'lsp',
        message: {
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: { uri: 'file:///other.cpp', diagnostics: [] },
        },
    })
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(got, undefined)
    client.dispose()
})

await test('writeFiles bulk-writes via fs:writeAll', async () => {
    const { worker, client } = fresh()
    const seen = []
    worker.onMain((msg) => seen.push(msg))
    client.writeFiles({ '/workspace/main.cpp': 'int main(){}' })
    client.writeFile('/workspace/foo.h', '#pragma once')
    client.deleteFile('/workspace/old.cpp')
    await new Promise((r) => setTimeout(r, 0))
    assert.deepEqual(seen[0], { type: 'fs:writeAll', files: { '/workspace/main.cpp': 'int main(){}' } })
    assert.deepEqual(seen[1], { type: 'fs:write', path: '/workspace/foo.h', content: '#pragma once' })
    assert.deepEqual(seen[2], { type: 'fs:delete', path: '/workspace/old.cpp' })
    client.dispose()
})

await test('error message before ready rejects ready()', async () => {
    const { worker, client } = fresh()
    worker.sendToMain({ type: 'error', message: 'fetch failed' })
    let threw = false
    try {
        await client.ready()
    } catch (err) {
        threw = true
        assert.match(err.message, /fetch failed/)
    }
    assert.equal(threw, true)
    assert.equal(client.getStatus().state, 'error')
    client.dispose()
})

await test('dispose rejects pending requests and ignores subsequent traffic', async () => {
    const { worker, client } = fresh()
    worker.sendToMain({ type: 'ready' })
    await client.ready()
    const pending = client.request('slow')
    client.dispose()
    let threw = false
    try {
        await pending
    } catch (err) {
        threw = true
        assert.match(err.message, /disposed/)
    }
    assert.equal(threw, true)
    assert.equal(client.getStatus().state, 'disposed')
    // After dispose, send/notify/writeFile become no-ops.
    client.notify('foo')
    client.writeFile('/a', 'b')
    let rejected = false
    try {
        await client.request('x')
    } catch (err) {
        rejected = true
        assert.match(err.message, /disposed/)
    }
    assert.equal(rejected, true)
})

console.log('\nClangdClient integration tests complete.')
