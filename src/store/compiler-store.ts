import { create } from 'zustand'

type CacheState = 'idle' | 'downloading' | 'ready' | 'error'

interface CompilerState {
    cacheState: CacheState
    downloadProgress: number // 0–100
    errorMessage: string | null

    setCacheState: (s: CacheState) => void
    setDownloadProgress: (p: number) => void
    setErrorMessage: (m: string | null) => void
}

export const useCompilerStore = create<CompilerState>((set) => ({
    cacheState: 'idle',
    downloadProgress: 0,
    errorMessage: null,

    setCacheState: (s) => set({ cacheState: s }),
    setDownloadProgress: (p) => set({ downloadProgress: p }),
    setErrorMessage: (m) => set({ errorMessage: m }),
}))
