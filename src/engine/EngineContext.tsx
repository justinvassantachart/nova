import React, { createContext, useContext, useMemo } from 'react';
import type { IIDEEngine } from './IIDEEngine';
import { LegacyWasmEngine } from './LegacyWasmEngine';

const EngineContext = createContext<IIDEEngine | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
    // 🚀 THE MIGRATION SWITCH:
    // When the DAP NPM package is ready, change exactly ONE line of code here:
    // const engine = useMemo(() => new NpmDapEngine(), []);
    const engine = useMemo(() => new LegacyWasmEngine(), []);

    return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): IIDEEngine {
    const context = useContext(EngineContext);
    if (!context) throw new Error('useEngine must be used within EngineProvider');
    return context;
}
