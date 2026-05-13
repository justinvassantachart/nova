// Thin main-thread wrapper around the clangd worker. Hides worker lifecycle
// and turns the fire-and-forget LSP message bus into a request/response API
// + a notification subscription model.

import { EventEmitter } from '@/lib/event-emitter'
import type {
    ClientToWorker,
    LspMessage,
    LspNotification,
    LspParams,
    LspRequest,
    LspResponse,
    WorkerToClient,
} from './lsp-types'

type NotificationHandler = (params: LspParams) => void

// The full state machine ClangdProvider exposes. `idle` and `disabled` are
// emitted by the React provider before/instead of booting a client; the
// remaining four are emitted by ClangdClient itself as the worker progresses.
export type ClangdStatus =
    | { state: 'idle' }                                          // arm() not called yet
    | { state: 'disabled' }                                      // explicitly off (URL flag, localStorage, or host-mode)
    | { state: 'starting'; loaded: number; total: number }        // wasm + js downloading / booting
    | { state: 'ready' }                                          // accepting LSP traffic
    | { state: 'error'; message: string }                         // boot or worker fatal error
    | { state: 'disposed' }                                       // dispose() called, terminal

type Resolver = {
    resolve: (value: LspParams) => void
    reject: (err: Error) => void
}

export class ClangdClient {
    public readonly onStatus = new EventEmitter<ClangdStatus>()

    private worker: Worker
    private nextRequestId = 1
    private pending = new Map<number | string, Resolver>()
    private notifHandlers = new Map<string, Set<NotificationHandler>>()
    private readyPromise: Promise<void>
    private resolveReady!: () => void
    private rejectReady!: (err: Error) => void
    private status: ClangdStatus = { state: 'starting', loaded: 0, total: 0 }
    private disposed = false

