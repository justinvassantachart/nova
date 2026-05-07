import React, { createContext, useContext, useMemo } from 'react';
import type { IIDEEngine } from './IIDEEngine';
import { NpmDapEngine } from './NpmDapEngine';

const EngineContext = createContext<IIDEEngine | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
    const engine = useMemo(() => new NpmDapEngine(), []);

    return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): IIDEEngine {
    const context = useContext(EngineContext);
    if (!context) throw new Error('useEngine must be used within EngineProvider');
    return context;
}
