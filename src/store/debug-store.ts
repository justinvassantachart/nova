// ── Debug Store ────────────────────────────────────────────────────
// Zustand store for debugger state: DWARF data, pause/step control,
// breakpoints, current execution state, and step history for
// back/forward debugging.

import { create } from 'zustand'
import type { DwarfInfo } from '@/engine/dwarf-types'
import { EMPTY_DWARF } from '@/engine/dwarf-types'
import type { MemorySnapshot } from '@/lib/memory-reader'

export type DebugMode = 'idle' | 'compiling' | 'running' | 'paused'

export interface StackFrame { id: string; func: string; line: number; sp: number; frameSize: number }

/** Snapshot of one debug step — enough to fully restore the UI */
export interface DebugStepEntry {
    currentLine: number | null
    currentFunc: string | null
    callStack: StackFrame[]
    memorySnapshot: MemorySnapshot | null
    knownHeapTypes: Record<number, string>
    stackPointer: number
}

export interface DebugState {
    /** Parsed DWARF debug info from the last compilation */
    dwarfInfo: DwarfInfo

    /** Current debug mode */
    debugMode: DebugMode

    /** Currently paused source line number */
    currentLine: number | null

    /** Current function name (from stepMap) */
    currentFunc: string | null

    /** Step ID → (line, func) mapping from the asm-interceptor */
    stepMap: Record<number, { line: number; func: string }>

    /** User-set breakpoints (line numbers) */
    breakpoints: Set<number>

    /** The raw compiled WASM binary (with debug info) */
    wasmBinary: Uint8Array | null

    /** Cloned WASM memory buffer snapshot (taken while worker is paused) */
    memoryBuffer: ArrayBuffer | null

    /** Stack pointer value at pause time */
    stackPointer: number

    /** Live variable values extracted from WASM memory during pause */
    liveVariables: Record<string, { value: string | number; address?: number }>

    /** Call stack frames for recursion tracking */
    callStack: StackFrame[]

    /** Native heap array pointers for synchronous RAM reading */
    heapPointers: { countPtr: number; allocsPtr: number }

    /** Processed memory snapshot ready for UI */
    memorySnapshot: MemorySnapshot | null

    /** Known heap pointer→type map persisted across debug steps */
    knownHeapTypes: Record<number, string>

    /** Step history for back/forward debugging */
    stepHistory: DebugStepEntry[]

    /** Current position in step history (-1 = live / at latest step) */
    stepIndex: number

    /** Actions */
    setDwarfInfo: (info: DwarfInfo) => void
    setDebugMode: (mode: DebugMode) => void
    setCurrentLine: (line: number | null) => void
    setCurrentFunc: (func: string | null) => void
    setStepMap: (map: Record<number, { line: number; func: string }>) => void
    toggleBreakpoint: (line: number) => void
    setWasmBinary: (binary: Uint8Array | null) => void
    setMemoryBuffer: (buf: ArrayBuffer | null) => void
    setStackPointer: (sp: number) => void
    setLiveVariables: (vars: Record<string, { value: string | number; address?: number }>) => void
    setCallStack: (stack: StackFrame[]) => void
    setHeapPointers: (ptrs: { countPtr: number; allocsPtr: number }) => void
    setMemorySnapshot: (snapshot: MemorySnapshot | null) => void
    setKnownHeapTypes: (types: Record<number, string>) => void
    pushStep: (entry: DebugStepEntry) => void
    stepBack: () => void
    stepForward: () => void
    reset: () => void
}

export const useDebugStore = create<DebugState>((set, get) => ({
    dwarfInfo: EMPTY_DWARF,
    debugMode: 'idle',
    currentLine: null,
    currentFunc: null,
    stepMap: {},
    breakpoints: new Set(),
    wasmBinary: null,
    memoryBuffer: null,
    stackPointer: 0,
    liveVariables: {},
    callStack: [],
    heapPointers: { countPtr: 0, allocsPtr: 0 },
    memorySnapshot: null,
    knownHeapTypes: {},
    stepHistory: [],
    stepIndex: -1,

    setDwarfInfo: (info) => set({ dwarfInfo: info }),
    setDebugMode: (mode) => set({ debugMode: mode }),
    setCurrentLine: (line) => set({ currentLine: line }),
    setCurrentFunc: (func) => set({ currentFunc: func }),
    setStepMap: (map) => set({ stepMap: map }),

    toggleBreakpoint: (line) =>
        set((s) => {
            const next = new Set(s.breakpoints)
            if (next.has(line)) next.delete(line)
            else next.add(line)
            return { breakpoints: next }
        }),

    setWasmBinary: (binary) => set({ wasmBinary: binary }),
    setMemoryBuffer: (buf) => set({ memoryBuffer: buf }),
    setStackPointer: (sp) => set({ stackPointer: sp }),
    setLiveVariables: (vars) => set({ liveVariables: vars }),
    setCallStack: (stack) => set({ callStack: stack }),
    setHeapPointers: (ptrs) => set({ heapPointers: ptrs }),
    setMemorySnapshot: (snapshot) => set({ memorySnapshot: snapshot }),
    setKnownHeapTypes: (types) => set({ knownHeapTypes: types }),

    pushStep: (entry) => {
        const s = get()
        // If we stepped back and are now getting a new live step,
        // truncate forward history (undo/redo semantics)
        const history = s.stepIndex >= 0
            ? s.stepHistory.slice(0, s.stepIndex + 1)
            : [...s.stepHistory]
        history.push(entry)
        set({ stepHistory: history, stepIndex: -1 })
    },

    stepBack: () => {
        const s = get()
        if (s.stepHistory.length < 2 && s.stepIndex < 0) return
        if (s.stepHistory.length === 0) return
        console.log(s.stepHistory)
        console.log(s.stepIndex)
        // If at live edge (-1), the last entry IS the current state,
        // so go to second-to-last to actually show a different step
        const newIndex = s.stepIndex < 0
            ? s.stepHistory.length - 2
            : Math.max(0, s.stepIndex - 1)
        if (newIndex < 0) return
        const entry = s.stepHistory[newIndex]
        set({
            stepIndex: newIndex,
            currentLine: entry.currentLine,
            currentFunc: entry.currentFunc,
            callStack: entry.callStack,
            memorySnapshot: entry.memorySnapshot,
            knownHeapTypes: entry.knownHeapTypes,
            stackPointer: entry.stackPointer,
        })
    },

    stepForward: () => {
        const s = get()
        if (s.stepIndex < 0) return // Already at live edge
        const newIndex = s.stepIndex + 1
        const isLiveEdge = newIndex >= s.stepHistory.length - 1
        const entry = s.stepHistory[isLiveEdge ? s.stepHistory.length - 1 : newIndex]

        if (!entry) return

        set({
            stepIndex: isLiveEdge ? -1 : newIndex,
            currentLine: entry.currentLine,
            currentFunc: entry.currentFunc,
            callStack: entry.callStack,
            memorySnapshot: entry.memorySnapshot,
            knownHeapTypes: entry.knownHeapTypes,
            stackPointer: entry.stackPointer,
        })
    },

    reset: () => set({
        debugMode: 'idle',
        currentLine: null,
        currentFunc: null,
        stepMap: {},
        liveVariables: {},
        wasmBinary: null,
        memoryBuffer: null,
        stackPointer: 0,
        callStack: [],
        heapPointers: { countPtr: 0, allocsPtr: 0 },
        memorySnapshot: null,
        knownHeapTypes: {},
        stepHistory: [],
        stepIndex: -1,
    }),
}))
