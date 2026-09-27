import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { cppRuntimePlugin } from 'web-ide/runtimes'
import { testingPlugin } from 'web-ide/testing'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { WebIDEHostProvider, useWebIDEHost } from 'web-ide/host'
import { canvasPlugin, coreWorkbenchPlugin } from 'web-ide/plugins'
import { novaCppTestingPlugin } from '../../src/nova/cpp-testing-plugin'
import { assignmentActivityPlugin } from '../../src/nova/assignment-activity-plugin'
import {
  novaAssignmentWebIDEConfiguration,
  novaWebIDEConfiguration,
} from '../../src/nova/configuration'

function HostProbe() {
  return <output>{useWebIDEHost()?.workspace?.id ?? 'standalone'}</output>
}

describe('The deployed site consumes its published Web IDE package', () => {
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

  it('prepares saved legacy lessons with the shared framework without changing student files', async () => {
    const provider = novaCppTestingPlugin.contributes!.testProviders![0]
    const resource = novaCppTestingPlugin.contributes!.resources![0]
    expect(resource.scope).toBe('execution-only')
    const support = typeof resource.files === 'function' ? resource.files() : resource.files
    const source = '#include "nova_test.h"\nint main() { return 0; }\nSTUDENT_TEST("saved lesson") { EXPECT_EQUALS(2 + 2, 4); }\n'
    const workspace = Object.freeze({ '/workspace/main.cpp': source })
    const files = { ...support, ...workspace }
    const plan = await provider.prepareExecution!({ files, mode: 'run' })
    expect(plan.files['/workspace/main.cpp']).toBe(source)
    expect(plan.files['/workspace/webide_test.h']).toBeTruthy()
    expect(plan.files['/workspace/webide_test.cpp']).toBeTruthy()
    expect(provider.editorSupportFiles!['/workspace/nova_test.h']).toBe(support['/sysroot/nova_test.h'])
    const catalog = await provider.discover({ files, workspaceDigest: 'a'.repeat(64) })
    expect(catalog.tests.map(test => test.name)).toEqual(['saved lesson'])
    const run = await provider.prepareRun({
      apiVersion: 2, kind: 'run_request', mode: 'run',
      workspaceDigest: catalog.workspaceDigest, catalogDigest: catalog.catalogDigest,
      selection: { kind: 'all' },
    }, { files, runId: 'b'.repeat(32) })
    expect(run.execution.entrypoint).toBe('/workspace/webide_test_runner.cpp')
    expect(workspace).toEqual({ '/workspace/main.cpp': source })
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
