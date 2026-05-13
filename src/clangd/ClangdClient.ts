// Thin main-thread wrapper around the clangd worker. Hides worker lifecycle
// and turns the fire-and-forget LSP message bus into a request/response API
// + a notification subscription model.

import { EventEmitter } from '@/lib/event-emitter'
import type {
    ClientToWorker,
    Json,
    LspMessage,
    LspNotification,
    LspRequest,
    LspResponse,
    WorkerToClient,
} from './lsp-types'

type NotificationHandler = (params: Json | undefined) => void

export type ClangdStatus =
    | { state: 'starting'; loaded: number; total: number }
    | { state: 'ready' }
    | { state: 'error'; message: string }
    | { state: 'disposed' }

type Resolver = {
    resolve: (value: Json | undefined) => void
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
     * Hot-path methods like `textDocument/completion` are racy by design — by
     * the time we get an answer, the user may have typed more. Callers should
     * use their own cancellation (e.g. Monaco's CancellationToken) rather
     * than relying on something here.
     */
    request<T = Json | undefined>(method: string, params?: Json): Promise<T> {
        if (this.disposed) return Promise.reject(new Error('clangd disposed'))
        const id = this.nextRequestId++
        const req: LspRequest = { jsonrpc: '2.0', id, method, params }
        const promise = new Promise<Json | undefined>((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
        })
        this.post({ type: 'lsp', message: req })
        return promise as Promise<T>
    }

    /** Send a notification — fire and forget, no response expected. */
    notify(method: string, params?: Json): void {
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
        this.post({ type: 'fs:writeAll', files })
    }

    writeFile(path: string, content: string): void {
        this.post({ type: 'fs:write', path, content })
    }

    deleteFile(path: string): void {
        this.post({ type: 'fs:delete', path })
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.worker.removeEventListener('message', this.handleMessage)
        this.worker.removeEventListener('error', this.handleError)
        this.worker.terminate()
        for (const { reject } of this.pending.values()) {
            reject(new Error('clangd disposed'))
        }
        this.pending.clear()
        this.notifHandlers.clear()
        this.setStatus({ state: 'disposed' })
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

        // Notification (or unsolicited request — clangd does emit
        // `window/workDoneProgress/create` etc. but we ignore those).
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
