// ── Debug Store ────────────────────────────────────────────────────
// Zustand store for debugger state: DWARF data, pause/step control,
// breakpoints, and current execution state.

import { create } from 'zustand'
import type { DwarfInfo } from '@/engine/dwarf-types'
import { EMPTY_DWARF } from '@/engine/dwarf-types'

export type DebugMode = 'idle' | 'compiling' | 'running' | 'paused'

export interface DebugState {
    /** Parsed DWARF debug info from the last compilation */
    dwarfInfo: DwarfInfo

    /** Current debug mode */
    debugMode: DebugMode

    /** Currently paused source line number */
    currentLine: number | null

    /** User-set breakpoints (line numbers) */
    breakpoints: Set<number>

    /** The raw compiled WASM binary (with debug info) */
    wasmBinary: Uint8Array | null

    /** Live variable values extracted from WASM memory during pause */
    liveVariables: Record<string, { value: string | number; address?: number }>

    /** Actions */
    setDwarfInfo: (info: DwarfInfo) => void
    setDebugMode: (mode: DebugMode) => void
    setCurrentLine: (line: number | null) => void
    toggleBreakpoint: (line: number) => void
    setWasmBinary: (binary: Uint8Array | null) => void
    setLiveVariables: (vars: Record<string, { value: string | number; address?: number }>) => void
    reset: () => void
}

export const useDebugStore = create<DebugState>((set) => ({
    dwarfInfo: EMPTY_DWARF,
    debugMode: 'idle',
    currentLine: null,
    breakpoints: new Set(),
    wasmBinary: null,
    liveVariables: {},

    setDwarfInfo: (info) => set({ dwarfInfo: info }),
    setDebugMode: (mode) => set({ debugMode: mode }),
    setCurrentLine: (line) => set({ currentLine: line }),

    toggleBreakpoint: (line) =>
        set((s) => {
            const next = new Set(s.breakpoints)
            if (next.has(line)) next.delete(line)
            else next.add(line)
            return { breakpoints: next }
        }),

    setWasmBinary: (binary) => set({ wasmBinary: binary }),
    setLiveVariables: (vars) => set({ liveVariables: vars }),

    reset: () => set({
        debugMode: 'idle',
        currentLine: null,
        liveVariables: {},
        wasmBinary: null,
    }),
}))
