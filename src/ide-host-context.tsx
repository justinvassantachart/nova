import { createContext, useContext, type ReactNode } from 'react'
import type { IDEHost } from './ide-host'

const IDEHostContext = createContext<IDEHost | undefined>(undefined)

export function IDEHostProvider({ host, children }: { host: IDEHost; children: ReactNode }) {
  return <IDEHostContext.Provider value={host}>{children}</IDEHostContext.Provider>
}

// Returns the host, or undefined in standalone mode. Components should
// always optional-chain into callbacks: `host?.onEvent?.('compile', {...})`.
export function useIDEHost(): IDEHost | undefined {
  return useContext(IDEHostContext)
}
