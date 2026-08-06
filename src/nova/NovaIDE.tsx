import { forwardRef } from 'react'
import { WebIDE, type WebIDEInstanceHandle } from 'web-ide'
import { novaWebIDEConfiguration } from './configuration'

/** The deployed site hosts the reusable Web IDE with its app-specific plugins. */
export const NovaIDE = forwardRef<WebIDEInstanceHandle>(function NovaIDE(_props, ref) {
  return <WebIDE ref={ref} configuration={novaWebIDEConfiguration} />
})
