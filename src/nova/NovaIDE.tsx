import { forwardRef } from 'react'
import { WebIDE, type WebIDEInstanceHandle } from 'web-ide'
import { useAssignmentInfo } from '@/components/sidebar/use-assignment-info'
import {
  novaAssignmentWebIDEConfiguration,
  novaWebIDEConfiguration,
} from './configuration'

/** The deployed site hosts the reusable Web IDE with its app-specific plugins. */
export const NovaIDE = forwardRef<WebIDEInstanceHandle>(function NovaIDE(_props, ref) {
  const assignment = useAssignmentInfo()
  const configuration = assignment
    ? novaAssignmentWebIDEConfiguration
    : novaWebIDEConfiguration

  return <WebIDE ref={ref} configuration={configuration} />
})
