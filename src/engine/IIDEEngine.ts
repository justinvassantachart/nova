import { EventEmitter } from '@/lib/event-emitter';

export interface CompileResult {
    success: boolean;
    errors: string[];
}

// --- DAP-Aligned Debug Interfaces ---
export interface VariableNode {
    name: string; type: string; value: string | number; rawValue: number;
    address: number; size: number;
    isPointer: boolean; pointsTo?: number; pointeeType?: string;
    isStruct?: boolean; members?: VariableNode[];
}

export interface HeapAllocation {
    ptr: number; size: number; typeName: string; label: string;
    members: VariableNode[];
}

export interface StackFrame {
    id: string; funcName: string; line: number; sp: number;
    variables: VariableNode[]; isActive: boolean;
}

export interface MemorySnapshot {
    frames: StackFrame[];
    heapAllocations: HeapAllocation[];
}

export interface DebugPauseState {
    line: number | null;
    func: string | null;
    file: string | null;
    callStack: StackFrame[];
    memorySnapshot: MemorySnapshot | null;
}

export type DrawCommand =
    | { type: 'CLEAR' }
    | { type: 'CIRCLE'; x: number; y: number; r: number; color: string }
    | { type: 'RECT'; x: number; y: number; w: number; h: number; color: string };

export interface IIDEEngine {
    // Lifecycle
    compile(files: Record<string, string>, isDebug: boolean): Promise<CompileResult>;
    run(isDebug: boolean): Promise<void>;
    stop(): void;

    // DAP-aligned Debugging Controls
    setBreakpoints(file: string, lines: number[]): Promise<void>;
    stepInto(): Promise<void>;
    stepOver(): Promise<void>; // Note: The DAP protocol formally calls this "next"
    continueExecution(): Promise<void>;

    // Event Subscriptions (Pub/Sub Pattern)
    readonly onStdout: EventEmitter<string>;
    readonly onStderr: EventEmitter<string>;
    readonly onClearTerminal: EventEmitter<void>;
    readonly onCanvasDraw: EventEmitter<DrawCommand[]>;
    readonly onDebugPaused: EventEmitter<DebugPauseState>;
    readonly onDebugResumed: EventEmitter<void>;
    readonly onExit: EventEmitter<number>;
}
