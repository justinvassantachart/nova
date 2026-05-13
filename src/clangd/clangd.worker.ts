/// <reference lib="WebWorker" />

// Worker that hosts an Emscripten-compiled `clangd` binary and bridges its
// stdio to the main thread via `postMessage`. Adapted in spirit from
// guyutongxue/clangd-in-browser, but with our own LSP framing and a fs-write
// protocol so the main thread can keep clangd's view of the workspace in
// sync as the user edits / renames / deletes files.

import { CLANGD_JS_URL, CLANGD_WASM_URL, COMPILE_FLAGS, WORKSPACE_PATH } from './config'
import { JsonStream } from './json-stream'
import type { ClientToWorker, LspMessage, WorkerToClient } from './lsp-types'

declare const self: DedicatedWorkerGlobalScope

interface ClangdFS {
    writeFile(path: string, data: string | Uint8Array): void
    unlink(path: string): void
    mkdir(path: string, mode?: number): void
    analyzePath(path: string, dontResolveLastLink?: boolean): { exists: boolean }
}
interface ClangdModule {
    FS: ClangdFS
    callMain(args: string[]): number
}
interface ClangdModuleOptions {
    thisProgram?: string
    locateFile?(path: string, prefix: string): string
    mainScriptUrlOrBlob?: string
    stdinReady?: () => Promise<void> | void
    stdin?: () => number | null
    stdout?: (charCode: number) => void
    stderr?: (charCode: number) => void
    onExit?: (code: number) => void
    onAbort?: (reason: unknown) => void
    print?: (text: string) => void
    printErr?: (text: string) => void
}
type ClangdFactory = (opts: ClangdModuleOptions) => Promise<ClangdModule>

function send(message: WorkerToClient) {
    self.postMessage(message)
}

async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`clangd: fetch ${url} failed (${response.status})`)
    }
    // content-length may be missing under gzip; fall back to length-unknown.
    const totalHeader = response.headers.get('content-length')
    const total = totalHeader ? Number(totalHeader) : 0

    const reader = response.body?.getReader()
    if (!reader) {
        // Browser doesn't support streaming reads (very old) — fall back to a
        // single chunk and report once.
        const buf = await response.arrayBuffer()
        send({ type: 'progress', loaded: buf.byteLength, total: buf.byteLength })
        return buf
    }

    const chunks: Uint8Array[] = []
    let loaded = 0
    let lastReport = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        chunks.push(value)
        loaded += value.byteLength
        // Throttle progress posts so we don't spam the main thread.
        const now = performance.now()
        if (now - lastReport > 100) {
            send({ type: 'progress', loaded, total })
            lastReport = now
        }
    }
    send({ type: 'progress', loaded, total: total || loaded })

    const out = new Uint8Array(loaded)
    let offset = 0
    for (const c of chunks) {
        out.set(c, offset)
        offset += c.byteLength
    }
    return out.buffer
}

