import { create } from 'zustand'

export type DrawCommand =
    | { type: 'CLEAR' }
    | { type: 'CIRCLE'; x: number; y: number; r: number; color: string }
    | { type: 'RECT'; x: number; y: number; w: number; h: number; color: string }

export interface AllocRecord {
    ptr: number
    size: number
    timestamp: number
}

interface ExecutionState {
    isCompiling: boolean
    isRunning: boolean
    rightTab: 'canvas' | 'memory'
    drawQueue: DrawCommand[]
    allocations: AllocRecord[]

    setIsCompiling: (v: boolean) => void
    setIsRunning: (v: boolean) => void
    setRightTab: (tab: 'canvas' | 'memory') => void
    setDrawQueue: (q: DrawCommand[]) => void
    addAllocation: (a: AllocRecord) => void
    clearAllocations: () => void
}

export const useExecutionStore = create<ExecutionState>((set) => ({
    isCompiling: false,
    isRunning: false,
    rightTab: 'canvas',
    drawQueue: [],
    allocations: [],

    setIsCompiling: (v) => set({ isCompiling: v }),
    setIsRunning: (v) => set({ isRunning: v }),
    setRightTab: (tab) => set({ rightTab: tab }),
    setDrawQueue: (q) => set({ drawQueue: q }),
    addAllocation: (a) => set((s) => ({ allocations: [...s.allocations, a] })),
    clearAllocations: () => set({ allocations: [] }),
}))
