import { describe, expect, it } from 'vitest'
import { cppTestProvider, type TestRunRequestV2 } from 'web-ide/testing'
import { novaCppTestingPlugin } from './cpp-testing-plugin'

const provider = novaCppTestingPlugin.contributes!.testProviders![0]
const legacyPath = '/sysroot/nova_test.h'
const legacySource = `#include <iostream>
#include "nova_test.h"
STUDENT_TEST("saved lesson") { EXPECT_EQUALS(2 + 2, 4); }
int main() { std::cout << "saved program ran\\n"; }
`
const currentSource = legacySource.replace('nova_test.h', 'webide_test.h').replace('EXPECT_EQUALS', 'EXPECT_EQUAL')
const request: TestRunRequestV2 = {
  apiVersion: 2, kind: 'run_request', mode: 'run', workspaceDigest: 'a'.repeat(64),
  catalogDigest: 'b'.repeat(64), selection: { kind: 'all' },
}

describe('Testing V2 saved lesson compatibility', () => {
  it('keeps a plain program free of testing framework compilation', async () => {
    const files = { '/workspace/main.cpp': '#include <iostream>\nint main() {}' }
    expect(await provider.prepareExecution!({ files, mode: 'run' }))
      .toEqual(await cppTestProvider.prepareExecution!({ files, mode: 'run' }))
    expect(novaCppTestingPlugin.contributes!.resources).toBeUndefined()
  })

  it.each(['run', 'debug'] as const)('supports saved legacy code in %s without modifying saved files', async mode => {
    const files = { '/workspace/main.cpp': legacySource }
    const plan = await provider.prepareExecution!({ files, mode })
    expect(plan.files['/workspace/main.cpp']).toBe(legacySource)
    expect(plan.files[legacyPath]).toBe(provider.editorSupportFiles!['/workspace/nova_test.h'])
    expect(plan.files[legacyPath]).toContain('#define EXPECT_EQUALS EXPECT_EQUAL')
    expect(plan.files['/workspace/webide_test.cpp']).toBeDefined()
    expect(files).toEqual({ '/workspace/main.cpp': legacySource })
  })

  it('uses the unmodified newer provider for current lesson code', async () => {
    const files = { '/workspace/main.cpp': currentSource }
    expect(await provider.prepareExecution!({ files, mode: 'run' }))
      .toEqual(await cppTestProvider.prepareExecution!({ files, mode: 'run' }))
  })

  it('preserves discovery and prepares legacy assertions through Testing V2', async () => {
    const files = { '/workspace/main.cpp': legacySource }
    const catalog = await provider.discover({ files, workspaceDigest: request.workspaceDigest })
    expect(catalog.tests.map(test => test.name)).toEqual(['saved lesson'])
    const plan = await provider.prepareRun(request, { files, runId: '0123456789abcdef' })
    expect(plan.execution.entrypoint).toBe('/workspace/webide_test_runner.cpp')
    expect(plan.execution.files['/workspace/main.cpp']).toContain('webide_hidden_main')
    expect(plan.execution.files['/workspace/main.cpp']).toContain('WEBIDE_TEST_KEY')
    expect(plan.execution.files[legacyPath]).toBeDefined()
    expect(plan.decoder).toBeDefined()
  })

  it('does not replace a workspace-owned legacy header', async () => {
    const files = { '/workspace/main.cpp': legacySource, '/workspace/nova_test.h': '// user header' }
    const plan = await provider.prepareExecution!({ files, mode: 'run' })
    expect(plan.files['/workspace/nova_test.h']).toBe('// user header')
    expect(plan.files[legacyPath]).toBeUndefined()
  })
})
