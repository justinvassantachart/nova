import { create } from 'zustand'
import type { DebugPauseState, MemorySnapshot, StackFrame } from '@/engine/IIDEEngine'

export type DebugMode = 'idle' | 'compiling' | 'running' | 'paused'

export interface DebugState {
    debugMode: DebugMode
    currentLine: number | null
    currentFunc: string | null
    currentFile: string | null
    breakpoints: Record<string, number[]> // Map of file -> lines
    
    callStack: StackFrame[]
    memorySnapshot: MemorySnapshot | null
    
    stepHistory: DebugPauseState[]
    stepIndex: number
    
    setDebugMode: (mode: DebugMode) => void
    toggleBreakpoint: (file: string, line: number) => void
    pushHistoryState: (state: DebugPauseState) => void
    stepBack: () => void
    stepForward: () => void
    reset: () => void
}

export const useDebugStore = create<DebugState>((set, get) => ({
    debugMode: 'idle',
    currentLine: null,
    currentFunc: null,
    currentFile: null,
    breakpoints: {},
    callStack: [],
    memorySnapshot: null,
    stepHistory: [],
    stepIndex: -1,
    
    setDebugMode: (mode) => set({ debugMode: mode }),
    
    toggleBreakpoint: (file, line) => set((s) => {
        const fileBps = s.breakpoints[file] || []
        const nextBps = fileBps.includes(line) ? fileBps.filter(l => l !== line) : [...fileBps, line]
        return { breakpoints: { ...s.breakpoints, [file]: nextBps } }
    }),
    
    pushHistoryState: (state) => {
        const s = get()
        const history = s.stepIndex >= 0 ? s.stepHistory.slice(0, s.stepIndex + 1) : [...s.stepHistory]
        history.push(state)
        set({ 
            stepHistory: history, stepIndex: -1, 
            currentLine: state.line, currentFunc: state.func, currentFile: state.file, 
            callStack: state.callStack, memorySnapshot: state.memorySnapshot, debugMode: 'paused' 
        })
    },
    
    stepBack: () => {
        const s = get()
        if (s.stepHistory.length < 2 && s.stepIndex < 0) return
        if (s.stepHistory.length === 0) return
        const newIndex = s.stepIndex < 0 ? s.stepHistory.length - 2 : Math.max(0, s.stepIndex - 1)
        const entry = s.stepHistory[newIndex]
        if (entry) set({ stepIndex: newIndex, currentLine: entry.line, currentFunc: entry.func, currentFile: entry.file, callStack: entry.callStack, memorySnapshot: entry.memorySnapshot })
    },
    
    stepForward: () => {
        const s = get()
        if (s.stepIndex < 0) return
        const newIndex = s.stepIndex + 1
        const isLiveEdge = newIndex >= s.stepHistory.length - 1
        const entry = s.stepHistory[isLiveEdge ? s.stepHistory.length - 1 : newIndex]
        if (entry) set({ stepIndex: isLiveEdge ? -1 : newIndex, currentLine: entry.line, currentFunc: entry.func, currentFile: entry.file, callStack: entry.callStack, memorySnapshot: entry.memorySnapshot })
    },
    
    reset: () => set({ debugMode: 'idle', currentLine: null, currentFunc: null, currentFile: null, callStack: [], memorySnapshot: null, stepHistory: [], stepIndex: -1 }),
}))
