// ── NpmDapEngine ───────────────────────────────────────────────────
// Drives the @jtrb/runtime WASM C/C++ runtime via standard DAP messages.
// Replaces the in-house compiler/executor/DWARF stack with a single
// library call that does all of compile + execute + debug.
//
// Heap visualization is reconstructed by walking pointer values returned
// from DAP `variables` requests, since the runtime does not expose a
// global allocation list (yet — we have requested this from the team).

import { EventEmitter } from '@/lib/event-emitter';
import { Runtime, type Lang } from '@jtrb/runtime';
import type {
    IIDEEngine,
    CompileResult,
    DebugPauseState,
    DrawCommand,
    VariableNode,
    StackFrame,
    HeapAllocation,
} from './IIDEEngine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface DapResponse {
    type?: string;
    success?: boolean;
    body?: Any;
}

interface DapEvent {
    type?: string;
    event?: string;
    body?: Any;
}

export class NpmDapEngine implements IIDEEngine {
    public readonly onStdout = new EventEmitter<string>();
    public readonly onStderr = new EventEmitter<string>();
    public readonly onClearTerminal = new EventEmitter<void>();
    public readonly onCanvasDraw = new EventEmitter<DrawCommand[]>();
    public readonly onDebugPaused = new EventEmitter<DebugPauseState>();
    public readonly onDebugResumed = new EventEmitter<void>();
    public readonly onExit = new EventEmitter<number>();

    private rt: Runtime | null = null;
    private dapSeq = 1;
    private abortController: AbortController | null = null;
    private activeBreakpoints: Record<string, number[]> = {};
    private running = false;
    private fileMap: Record<string, string> = {};

    private encoder = new TextEncoder();
    private inputBuf = '';

