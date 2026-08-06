// Compatibility entry point retained for the site's existing routes and embeds.
import { forwardRef } from 'react'
import type { WebIDEInstanceHandle } from 'web-ide'
import { NovaIDE } from '@/nova/NovaIDE'

const App = forwardRef<WebIDEInstanceHandle>(function App(_props, ref) {
  return <NovaIDE ref={ref} />
})

export default App
