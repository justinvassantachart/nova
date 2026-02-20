import { create } from 'zustand'

interface EditorState {
    activeFile: string | null
    activeFileContent: string
    setActiveFile: (path: string, content: string) => void
    setActiveFileContent: (content: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
    activeFile: null,
    activeFileContent: '',
    setActiveFile: (path, content) => set({ activeFile: path, activeFileContent: content }),
    setActiveFileContent: (content) => set({ activeFileContent: content }),
}))
