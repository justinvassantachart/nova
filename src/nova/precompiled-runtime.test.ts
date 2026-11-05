import { describe, expect, it, vi } from 'vitest'
import { CPP_TEST_IMPL_PATH, CPP_TEST_SUPPORT_FILES } from 'web-ide/testing'

const { prepare, warmup, cancelWarmupAndWait } = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ success: true, errors: [] })),
  warmup: vi.fn(async () => ({ status: 'completed', diagnostics: [] })),
  cancelWarmupAndWait: vi.fn(async () => {}),
}))
vi.mock('web-ide/runtimes', () => ({
  cppRuntimeProvider: { createSession: () => ({ prepare, warmup, cancelWarmupAndWait, start: vi.fn(), events: { exit: { subscribe: vi.fn() } } }), id: 'cpp' },
}))
import { leadingStandardIncludes, selectPchProfile, precompiledCppRuntimeProvider } from './precompiled-runtime'

describe('standard-library PCH selection', () => {
  it('allows only the exact Testing V2 implementation beside eligible lesson sources', () => {
    const files: Record<string, string> = {
      '/workspace/main.cpp': '#include <iostream>\n#include "webide_test.h"\nint main() {}',
      ...CPP_TEST_SUPPORT_FILES,
    }
    expect(selectPchProfile(files)?.headers).toEqual(['iostream'])
    files[CPP_TEST_IMPL_PATH] += '\nint extra() { return 1; }'
    expect(selectPchProfile(files)).toBeUndefined()
    expect(selectPchProfile(CPP_TEST_SUPPORT_FILES)).toBeUndefined()
  })
  it('chooses the longest available prefix shared by every translation unit', () => {
    const files = {
      '/workspace/main.cpp': '#include <iostream>\n#include <vector>\nint main() {}',
      '/workspace/tests.cpp': '// tests\n#include <iostream>\n#include <vector>\n#include "test.h"',
    }
    expect(selectPchProfile(files)?.headers).toEqual(['iostream', 'vector'])
    files['/workspace/tests.cpp'] = '#include <iostream>\nint test() {}'
    expect(selectPchProfile(files)?.headers).toEqual(['iostream'])
  })

  it('does not inject headers into files that omitted them or defined macros first', () => {
    for (const source of [
      'int main() {}',
      '#define _LIBCPP_ABI_VERSION 2\n#include <iostream>\n',
      '#ifdef SOMETHING\n#include <iostream>\n#endif',
      '#include "local.h"\n#include <iostream>\n',
      '// comment\\\n#include <iostream>\n',
    ]) expect(selectPchProfile({ '/workspace/main.cpp': source })).toBeUndefined()
    expect(selectPchProfile({
      '/workspace/main.cpp': '#include <iostream>\n',
      '/workspace/other.cpp': 'int helper() { return 1; }',
    })).toBeUndefined()
    expect(selectPchProfile({
      '/workspace/main.cpp': '#include <iostream>\n',
      '/workspace/helper.CPP': 'int helper() { return 1; }',
    })).toBeUndefined()
  })

  it('handles comments without swallowing code and avoids reserved path collisions', () => {
    expect(leadingStandardIncludes('/* intro */\n#include <iostream>\n// x\n#include <vector>\nint n;'))
      .toEqual(['iostream', 'vector'])
    expect(selectPchProfile({
      '/workspace/main.cpp': '#include <iostream>\n',
      '/workspace/__web_ide_pch.h': 'my header',
    })).toBeUndefined()
  })

  it('falls back to source compilation when a PCH download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const plan = { files: { '/workspace/main.cpp': '#include <iostream>\nint main() {}' }, mode: 'run' as const }
    const session = precompiledCppRuntimeProvider.createSession()
    await expect(session.prepare(plan)).resolves.toEqual({ success: true, errors: [] })
    expect(prepare).toHaveBeenLastCalledWith(plan)
    vi.unstubAllGlobals()
  })

  it('rejects corrupt cached artifacts before passing them to the engine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }))
    const plan = { files: { '/workspace/main.cpp': '#include <iostream>\nint main() {}' }, mode: 'debug' as const }
    await precompiledCppRuntimeProvider.createSession().prepare(plan)
    expect(prepare).toHaveBeenLastCalledWith(plan)
    vi.unstubAllGlobals()
  })
})

describe('PCH warmup lifecycle', () => {
  it('uses the same snapshot for warmup and foreground preparation', async () => {
    const session = precompiledCppRuntimeProvider.createSession()
    const plan = { files: { '/workspace/main.cpp': 'int main() {}' }, mode: 'run' as const }
    await session.warmup!(plan)
    await session.prepare(plan)
    expect(warmup).toHaveBeenLastCalledWith(plan, undefined)
    expect(prepare).toHaveBeenLastCalledWith(plan)
  })
  it('background cancellation does not cancel a foreground PCH transform', async () => {
    let finish!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
    const session = precompiledCppRuntimeProvider.createSession()
    const preparing = session.prepare({ files: { '/workspace/main.cpp': '#include <iostream>\nint main() {}' }, mode: 'run' })
    await session.cancelWarmupAndWait!()
    finish({ ok: false, status: 503 })
    expect(await preparing).toMatchObject({ success: true })
    vi.unstubAllGlobals()
  })
  it('fences a pending PCH transform when warmup is cancelled', async () => {
    let finish!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
    warmup.mockClear()
    const session = precompiledCppRuntimeProvider.createSession()
    const warming = session.warmup!({ files: { '/workspace/main.cpp': '#include <iostream>\nint main() {}' }, mode: 'run' })
    await session.cancelWarmupAndWait!()
    finish({ ok: false, status: 503 })
    expect(await warming).toMatchObject({ status: 'cancelled' })
    expect(warmup).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
