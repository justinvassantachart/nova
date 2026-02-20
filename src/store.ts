import { create } from 'zustand';

// ── File System Types ──────────────────────────────────────────────
export interface VFSNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: VFSNode[];
}

// ── Draw Commands ──────────────────────────────────────────────────
export type DrawCommand =
    | { type: 'CLEAR' }
    | { type: 'CIRCLE'; x: number; y: number; r: number; color: string }
    | { type: 'RECT'; x: number; y: number; w: number; h: number; color: string };

// ── Allocation Record ──────────────────────────────────────────────
export interface AllocRecord {
    ptr: number;
    size: number;
    timestamp: number;
}

// ── Store Shape ────────────────────────────────────────────────────
interface NovaState {
    // File system
    files: VFSNode[];
    setFiles: (files: VFSNode[]) => void;

    // Editor
    activeFile: string | null;
    activeFileContent: string;
    setActiveFile: (path: string, content: string) => void;
    setActiveFileContent: (content: string) => void;

    // Terminal
    terminalLines: string[];
    appendTerminalLine: (line: string) => void;
    clearTerminal: () => void;

    // Execution
    isRunning: boolean;
    isCompiling: boolean;
    setIsRunning: (v: boolean) => void;
    setIsCompiling: (v: boolean) => void;

    // Draw queue (from worker)
    drawQueue: DrawCommand[];
    setDrawQueue: (q: DrawCommand[]) => void;

    // Memory allocations
    allocations: AllocRecord[];
    addAllocation: (a: AllocRecord) => void;
    clearAllocations: () => void;

    // Right pane tab
    rightTab: 'canvas' | 'memory';
    setRightTab: (tab: 'canvas' | 'memory') => void;
}

export const useNovaStore = create<NovaState>((set) => ({
    // ── Files ──
    files: [],
    setFiles: (files) => set({ files }),

    // ── Editor ──
    activeFile: null,
    activeFileContent: '',
    setActiveFile: (path, content) =>
        set({ activeFile: path, activeFileContent: content }),
    setActiveFileContent: (content) => set({ activeFileContent: content }),

    // ── Terminal ──
    terminalLines: [],
    appendTerminalLine: (line) =>
        set((s) => ({ terminalLines: [...s.terminalLines, line] })),
    clearTerminal: () => set({ terminalLines: [] }),

    // ── Execution ──
    isRunning: false,
    isCompiling: false,
    setIsRunning: (v) => set({ isRunning: v }),
    setIsCompiling: (v) => set({ isCompiling: v }),

    // ── Draw ──
    drawQueue: [],
    setDrawQueue: (q) => set({ drawQueue: q }),

    // ── Memory ──
    allocations: [],
    addAllocation: (a) =>
        set((s) => ({ allocations: [...s.allocations, a] })),
    clearAllocations: () => set({ allocations: [] }),

    // ── Right pane ──
    rightTab: 'canvas',
    setRightTab: (tab) => set({ rightTab: tab }),
}));
