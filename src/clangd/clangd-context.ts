// Context + hook live apart from the provider component so files exporting
// components export nothing else (react-refresh/only-export-components).
import { createContext, useContext } from 'react'
import type { ClangdClient, ClangdStatus } from './ClangdClient'

const DISABLED_STATUS: ClangdStatus = { state: 'disabled' }

export interface ClangdContextValue {
    client: ClangdClient | null
    status: ClangdStatus
    /** First call boots; further calls are no-ops. */
    arm: () => void
}

export const ClangdContext = createContext<ClangdContextValue | null>(null)

// Safe stub for components rendered outside the provider.
export const NOOP_VALUE: ClangdContextValue = {
    client: null,
    status: DISABLED_STATUS,
    arm: () => {},
}

/** Returns NOOP_VALUE if no provider is mounted — `arm()` is always safe. */
export function useClangd(): ClangdContextValue {
    return useContext(ClangdContext) ?? NOOP_VALUE
}
