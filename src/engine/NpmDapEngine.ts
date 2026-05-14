import { EventEmitter } from '@/lib/event-emitter';
import { Engine, type Lang } from 'debugger-sh';
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

    // One Engine for the lifetime of this NpmDapEngine. Engine.create
    // allocates a Rust DapAdapter on the main thread's WASM heap, which
    // holds a fresh DebugInfo (DWARF tree, function layouts, locations)
    // per debug session — easily 50-100 MB. wasm-bindgen only reclaims
    // that Rust state via FinalizationRegistry, and on Safari that fires
    // unreliably, so creating a new Engine per run() accumulated tens of
    // dropped-but-unfreed DapAdapters and pushed the tab to multiple GB.
    // Reusing the Engine reuses the DapAdapter; each new debug session
    // replaces the prior DebugInfo via Rust's Drop, capping main-thread
    // WASM heap at one session's footprint.
    private engine: Engine | null = null;
    private engineInit: Promise<Engine> | null = null;
    // Tracks the in-flight `engine.run()` promise. Since we reuse one Engine
    // across runs, a fresh run() must wait for any prior run's promise to
    // settle — Engine.run() short-circuits to the stale promise if its
    // internal `this.promise` field is still set.
    private currentRun: Promise<unknown> | null = null;
    private dapSeq = 1;
    private activeBreakpoints: Record<string, number[]> = {};
    private running = false;
    private fileMap: Record<string, string> = {};
    private inputBuf = '';
    private currentIsDebug = false;

    async compile(files: Record<string, string>, _isDebug: boolean): Promise<CompileResult> {
        this.onClearTerminal.emit();
        this.onStdout.emit(`\x1b[1;34mInitializing debugger execution environment...\x1b[0m\r\n`);

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
        if (!this.engine) return null;
        try {
            const res = this.engine.debugger.send({
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

    private async ensureEngine(): Promise<Engine> {
        if (this.engine) return this.engine;
        if (!this.engineInit) {
            this.engineInit = Engine.create('c' as Lang).then((engine) => {
                this.attachListeners(engine);
                this.engine = engine;
                return engine;
            });
        }
        return this.engineInit;
    }

    // Bound once when the Engine is first created, then driven by
    // `currentIsDebug` so subsequent runs don't need to re-subscribe
    // (which would duplicate listeners on the shared EventEmitter).
    private attachListeners(engine: Engine) {
        const decoder = new TextDecoder();
        engine.stdout.on('data', (chunk: Uint8Array) => {
            this.onStdout.emit(decoder.decode(chunk).replace(/\r?\n/g, '\r\n'));
        });
        engine.stderr.on('data', (chunk: Uint8Array) => {
            this.onStderr.emit(`\x1b[31m${decoder.decode(chunk).replace(/\r?\n/g, '\r\n')}\x1b[0m`);
        });
        const dbg = engine.debugger as unknown as {
            on(event: 'event', listener: (msg: unknown) => void): void;
        };
        dbg.on('event', (msg: unknown) => {
            const m = msg as DapEvent | null;
            if (m?.type !== 'event') return;

            switch (m.event) {
                case 'initialized':
                    this.configureDebugger(this.currentIsDebug);
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
    }

    async run(isDebug: boolean): Promise<void> {
        // Cancel any in-flight run on the shared engine, then await its
        // settlement so Engine.run() doesn't short-circuit to the stale
        // promise on its next call.
        if (this.currentRun && this.engine) {
            try { this.engine.stop(); } catch { /* ignore */ }
            try { await this.currentRun; } catch { /* ignore */ }
        }

        let engine: Engine;
        try {
            engine = await this.ensureEngine();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.onStderr.emit(`\x1b[31mFailed to create engine: ${msg}\x1b[0m\r\n`);
            this.onExit.emit(1);
            return;
        }

        engine.fs = this.fileMap;
        engine.debugger.enabled = isDebug;
        this.currentIsDebug = isDebug;
        this.running = true;
        this.dapSeq = 1;
        this.inputBuf = '';

        this.dapSend('initialize', {
            clientID: 'nova-ide',
            clientName: 'Nova Web IDE',
            adapterID: 'cpp',
            linesStartAt1: true,
            columnsStartAt1: true,
            supportsVariableType: true,
        });

        const runPromise = engine.run();
        this.currentRun = runPromise;
        try {
            const result = await runPromise;
            if (result.type === 'completed') {
                this.running = false;
                this.onExit.emit(result.exitCode);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.onStderr.emit(`\x1b[31mRuntime error: ${msg}\x1b[0m\r\n`);
        } finally {
            if (this.currentRun === runPromise) this.currentRun = null;
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

        const stackAddrs = new Set<number>();
        const heapQueue: { ptr: number; typeStr: string; variablesReference: number; valueStr?: string }[] = [];
        const visitedRefs = new Set<number>();

        const parseAddr = (v: Any) => this.parseHexAddress(v.memoryReference);

        const processVariable = (v: Any, isHeap: boolean): VariableNode => {
            const addr = parseAddr(v);
            const typeStr: string = v.type ?? '';
            // Match pointer logic including references
            const isPointer = typeStr.includes('*') || typeStr.includes('&');
            const variablesReference = v.variablesReference ?? 0;
            const hasChildren = variablesReference > 0;

            if (!isHeap && addr > 0) {
                stackAddrs.add(addr);
            }

            let members: VariableNode[] | undefined;
            let pointsTo: number | undefined;

            if (isPointer) {
                if (hasChildren) {
                    // The engine returns the pointer's own storage address in `value`,
                    // not the target. Dereference through children to get the actual target.
                    const varsRes = this.dapSend('variables', { variablesReference });
                    const dapVars: Any[] = varsRes?.body?.variables ?? [];
                    if (dapVars.length > 0) {
                        pointsTo = parseAddr(dapVars[0]);
                    }

                    if (pointsTo && pointsTo > 0 && !visitedRefs.has(variablesReference)) {
                        visitedRefs.add(variablesReference);
                        heapQueue.push({
                            ptr: pointsTo,
                            typeStr: typeStr.replace(/[\*&]\s*$/, '').trim() || 'unknown',
                            variablesReference,
                            valueStr: v.value ?? ''
                        });
                    }
                }
            } else if (hasChildren && !visitedRefs.has(variablesReference)) {
                visitedRefs.add(variablesReference);
                const varsRes = this.dapSend('variables', { variablesReference });
                const dapVars: Any[] = varsRes?.body?.variables ?? [];
                members = dapVars.map((child) => processVariable(child, isHeap));
            }

            // For pointers `v.value` is the variable's own storage address (debugger-sh
            // deviation from DAP), so never display it — fall back to 0x0 when we can't
            // dereference through children (NULL or undereferenceable).
            let displayValue = String(v.value ?? '');
            if (isPointer) {
                displayValue = pointsTo && pointsTo > 0 ? `0x${pointsTo.toString(16)}` : '0x0';
            }

            return {
                name: v.name ?? '',
                type: typeStr,
                value: displayValue,
                rawValue: pointsTo ?? addr,
                address: addr,
                size: 4,
                isPointer,
                pointsTo,
                pointeeType: isPointer ? typeStr.replace(/[\*&]\s*$/, '').trim() : typeStr,
                isStruct: !isPointer && hasChildren,
                members,
            };
        };

        // Phase 1: Walk stack synchronously and gather actual memory footprints
        for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            const scopesRes = this.dapSend('scopes', { frameId: f.id });
            const variables: VariableNode[] = [];

            for (const scope of scopesRes?.body?.scopes ?? []) {
                const varsRes = this.dapSend('variables', { variablesReference: scope.variablesReference });
                for (const v of varsRes?.body?.variables ?? []) {
                    variables.push(processVariable(v, false));
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

        // Phase 2: Walk the dynamic pointer relationships to generate objects!

        // debugger-sh's wasm runtime lays memory out as: null page / data (low)
        // → stack → heap (high). Anything at or below the highest stack-resident
        // variable cannot be a heap allocation — it's a wild/uninit pointer that
        // the DAP engine cheerfully dereferenced. Without a malloc tracker this
        // is the cleanest signal we have for separating real allocations from
        // garbage (e.g. uninit `Node*` reading bytes that decode as 0xfffc8).
        const stackCeiling = Math.max(...stackAddrs);
        const isAboveStack = (addr: number) => addr > stackCeiling;

        let heapNodeCount = 0;
        const MAX_HEAP_NODES = 200;

        while (heapQueue.length > 0 && heapNodeCount < MAX_HEAP_NODES) {
            const item = heapQueue.shift()!;

            if (!isAboveStack(item.ptr)) continue;
            if (heapAllocations.has(item.ptr)) continue;

            heapNodeCount++;

            const varsRes = this.dapSend('variables', { variablesReference: item.variablesReference });
            let dapVars: Any[] = varsRes?.body?.variables ?? [];

            // Some DAP implementations return a single element named "*varname" when requesting variables of a pointer.
            // In this case we unwrap it so the properties are top-level on the heap node.
            if (dapVars.length === 1 && (dapVars[0].name?.startsWith('*') || (item.valueStr && item.valueStr.includes(dapVars[0].value)))) {
                const derefVar = dapVars[0];
                if (derefVar.variablesReference > 0) {
                    const innerRes = this.dapSend('variables', { variablesReference: derefVar.variablesReference });
                    if (innerRes?.body?.variables) {
                        dapVars = innerRes.body.variables;
                    }
                }
            }

            const members = dapVars.map((child: Any) => processVariable(child, true));

            heapAllocations.set(item.ptr, {
                ptr: item.ptr,
                size: 4,
                typeName: item.typeStr,
                label: `0x${item.ptr.toString(16).padStart(6, '0')}`,
                members,
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

    private parseHexAddress(ref: unknown): number {
        if (typeof ref !== 'string' || ref.length === 0) return 0;
        // Allows graceful extraction of pointers embedded in DAP display texts
        const match = ref.match(/0x[0-9a-fA-F]+/);
        if (match) {
            const n = Number(match[0]);
            return Number.isFinite(n) ? n : 0;
        }
        const n = Number(ref);
        return Number.isFinite(n) ? n : 0;
    }

    async setBreakpoints(file: string, lines: number[]): Promise<void> {
        this.activeBreakpoints[file] = lines;
        if (this.engine && this.running) {
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

    async stepOut(): Promise<void> {
        this.onDebugResumed.emit();
        this.dapSend('stepOut', { threadId: 1 });
    }

    async continueExecution(): Promise<void> {
        this.onDebugResumed.emit();
        this.dapSend('continue', { threadId: 1 });
    }

    stop(): void {
        // Stop the in-flight run but keep the Engine so the next run() reuses
        // the same Rust DapAdapter instead of allocating a new one.
        if (this.engine) {
            try { this.engine.stop(); } catch { /* ignore */ }
        }
        if (this.running) {
            this.running = false;
            this.onExit.emit(0);
        }
    }

    // Line-buffered stdin. Mirrors debugger.sh upstream behavior so programs that
    // use `cin >> x` / `scanf` / read-until-EOF loops behave the same as in the
    // reference IDE. Special key conventions:
    //   ^C  → terminate the running program
    //   ^D  → flush EOF marker (so `while (cin >> x)` exits)
    //   ^L  → clear the visible terminal (buffer preserved-cleared)
    //   ⏎   → flush buffered line + '\n' to the program's stdin
    //   ⌫   → erase last char in buffer + visible echo
    //   esc → swallow CSI sequences (arrow keys etc.) so they don't enter the buffer
    writeStdin(data: string): void {
        // Engine is now long-lived, so gate on `running` to reject stdin between runs.
        if (!this.engine || !this.running) return;
        if (data === '\x03') {
            this.onStdout.emit('^C\r\n');
            this.stop();
            return;
        }
        if (data === '\x04') {
            this.onStdout.emit('^D\r\n');
            this.engine.stdin.write('\x04');
            this.inputBuf = '';
            return;
        }
        if (data === '\x0c') {
            this.onClearTerminal.emit();
            this.inputBuf = '';
            return;
        }
        if (data === '\r') {
            this.onStdout.emit('\r\n');
            this.engine.stdin.write(this.inputBuf + '\n');
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
        if (data.startsWith('\x1b')) return; // arrow keys, function keys, etc.
        if (data >= ' ') {
            this.inputBuf += data;
            this.onStdout.emit(data);
        }
    }
}