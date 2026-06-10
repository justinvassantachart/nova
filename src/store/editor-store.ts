import { create } from 'zustand'

interface EditorState {
    activeFile: string | null
    activeFileContent: string
    // 1-based caret position mirrored from Monaco for the status bar.
    cursorLine: number
    cursorColumn: number
    setActiveFile: (path: string, content: string) => void
    setActiveFileContent: (content: string) => void
    setCursor: (line: number, column: number) => void
}

export const useEditorStore = create<EditorState>((set) => ({
    activeFile: null,
    activeFileContent: '',
    cursorLine: 1,
    cursorColumn: 1,
    setActiveFile: (path, content) => set({ activeFile: path, activeFileContent: content }),
    setActiveFileContent: (content) => set({ activeFileContent: content }),
    setCursor: (line, column) => set({ cursorLine: line, cursorColumn: column }),
}))