    async compile(files: Record<string, string>, _isDebug: boolean): Promise<CompileResult> {
        void _isDebug;
        this.onClearTerminal.emit();
        this.onStdout.emit(`\x1b[1;34m[Nova] Initializing @jtrb/runtime execution environment...\x1b[0m\r\n`);

        // The runtime sees a flat virtual filesystem. Strip our /workspace and
        // /sysroot prefixes so files appear at the runtime root (e.g. main.cpp).
        this.fileMap = {};
        for (const [path, content] of Object.entries(files)) {
            let mappedPath = path;
            if (path.startsWith('/workspace/')) mappedPath = path.replace(/^\/workspace\//, '');
            else if (path.startsWith('/sysroot/')) mappedPath = path.replace(/^\/sysroot\//, '');
            else if (path.startsWith('/')) mappedPath = path.slice(1);
            this.fileMap[mappedPath] = content;
        }

        return { success: true, errors: [] };
    }

    private dapSend(command: string, args: Record<string, unknown> = {}): DapResponse | null {
        if (!this.rt) return null;
        try {
            const res = this.rt.debugger.send({
                type: 'request',
                seq: this.dapSeq++,
                command,
                arguments: args,
            });
            return res as DapResponse;
        } catch (e) {
            console.error(`[NpmDapEngine] DAP send failed (${command}):`, e);
            return null;
        }
    }

    async run(_isDebug: boolean): Promise<void> {
        if (this.rt) this.stop();
        const isDebug = _isDebug;

        // Try 'c++' (per team guidance); fall back to 'c' if the runtime rejects it.
        try {
            this.rt = await Runtime.create('c++' as Lang);
            this.rt.fs = this.fileMap;
        } catch (cppErr) {
            console.warn(`[NpmDapEngine] 'c++' rejected, falling back to 'c':`, cppErr);
            this.onStderr.emit(`\x1b[33m'c++' rejected by runtime, falling back to 'c'...\x1b[0m\r\n`);
            try {
                this.rt = await Runtime.create('c');
                this.rt.fs = this.fileMap;
            } catch (cErr) {
                const msg = cErr instanceof Error ? cErr.message : String(cErr);
                this.onStderr.emit(`\x1b[31mFailed to create runtime: ${msg}\x1b[0m\r\n`);
                this.onExit.emit(1);
                return;
            }
        }

        this.running = true;
        this.dapSeq = 1;
        this.abortController = new AbortController();
        this.inputBuf = '';

        const { signal } = this.abortController;
        const decoder = new TextDecoder();

        this.rt.stdout
            .pipeTo(
                new WritableStream<Uint8Array>({
                    write: (chunk) => this.onStdout.emit(decoder.decode(chunk).replace(/\r?\n/g, '\r\n')),
                }),
                { signal },
            )
            .catch(() => {});

        this.rt.stderr
            .pipeTo(
                new WritableStream<Uint8Array>({
                    write: (chunk) =>
                        this.onStderr.emit(`\x1b[31m${decoder.decode(chunk).replace(/\r?\n/g, '\r\n')}\x1b[0m`),
                }),
                { signal },
            )
            .catch(() => {});

        // The runtime's Debugger extends a Node-style EventEmitter. The published
        // .d.ts doesn't expose `on` cleanly under `verbatimModuleSyntax`, so cast.
        const dbg = this.rt.debugger as unknown as {
            on(event: 'event', listener: (msg: unknown) => void): void;
        };
        dbg.on('event', (msg: unknown) => {
            const m = msg as DapEvent | null;
            if (m?.type !== 'event') return;
            switch (m.event) {
                case 'initialized':
                    this.configureDebugger(isDebug);
                    break;
                case 'stopped':
                    this.handleStopped(m.body);
                    break;
                case 'continued':
                    this.onDebugResumed.emit();
                    break;
                case 'output':
                    if (m.body?.output) {
                        const out = String(m.body.output).replace(/\r?\n/g, '\r\n');
                        if (m.body.category === 'stderr') this.onStderr.emit(`\x1b[31m${out}\x1b[0m`);
                        else this.onStdout.emit(out);
                    }
                    break;
            }
        });

        this.dapSend('initialize', {
            clientID: 'nova-ide',
            clientName: 'Nova Web IDE',
            adapterID: 'cpp',
            linesStartAt1: true,
            columnsStartAt1: true,
            supportsVariableType: true,
        });

        try {
            await this.rt.run();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.onStderr.emit(`\x1b[31mRuntime error: ${msg}\x1b[0m\r\n`);
        } finally {
            this.abortController?.abort();
            this.rt = null;
            if (this.running) {
                this.running = false;
                this.onExit.emit(0);
            }
        }
    }

    private configureDebugger(isDebug: boolean) {
        if (isDebug) {
            const filesWithBps = Object.keys(this.activeBreakpoints).filter(
                (f) => this.activeBreakpoints[f].length > 0,
            );
            if (filesWithBps.length > 0) {
                for (const file of filesWithBps) {
                    const lines = this.activeBreakpoints[file];
                    const path = this.toRuntimePath(file);
                    this.dapSend('setBreakpoints', {
                        source: { path },
                        breakpoints: lines.map((l) => ({ line: l })),
                    });
                }
            } else {
                // Send a stub against /main.cpp so the handshake is satisfied.
                this.dapSend('setBreakpoints', { source: { path: '/main.cpp' }, breakpoints: [] });
            }
        } else {
            this.dapSend('setBreakpoints', { source: { path: '/main.cpp' }, breakpoints: [] });
        }

        this.dapSend('setExceptionBreakpoints', { filters: [] });
        this.dapSend('configurationDone', {});
    }

    private toRuntimePath(file: string): string {
        let path = file;
        if (path.startsWith('/workspace/')) path = '/' + path.substring('/workspace/'.length);
        else if (!path.startsWith('/')) path = '/' + path;
        return path;
    }

    private handleStopped(body: Any) {
        const threadId = body?.threadId ?? 1;
        const stackRes = this.dapSend('stackTrace', { threadId });
        const frames: Any[] = stackRes?.body?.stackFrames ?? [];

        const callStack: StackFrame[] = [];
        const heapAllocations = new Map<number, HeapAllocation>();
        const visitedVars = new Set<number>();

        for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            const scopesRes = this.dapSend('scopes', { frameId: f.id });
            const variables: VariableNode[] = [];

            const scopes: Any[] = scopesRes?.body?.scopes ?? [];
            for (const scope of scopes) {
                const varsRes = this.dapSend('variables', { variablesReference: scope.variablesReference });
                const dapVars: Any[] = varsRes?.body?.variables ?? [];
                for (const v of dapVars) {
                    variables.push(this.mapDapVariable(v, 0, visitedVars, heapAllocations));
                }
            }

            callStack.push({
                id: String(f.id),
                funcName: f.name ?? 'unknown',
                line: f.line ?? 0,
                sp: 0,
                variables,
                isActive: i === 0,
            });
        }

        const topFrame = callStack[0];
        let file: string | null = frames[0]?.source?.path ?? null;
        if (file && !file.startsWith('/workspace/')) {
            file = file.startsWith('/') ? `/workspace${file}` : `/workspace/${file}`;
        }

        this.onDebugPaused.emit({
            line: topFrame?.line ?? null,
            func: topFrame?.funcName ?? null,
            file,
            callStack,
            memorySnapshot: {
                frames: callStack,
                heapAllocations: Array.from(heapAllocations.values()),
            },
            nextKnownTypes: {},
        });
    }

    private mapDapVariable(
        v: Any,
        depth: number,
        visited: Set<number>,
        heapAllocations: Map<number, HeapAllocation>,
    ): VariableNode {
        const isStruct = (v.variablesReference ?? 0) > 0;
        let members: VariableNode[] | undefined = undefined;

        const memoryReference = this.parseHexAddress(v.memoryReference);
        const typeStr: string = v.type ?? '';
        const isPointer = typeStr.includes('*');

        // DAP pointer values often look like "0x1234 \"hello\"" or just "0x1234".
        // Pull the leading 0x token out.
        let rawValue = 0;
        if (isPointer && typeof v.value === 'string') {
            const m = /^0x[0-9a-fA-F]+/.exec(v.value.trim());
            if (m) rawValue = Number(m[0]);
        } else if (isPointer && typeof v.value === 'number') {
            rawValue = v.value;
        }

        const pointsTo = isPointer && rawValue > 0 ? rawValue : undefined;

        // Recurse through children with cycle detection + depth cap.
        if (isStruct && !visited.has(v.variablesReference)) {
            visited.add(v.variablesReference);
            if (depth < 3) {
                const varsRes = this.dapSend('variables', { variablesReference: v.variablesReference });
                const dapVars: Any[] = varsRes?.body?.variables ?? [];
                members = dapVars.map((child) => this.mapDapVariable(child, depth + 1, visited, heapAllocations));
            }
        }

        // Heap discovery: any pointer that resolves to children becomes a heap node.
        if (isPointer && pointsTo && pointsTo > 0 && !heapAllocations.has(pointsTo)) {
            const pointeeMembers = isStruct && members ? members : [];
            heapAllocations.set(pointsTo, {
                ptr: pointsTo,
                size: 4,
                typeName: typeStr.replace(/\*$/, '').trim() || 'unknown',
                label: `0x${pointsTo.toString(16).padStart(6, '0')}`,
                members: pointeeMembers,
            });
        }

        return {
            name: v.name ?? '',
            type: typeStr,
            value: v.value ?? '',
            rawValue: rawValue || memoryReference,
            address: memoryReference,
            size: 4,
            isPointer,
            pointsTo,
            pointeeType: isPointer ? typeStr.replace(/\*$/, '').trim() : typeStr,
            isStruct,
            members,
        };
    }

    private parseHexAddress(ref: unknown): number {
        if (typeof ref !== 'string' || ref.length === 0) return 0;
        const n = Number(ref); // handles "0x1234" natively
        return Number.isFinite(n) ? n : 0;
    }

    async setBreakpoints(file: string, lines: number[]): Promise<void> {
        this.activeBreakpoints[file] = lines;
        if (this.rt && this.running) {
            this.dapSend('setBreakpoints', {
                source: { path: this.toRuntimePath(file) },
                breakpoints: lines.map((l) => ({ line: l })),
            });
        }
    }

    async stepInto(): Promise<void> {
        this.onDebugResumed.emit();
        this.dapSend('stepIn', { threadId: 1 });
    }

    async stepOver(): Promise<void> {
        this.onDebugResumed.emit();
        this.dapSend('next', { threadId: 1 });
    }

    async continueExecution(): Promise<void> {
        this.onDebugResumed.emit();
        this.dapSend('continue', { threadId: 1 });
    }

    stop(): void {
        this.abortController?.abort();
        if (this.rt) {
            try {
                this.rt.stop();
            } catch {
                /* ignore */
            }
            this.rt = null;
        }
        if (this.running) {
            this.running = false;
            this.onExit.emit(0);
        }
    }

    writeStdin(data: string): void {
        if (!this.rt) return;

        if (data === '\x03') {
            // Ctrl+C
            this.onStdout.emit('^C\r\n');
            this.stop();
            return;
        }

        if (data === '\r') {
            this.onStdout.emit('\r\n');
            const w = this.rt.stdin.getWriter();
            w.write(this.encoder.encode(this.inputBuf + '\n'));
            w.releaseLock();
            this.inputBuf = '';
            return;
        }

        if (data === '\x7f') {
            if (this.inputBuf.length > 0) {
                this.inputBuf = this.inputBuf.slice(0, -1);
                this.onStdout.emit('\b \b');
            }
            return;
        }

        if (data >= ' ') {
            this.inputBuf += data;
            this.onStdout.emit(data);
        }
    }
}
