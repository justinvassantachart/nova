// Context + hook live apart from the provider component so files exporting
// components export nothing else (react-refresh/only-export-components).
import { createContext, useContext } from 'react'
import type { IDEHost } from './ide-host'

export const IDEHostContext = createContext<IDEHost | undefined>(undefined)

// Returns the host, or undefined in standalone mode. Components should
// always optional-chain into callbacks: `host?.onEvent?.('compile', {...})`.
export function useIDEHost(): IDEHost | undefined {
  return useContext(IDEHostContext)
}
