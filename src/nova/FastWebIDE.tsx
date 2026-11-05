import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react'
import { WebIDE, type WebIDEConfiguration, type WebIDEInstanceHandle } from 'web-ide'
import { useWebIDEHost } from 'web-ide/host'
import { useAuth } from '@/shared/context/auth-context'
import { createFastCppRuntimePlugin } from './precompiled-runtime'
import { scheduleInitialWarmup } from './initial-warmup'

type Props = { configuration: WebIDEConfiguration }
type ScopedProps = Props & { projectId: string; accountId: string; warm: boolean }

const ScopedWebIDE = forwardRef<WebIDEInstanceHandle, ScopedProps>(function ScopedWebIDE(
  { configuration, projectId, accountId, warm }, ref,
) {
  const instance = useRef<WebIDEInstanceHandle | null>(null)
  const runtime = useMemo(() => createFastCppRuntimePlugin({ projectId, accountId }), [projectId, accountId])
  const scopedConfiguration = useMemo(() => ({
    ...configuration,
    plugins: configuration.plugins.map(plugin => plugin.id === runtime.id ? runtime : plugin),
  }), [configuration, runtime])
  const attach = useCallback((value: WebIDEInstanceHandle | null) => {
    instance.current = value
    if (typeof ref === 'function') ref(value)
    else if (ref) ref.current = value
  }, [ref])
  useEffect(() => {
    if (warm && instance.current) return scheduleInitialWarmup(instance.current)
  }, [warm])
  return <WebIDE ref={attach} configuration={scopedConfiguration} />
})

/** A fresh runtime/cache per mounted account and workspace, including the showcase. */
export const FastWebIDE = forwardRef<WebIDEInstanceHandle, Props>(function FastWebIDE(props, ref) {
  const host = useWebIDEHost()
  const { user } = useAuth()
  const projectId = host?.workspace?.id ?? 'web-ide:standalone'
  const accountId = user?.uid ?? 'anonymous'
  return <ScopedWebIDE key={JSON.stringify([accountId, projectId])} {...props}
    ref={ref} projectId={projectId} accountId={accountId} warm={!host?.workspace?.readOnly} />
})
