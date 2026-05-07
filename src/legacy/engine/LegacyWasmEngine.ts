import { EventEmitter } from '@/lib/event-emitter';
import type { IIDEEngine, CompileResult, DebugPauseState, DrawCommand } from './IIDEEngine';
import { compile } from './compiler';
import { execute, stop, debugStepInto, debugStepOver, debugContinue, syncBreakpoints } from './executor';
import type { DwarfInfo } from './dwarf-types';

export class LegacyWasmEngine implements IIDEEngine {
    public readonly onStdout = new EventEmitter<string>();
    public readonly onStderr = new EventEmitter<string>();
    public readonly onClearTerminal = new EventEmitter<void>();
    public readonly onCanvasDraw = new EventEmitter<DrawCommand[]>();
    public readonly onDebugPaused = new EventEmitter<DebugPauseState>();
    public readonly onDebugResumed = new EventEmitter<void>();
    public readonly onExit = new EventEmitter<number>();

    // Internal State Hidden from UI
    private wasmBinary: Uint8Array | null = null;
    private dwarfInfo: DwarfInfo | null = null;
    private stepMap: Record<number, { line: number; func: string; file: string }> = {};
    private knownHeapTypes: Record<number, string> = {};
    private breakpoints: Record<string, number[]> = {};
    private currentDepth = 0;

    constructor() {
        this.onDebugPaused.subscribe((state) => { this.currentDepth = state.callStack.length; });
    }

    async compile(files: Record<string, string>, isDebug: boolean): Promise<CompileResult> {
        this.onClearTerminal.emit();
        this.onStdout.emit(`\x1b[1;33mCompiling in ${isDebug ? 'Debug' : 'Release'} mode...\x1b[0m\r\n`);
        
        const result = await compile(files, isDebug, {
            onProgress: (msg) => this.onStdout.emit(`\x1b[90m${msg}\x1b[0m\r\n`),
            onStderr: (msg) => this.onStderr.emit(msg),
        });
        
        if (result.success && result.wasmBinary) {
            this.wasmBinary = result.wasmBinary;
            this.dwarfInfo = result.dwarfInfo || null;
            this.stepMap = result.stepMap || {};
            this.onStdout.emit('\x1b[1;32mCompiled successfully.\x1b[0m\r\n\r\n');
            return { success: true, errors: [] };
        }
        
        this.onStderr.emit('\x1b[1;31mCompilation failed:\x1b[0m\r\n');
        result.errors.forEach(e => this.onStderr.emit(`  \x1b[31m${e}\x1b[0m\r\n`));
        return { success: false, errors: result.errors };
    }

    async run(isDebug: boolean): Promise<void> {
        if (!this.wasmBinary) return;
        this.onStdout.emit('\x1b[1;32mRunning...\x1b[0m\r\n');
        this.knownHeapTypes = {};
        this.currentDepth = 0;
        
        await execute({
            wasmBinary: this.wasmBinary,
            debugMode: isDebug,
            dwarfInfo: this.dwarfInfo,
            stepMap: this.stepMap,
            knownHeapTypes: this.knownHeapTypes,
            activeBreakpoints: this.breakpoints,
            onStdout: (text) => this.onStdout.emit(text),
            onStderr: (text) => this.onStderr.emit(text),
            onCanvasDraw: (queue) => this.onCanvasDraw.emit(queue),
            onExited: (code) => {
                this.onStdout.emit(`\r\n\x1b[90m  Program exited with code ${code ?? 0}  \x1b[0m\r\n`);
                this.onExit.emit(code);
            },
            onPaused: (state) => {
                this.knownHeapTypes = state.nextKnownTypes; // Internal tracking preservation
                this.onDebugPaused.emit({
                    line: state.line,
                    func: state.func,
                    file: state.file,
                    callStack: state.callStack,
                    memorySnapshot: state.memorySnapshot
                });
            }
        });
    }

    stop(): void { stop(); this.onExit.emit(0); }
    async setBreakpoints(file: string, lines: number[]): Promise<void> {
        this.breakpoints[file] = lines;
        syncBreakpoints(this.breakpoints, this.stepMap);
    }

    async stepInto(): Promise<void> { this.onDebugResumed.emit(); debugStepInto(); }
    async stepOver(): Promise<void> { this.onDebugResumed.emit(); debugStepOver(this.currentDepth); }
    async continueExecution(): Promise<void> { this.onDebugResumed.emit(); debugContinue(); }
}