    constructor() {
        this.worker = new Worker(new URL('./clangd.worker.ts', import.meta.url), {
            type: 'module',
            name: 'clangd',
        })
        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.resolveReady = resolve
            this.rejectReady = reject
        })
        // Attach a no-op catch so a rejection that nobody awaited
        // (e.g. the consumer disposed before ever calling .ready()) doesn't
        // surface as an unhandled-rejection warning. Real consumers still
        // see the rejection via their own .then/await chain.
        this.readyPromise.catch(() => {})
        this.worker.addEventListener('message', this.handleMessage)
        this.worker.addEventListener('error', this.handleError)
    }

    /** Resolves once clangd has booted and finished its first roundtrip. */
    ready(): Promise<void> {
        return this.readyPromise
    }

    /** Most recent status reported by the worker; never null. */
    getStatus(): ClangdStatus {
        return this.status
    }

    /**
     * Send a request and await the response.
     *
     * Pass `signal` (e.g. one derived from Monaco's CancellationToken) and
     * we'll both reject the local promise *and* send `$/cancelRequest` to
     * clangd so it stops working on the stale request. C++ semantic
     * analysis is the most expensive thing in this pipeline; without this,
     * fast typing stacks up cancelled completion requests that clangd
     * still happily computes.
     */
    request<T = LspParams>(method: string, params?: LspParams, signal?: AbortSignal): Promise<T> {
        if (this.disposed) return Promise.reject(new Error('clangd disposed'))
        if (signal?.aborted) return Promise.reject(new Error('cancelled'))
        const id = this.nextRequestId++
        const req: LspRequest = { jsonrpc: '2.0', id, method, params }
        const promise = new Promise<LspParams>((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
        })
        // Attach a no-op catch so a synchronous abort (or any rejection
        // that fires before the consumer attaches a handler) doesn't
        // surface as an unhandled rejection. The consumer still sees the
        // rejection via their own then/await chain — `.catch` returns a
        // new promise, the original `promise` is unaffected.
        promise.catch(() => {})
        if (signal) {
            const onAbort = () => this.cancel(id)
            signal.addEventListener('abort', onAbort, { once: true })
            // `.finally` returns a *new* chained promise that also rejects
            // when the original does. Without its own catch, that chained
            // rejection is unhandled.
            promise.finally(() => signal.removeEventListener('abort', onAbort)).catch(() => {})
        }
        this.post({ type: 'lsp', message: req })
        return promise as Promise<T>
    }

    /** Send a notification — fire and forget, no response expected. */
    notify(method: string, params?: LspParams): void {
        if (this.disposed) return
        const notif: LspNotification = { jsonrpc: '2.0', method, params }
        this.post({ type: 'lsp', message: notif })
    }

    /** Subscribe to a server-initiated notification (e.g. publishDiagnostics). */
    on(method: string, handler: NotificationHandler): () => void {
        let set = this.notifHandlers.get(method)
        if (!set) {
            set = new Set()
            this.notifHandlers.set(method, set)
        }
        set.add(handler)
        return () => {
            const s = this.notifHandlers.get(method)
            if (!s) return
            s.delete(handler)
            if (s.size === 0) this.notifHandlers.delete(method)
        }
    }

    /** Bulk-write workspace files into clangd's FS (used at boot + on rename). */
    writeFiles(files: Record<string, string>): void {
        if (this.disposed) return
        this.post({ type: 'fs:writeAll', files })
    }

    writeFile(path: string, content: string): void {
        if (this.disposed) return
        this.post({ type: 'fs:write', path, content })
    }

    deleteFile(path: string): void {
        if (this.disposed) return
        this.post({ type: 'fs:delete', path })
    }

    /**
     * Cancel an in-flight request. The pending promise rejects locally and
     * we tell clangd to stop working on it (LSP $/cancelRequest). Useful
     * when Monaco's CancellationToken fires.
     */
    cancel(id: number | string): void {
        if (this.disposed) return
        const resolver = this.pending.get(id)
        if (!resolver) return
        this.pending.delete(id)
        // Notify clangd first; the resolver rejection might run handlers
        // that could otherwise send fresh requests we'd want clangd to see
        // *after* the cancel.
        this.post({
            type: 'lsp',
            message: { jsonrpc: '2.0', method: '$/cancelRequest', params: { id } },
        })
        // If no consumer has attached a rejection handler yet (e.g. a
        // synchronous abort that hasn't reached the awaiter), the
        // rejection would surface as unhandled. The Promise created in
        // request() already has a no-op catch attached for the same
        // reason.
        resolver.reject(new Error('cancelled'))
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.worker.removeEventListener('message', this.handleMessage)
        this.worker.removeEventListener('error', this.handleError)
        this.worker.terminate()
        // Reject the boot promise so any `await client.ready()` in flight
        // (e.g. component unmounting during the 120 MB wasm download)
        // unblocks instead of hanging forever.
        if (this.status.state === 'starting') {
            this.rejectReady(new Error('clangd disposed'))
        }
        this.rejectAllPending('clangd disposed')
        this.notifHandlers.clear()
        this.setStatus({ state: 'disposed' })
    }

    private rejectAllPending(message: string): void {
        for (const { reject } of this.pending.values()) {
            reject(new Error(message))
        }
        this.pending.clear()
    }

    private post(msg: ClientToWorker) {
        this.worker.postMessage(msg)
    }

    private setStatus(next: ClangdStatus) {
        this.status = next
        this.onStatus.emit(next)
    }

    private handleMessage = (e: MessageEvent<WorkerToClient>) => {
        const msg = e.data
        switch (msg.type) {
            case 'ready': {
                this.setStatus({ state: 'ready' })
                this.resolveReady()
                break
            }
            case 'progress': {
                this.setStatus({ state: 'starting', loaded: msg.loaded, total: msg.total })
                break
            }
            case 'lsp': {
                this.dispatchLsp(msg.message)
                break
            }
            case 'error': {
                const err = new Error(msg.message)
                if (this.status.state === 'starting') this.rejectReady(err)
                this.setStatus({ state: 'error', message: msg.message })
                // Anything waiting on a request can't get an answer now.
                // Without this they pend forever and the UI sits silent.
                this.rejectAllPending(msg.message)
                console.error('[clangd]', msg.message)
                break
            }
        }
    }

    private handleError = (e: ErrorEvent) => {
        const message = e.message || 'unknown worker error'
        const err = new Error(message)
        if (this.status.state === 'starting') this.rejectReady(err)
        this.setStatus({ state: 'error', message })
        console.error('[clangd] worker error', e)
    }

    private dispatchLsp(message: LspMessage) {
        if ('id' in message && ('result' in message || 'error' in message)) {
            const res = message as LspResponse
            const resolver = this.pending.get(res.id)
            if (!resolver) return
            this.pending.delete(res.id)
            if (res.error) {
                resolver.reject(new Error(`${res.error.code}: ${res.error.message}`))
            } else {
                resolver.resolve(res.result)
            }
            return
        }

        // Server-initiated request (has id + method, no result/error). Per
        // LSP spec we must respond so clangd's outgoing promise settles —
        // ignoring leaves background tasks like `window/workDoneProgress/
        // create` and `client/registerCapability` hanging on the server.
        if ('id' in message && 'method' in message) {
            this.post({
                type: 'lsp',
                message: {
                    jsonrpc: '2.0',
                    id: (message as LspRequest).id,
                    error: {
                        code: -32601, // MethodNotFound
                        message: `nova does not implement ${(message as LspRequest).method}`,
                    },
                } as LspResponse,
            })
            return
        }

        // Plain notification.
        const notif = message as LspNotification
        if (!notif.method) return
        const handlers = this.notifHandlers.get(notif.method)
        if (!handlers) return
        for (const h of handlers) {
            try {
                h(notif.params)
            } catch (err) {
                console.warn('[clangd] notification handler threw', notif.method, err)
            }
        }
    }
}
