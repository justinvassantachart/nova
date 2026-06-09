import { type ReactNode } from 'react'
import type { IDEHost } from './ide-host'
import { IDEHostContext } from './use-ide-host'

export function IDEHostProvider({ host, children }: { host: IDEHost; children: ReactNode }) {
  return <IDEHostContext.Provider value={host}>{children}</IDEHostContext.Provider>
}
