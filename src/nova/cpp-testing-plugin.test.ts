import { describe, expect, it } from 'vitest'
import { cppTestProvider } from 'web-ide/testing'
import { novaCppTestingPlugin } from './cpp-testing-plugin'

const provider = novaCppTestingPlugin.contributes!.testProviders![0]
const compatibilityPath = '/workspace/webide_test.h'
const savedSource = `#include "webide_test.h"

STUDENT_TEST("saved lesson assertion") {
    EXPECT_EQUAL(2 + 2, 4);
}

int main() { return 0; }
`

describe('saved newer C++ lesson compatibility', () => {
  it('keeps provider identity and old support while adding the same bridge to editor and runtime', async () => {
    expect(provider).toMatchObject({
      id: cppTestProvider.id,
      label: cppTestProvider.label,
      languageIds: cppTestProvider.languageIds,
      help: cppTestProvider.help,
    })
    expect(provider.editorSupportFiles).toMatchObject(cppTestProvider.editorSupportFiles!)
    const prepared = await provider.prepare({
      files: { '/workspace/main.cpp': savedSource }, mode: 'run', executeTests: false,
    })
    const bridge = prepared.execution.files[compatibilityPath]
    expect(bridge).toBe(provider.editorSupportFiles![compatibilityPath])
    expect(bridge).toContain('#include "nova_test.h"')
    expect(bridge).toContain('#define EXPECT_EQUAL EXPECT_EQUALS')
  })

  it.each(['run', 'debug'] as const)('supports %s for saved lesson code without rewriting or mutating it', async mode => {
    const files = { '/workspace/main.cpp': savedSource }
    const prepared = await provider.prepare({ files, mode, executeTests: false })
    expect(prepared.execution.mode).toBe(mode)
    expect(prepared.execution.files['/workspace/main.cpp']).toBe(savedSource)
    expect(prepared.execution.files['/workspace/nova_test.h']).toContain('#define EXPECT_EQUALS')
    expect(prepared.execution.files['/workspace/nova_test.cpp']).toBeDefined()
    expect(prepared.execution.files['/workspace/nova_test_runner.cpp']).toBeUndefined()
    expect(prepared.parser).toBeUndefined()
    expect(files).toEqual({ '/workspace/main.cpp': savedSource })
  })

  it('retains Tests main handling and the existing output parser', async () => {
    const prepared = await provider.prepare({
      files: { '/workspace/main.cpp': savedSource }, mode: 'run', executeTests: true,
    })
    expect(prepared.execution.entrypoint).toBe('/workspace/nova_test_runner.cpp')
    expect(prepared.execution.files['/workspace/main.cpp']).toContain('int nova_hidden_main()')
    expect(prepared.execution.files['/workspace/main.cpp']).toContain('EXPECT_EQUAL(2 + 2, 4)')
    const events = prepared.parser!.push('stdout', [
      '###NOVA_TEST###|~|SUITE_START|~|1',
      '###NOVA_TEST###|~|TEST_START|~|saved lesson assertion',
      '###NOVA_TEST###|~|TEST_END|~|PASS',
      '###NOVA_TEST###|~|SUITE_END|~|',
      '',
    ].join('\n')).events
    expect(events).toContainEqual(expect.objectContaining({ type: 'test-end', status: 'pass' }))
    expect(events).toContainEqual({ type: 'run-end' })
  })

  it('leaves plain programs and legacy nova_test.h programs on the original provider path', async () => {
    for (const source of ['int main() {}', savedSource.replace('webide_test.h', 'nova_test.h').replace('EXPECT_EQUAL(', 'EXPECT_EQUALS(')]) {
      const request = { files: { '/workspace/main.cpp': source }, mode: 'run' as const, executeTests: false }
      expect(await provider.prepare(request)).toEqual(await cppTestProvider.prepare(request))
    }
  })

  it('does not replace a workspace-owned webide_test.h header', async () => {
    const ownHeader = '#pragma once\n#define EXPECT_EQUAL(a, b) ((void)0)\n'
    const prepared = await provider.prepare({
      files: { '/workspace/main.cpp': savedSource, [compatibilityPath]: ownHeader },
      mode: 'run', executeTests: false,
    })
    expect(prepared.execution.files[compatibilityPath]).toBe(ownHeader)
  })
})