async function start() {
    // 1. Fetch the wasm binary with progress.
    const wasmBuffer = await fetchWithProgress(CLANGD_WASM_URL)
    const wasmBlobUrl = URL.createObjectURL(
        new Blob([wasmBuffer], { type: 'application/wasm' }),
    )

    // 2. Fetch the emscripten loader as text and import via blob URL. This
    //    avoids cross-origin module-loading restrictions for the JS itself
    //    (the wasm is fine via fetch + Blob).
    const jsResp = await fetch(CLANGD_JS_URL)
    if (!jsResp.ok) {
        throw new Error(`clangd: fetch ${CLANGD_JS_URL} failed (${jsResp.status})`)
    }
    const jsText = await jsResp.text()
    const jsBlobUrl = URL.createObjectURL(new Blob([jsText], { type: 'text/javascript' }))
    const factoryModule: { default: ClangdFactory } = await import(
        /* @vite-ignore */ jsBlobUrl
    )
    const Clangd = factoryModule.default

    // 3. Stdio glue. Stdin is a FIFO of strings (one per LSP message body or
    //    framing header) that emscripten drains byte-by-byte.
    const encoder = new TextEncoder()
    let stdinResolve: (() => void) | null = null
    const stdinChunks: string[] = []
    const currentBytes: (number | null)[] = []

    const stdinReady = (): Promise<void> | void => {
        if (stdinChunks.length > 0 || currentBytes.length > 0) return
        return new Promise<void>((r) => (stdinResolve = r))
    }
    const stdin = (): number | null => {
        if (currentBytes.length === 0) {
            const next = stdinChunks.shift()
            if (next === undefined) return null
            currentBytes.push(...encoder.encode(next), null)
        }
        const next = currentBytes.shift()
        return next === undefined ? null : next
    }

    const jsonStream = new JsonStream()
    const stdout = (charCode: number) => {
        const complete = jsonStream.insert(charCode)
        if (complete === null) return
        try {
            const message = JSON.parse(complete) as LspMessage
            send({ type: 'lsp', message })
        } catch (err) {
            send({ type: 'error', message: `clangd: failed to parse stdout: ${String(err)}` })
        }
    }
    // stderr is intentionally swallowed; emscripten dumps a lot here that's
    // noisy for end users. Re-enable for debugging by uncommenting.
    const stderr = () => {}

    const onAbort = (reason: unknown) => {
        send({ type: 'error', message: `clangd aborted: ${String(reason)}` })
    }

    // 4. Boot the module.
    const clangd = await Clangd({
        thisProgram: '/usr/bin/clangd',
        locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? wasmBlobUrl : `${prefix}${path}`,
        mainScriptUrlOrBlob: jsBlobUrl,
        stdinReady,
        stdin,
        stdout,
        stderr,
        onExit: (code: number) => onAbort(`exit ${code}`),
        onAbort,
    })

    // 5. Workspace + compile-flags setup. Files arrive from the main thread
    //    via `fs:writeAll` (initial bootstrap) and `fs:write`/`fs:delete`
    //    after that. We pre-create the workspace dir so writes don't race
    //    on missing-parent.
    ensureDir(clangd.FS, WORKSPACE_PATH)
    clangd.FS.writeFile(
        `${WORKSPACE_PATH}/.clangd`,
        JSON.stringify({ CompileFlags: { Add: [...COMPILE_FLAGS] } }),
    )

    // 6. Handle the protocol with the main thread.
    self.addEventListener('message', (e: MessageEvent<ClientToWorker>) => {
        const data = e.data
        switch (data.type) {
            case 'lsp': {
                writeLspToStdin(data.message)
                break
            }
            case 'fs:write': {
                writeFile(clangd.FS, data.path, data.content)
                break
            }
            case 'fs:delete': {
                tryUnlink(clangd.FS, data.path)
                break
            }
            case 'fs:writeAll': {
                for (const [path, content] of Object.entries(data.files)) {
                    writeFile(clangd.FS, path, content)
                }
                break
            }
        }
    })

    function writeLspToStdin(message: LspMessage) {
        // Escape non-ASCII so Content-Length (byte count) matches the actual
        // string length emscripten will read from stdin. clangd uses the
        // header to demarcate messages — a mismatch wedges the parser.
        const body = JSON.stringify(message).replace(/[-￿]/g, (ch) => {
            const code = ch.codePointAt(0)
            return code === undefined ? ch : `\\u${code.toString(16).padStart(4, '0')}`
        })
        stdinChunks.push(`Content-Length: ${body.length}\r\n\r\n`, body)
        stdinResolve?.()
        stdinResolve = null
    }

    // 7. Run clangd. callMain() blocks reading on stdin via Atomics in
    //    pthread mode — without the wait_stdin patch upstream applies,
    //    clangd would otherwise spin. We trust the prebuilt to include it.
    send({ type: 'ready' })
    clangd.callMain([])
}

function ensureDir(fs: ClangdFS, path: string) {
    const segments = path.split('/').filter(Boolean)
    let cur = ''
    for (const seg of segments) {
        cur += '/' + seg
        if (!fs.analyzePath(cur).exists) {
            try {
                fs.mkdir(cur)
            } catch {
                // Race with parallel writes — directory exists. Ignore.
            }
        }
    }
}

function writeFile(fs: ClangdFS, path: string, content: string) {
    const dir = path.substring(0, path.lastIndexOf('/'))
    if (dir) ensureDir(fs, dir)
    try {
        fs.writeFile(path, content)
    } catch (err) {
        send({ type: 'error', message: `clangd: writeFile ${path} failed: ${String(err)}` })
    }
}

function tryUnlink(fs: ClangdFS, path: string) {
    try {
        if (fs.analyzePath(path).exists) fs.unlink(path)
    } catch {
        // unlink is best-effort — clangd may have already lost the file.
    }
}

start().catch((err: unknown) => {
    send({ type: 'error', message: `clangd: boot failed: ${String(err)}` })
})
