// @vitest-environment jsdom

import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WebIDEHostProvider, type WebIDEHost } from '../../src/host'
import { createWebIDEInstanceController } from '../../src/web-ide/core/instance-handle'
import { IDEPluginManager } from '../../src/web-ide/core/plugin-manager'
import { IDEContributionContext } from '../../src/web-ide/react/contribution-context'
import { WorkspaceHostBridge } from '../../src/web-ide/react/WorkspaceHostBridge'

it('seeds public host breakpoint options after fresh file hydration under StrictMode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const controller = createWebIDEInstanceController()
  const plugins = new IDEPluginManager([])
  const host: WebIDEHost = { workspace: {
    id: 'public-breakpoint-seed', localCache: 'memory',
    initialFiles: { 'main.cpp': 'int main() {\n    return 0;\n}' },
    initialBreakpoints: { 'main.cpp': [2] },
  } }
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(
      <StrictMode>
        <WebIDEHostProvider host={host}>
          <IDEContributionContext.Provider value={plugins}>
            <WorkspaceHostBridge instanceController={controller} />
          </IDEContributionContext.Provider>
        </WebIDEHostProvider>
      </StrictMode>,
    ))
    expect(controller.handle.snapshot().debug.breakpoints['/workspace/main.cpp']).toEqual([2])
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
