import React, { useEffect, useMemo } from 'react';
import { EngineContext } from './engine-context';
import { NpmDapEngine } from './NpmDapEngine';

export function EngineProvider({ children }: { children: React.ReactNode }) {
    const engine = useMemo(() => new NpmDapEngine(), []);

    // Console access for manual debugging in dev builds only.
    useEffect(() => {
        if (import.meta.env.DEV) {
            (window as unknown as { __novaEngine?: unknown }).__novaEngine = engine;
        }
    }, [engine]);

    // Stop the underlying WASM engine when the IDE leaves the view. Without
    // this the engine keeps running after the host (e.g. a teacher reviewing
    // submissions) navigates away.
    useEffect(() => () => engine.stop(), [engine]);

    return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}
