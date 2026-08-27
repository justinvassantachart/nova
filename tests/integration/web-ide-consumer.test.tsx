import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { cppRuntimePlugin } from 'web-ide/runtimes'
import { cppTestingPlugin, testingPlugin } from 'web-ide/testing'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { WebIDEHostProvider, useWebIDEHost } from 'web-ide/host'
import { canvasPlugin, coreWorkbenchPlugin } from 'web-ide/plugins'
import { assignmentActivityPlugin } from '../../src/nova/assignment-activity-plugin'
import {
  novaAssignmentWebIDEConfiguration,
  novaWebIDEConfiguration,
} from '../../src/nova/configuration'

function HostProbe() {
  return <output>{useWebIDEHost()?.workspace?.id ?? 'standalone'}</output>
}

describe('The deployed site consumes its Web IDE workspace package', () => {
  it('composes only public package exports plus host-owned assignment UI', () => {
    expect(novaWebIDEConfiguration).toMatchObject({
      runtimeProvider: 'web-ide.runtime.cpp',
      languageToolingProvider: 'web-ide.language-tooling.cpp',
      testProvider: 'web-ide.testing.cpp',
      brand: 'WEB IDE',
      terminalName: 'Web IDE Terminal',
      reloadWhenNotIsolated: true,
    })
    expect(novaWebIDEConfiguration.plugins).toEqual([
      cppRuntimePlugin,
      cppLanguageToolingPlugin,
      cppTestingPlugin,
      assignmentActivityPlugin,
      coreWorkbenchPlugin,
      canvasPlugin,
      testingPlugin,
    ])

    const activities = novaWebIDEConfiguration.plugins.flatMap(
      (plugin) => plugin.contributes?.activities ?? [],
    )
    expect(activities.map(({ id }) => id)).toEqual([
      'nova.assignment',
      'workbench.files',
    ])
    expect(activities.find(({ id }) => id === 'nova.assignment')).toMatchObject({
      title: 'Assignment',
      icon: 'checklist',
    })
    expect(novaWebIDEConfiguration.plugins.some(({ id }) => /karel/i.test(id))).toBe(false)
    expect(novaWebIDEConfiguration.initialLayout?.selectedActivityId).toBeUndefined()
    expect(novaAssignmentWebIDEConfiguration.initialLayout).toMatchObject({
      selectedActivityId: 'nova.assignment',
    })
  })

  it('keeps host workspace identity in the package-owned host provider', () => {
    const html = renderToStaticMarkup(
      <WebIDEHostProvider
        host={{ workspace: { id: 'web-ide/course/activity', localCache: 'memory' } }}
      >
        <HostProbe />
      </WebIDEHostProvider>,
    )

    expect(html).toContain('web-ide/course/activity')
  })
})
