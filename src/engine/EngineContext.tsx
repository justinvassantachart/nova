import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { IIDEEngine } from './IIDEEngine';
import { NpmDapEngine } from './NpmDapEngine';

const EngineContext = createContext<IIDEEngine | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
    const engine = useMemo(() => new NpmDapEngine(), []);

    // Stop the underlying WASM engine when the IDE leaves the view. Without
    // this the engine keeps running after the host (e.g. a teacher reviewing
    // submissions) navigates away.
    useEffect(() => () => engine.stop(), [engine]);

    return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): IIDEEngine {
    const context = useContext(EngineContext);
    if (!context) throw new Error('useEngine must be used within EngineProvider');
    return context;
}
