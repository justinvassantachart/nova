import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebIDEInstanceHandle } from 'web-ide'
import { scheduleInitialWarmup } from './initial-warmup'

function fixture() {
  vi.useFakeTimers()
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', document)
  let listener = () => {}
  const state = { workspace: {} as Record<string, string>, debug: { debugMode: 'idle' } }
  const warmup = vi.fn(async () => ({ status: 'completed' }))
  const cancelWarmup = vi.fn(async () => {})
  const releaseCompilerResources = vi.fn(async () => 'released')
  const instance = { snapshot: () => state, subscribe: (fn: () => void) => { listener = fn; return vi.fn() },
    warmup, cancelWarmup, releaseCompilerResources } as unknown as WebIDEInstanceHandle
  const cleanup = scheduleInitialWarmup(instance)
  return { state, warmup, cancelWarmup, releaseCompilerResources, document, cleanup, change: () => listener() }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('initial compiler warmup', () => {
  it('waits for workspace admission and warms only once, without warming edits', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.warmup).not.toHaveBeenCalled()
    f.state.workspace['/workspace/main.cpp'] = 'int main() {}'
    f.change()
    await vi.advanceTimersByTimeAsync(750)
    expect(f.warmup).toHaveBeenCalledTimes(1)
    f.change()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.warmup).toHaveBeenCalledTimes(1)
    f.cleanup()
  })
  it('foreground work suppresses a scheduled attempt even after it finishes', async () => {
    const f = fixture()
    f.state.workspace['main.cpp'] = 'int main() {}'; f.change()
    f.state.debug.debugMode = 'compiling'; f.change()
    f.state.debug.debugMode = 'idle'; f.change()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.warmup).not.toHaveBeenCalled()
    f.cleanup()
  })
  it('navigation cancels a pending callback and drains warmup', async () => {
    const f = fixture()
    f.state.workspace['main.cpp'] = 'int main() {}'; f.change()
    f.cleanup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.warmup).not.toHaveBeenCalled()
    expect(f.cancelWarmup).toHaveBeenCalledOnce()
  })
  it('hidden tabs release compiler resources and defer initial preparation', async () => {
    const f = fixture()
    f.state.workspace['main.cpp'] = 'int main() {}'; f.change()
    f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.warmup).not.toHaveBeenCalled()
    expect(f.releaseCompilerResources).toHaveBeenCalledOnce()
    f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(750)
    expect(f.warmup).toHaveBeenCalledOnce()
    f.cleanup()
  })
})
