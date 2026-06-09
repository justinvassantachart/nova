// Context + hook live apart from the provider component so files exporting
// components export nothing else (react-refresh/only-export-components).
import { createContext, useContext } from 'react';
import type { IIDEEngine } from './IIDEEngine';

export const EngineContext = createContext<IIDEEngine | null>(null);

export function useEngine(): IIDEEngine {
    const context = useContext(EngineContext);
    if (!context) throw new Error('useEngine must be used within EngineProvider');
    return context;
}
