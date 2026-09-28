import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { testingPlugin } from 'web-ide/testing'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { WebIDEHostProvider, useWebIDEHost } from 'web-ide/host'
import { canvasPlugin, coreWorkbenchPlugin } from 'web-ide/plugins'
import { assignmentActivityPlugin } from '../../src/nova/assignment-activity-plugin'
import { precompiledCppRuntimePlugin } from '../../src/nova/precompiled-runtime'
import { novaCppTestingPlugin } from '../../src/nova/cpp-testing-plugin'
import {
  novaAssignmentWebIDEConfiguration,
  novaWebIDEConfiguration,
} from '../../src/nova/configuration'

function HostProbe() {
  return <output>{useWebIDEHost()?.workspace?.id ?? 'standalone'}</output>
}

describe('The deployed site consumes its Web IDE workspace package', () => {
  it('composes public package exports plus host-owned runtime, test compatibility, and assignment UI', () => {
    expect(novaWebIDEConfiguration).toMatchObject({
      runtimeProvider: 'web-ide.runtime.cpp',
      languageToolingProvider: 'web-ide.language-tooling.cpp',
      testProvider: 'web-ide.testing.cpp',
      brand: 'web-ide',
      terminalName: 'web-ide terminal',
      reloadWhenNotIsolated: true,
    })
    expect(novaWebIDEConfiguration.plugins).toEqual([
      precompiledCppRuntimePlugin,
      cppLanguageToolingPlugin,
      novaCppTestingPlugin,
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
