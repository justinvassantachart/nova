// ── Debug Store ────────────────────────────────────────────────────
// Zustand store for debugger state: DWARF data, pause/step control,
// breakpoints, and current execution state.

import { create } from 'zustand'
import type { DwarfInfo } from '@/engine/dwarf-types'
import { EMPTY_DWARF } from '@/engine/dwarf-types'

export type DebugMode = 'idle' | 'compiling' | 'running' | 'paused'

export interface StackFrame { id: string; func: string; line: number; sp: number }

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
    reset: () => void
}

export const useDebugStore = create<DebugState>((set) => ({
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
    }),
}))
