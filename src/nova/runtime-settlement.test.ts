import { describe, expect, it, vi } from 'vitest'
import type { RuntimeSession } from 'web-ide'
import { settleStartupStop } from './runtime-settlement'

function fixture(stopped: boolean, exitCode?: number) {
  let emit: (code: number) => void = () => {}
  const session = settleStartupStop({
    events: { exit: { subscribe: (listener: (code: number) => void) => { emit = listener } } },
    start: async () => { if (exitCode !== undefined) emit(exitCode) },
    waitForSettlement: async () => stopped ? { type: 'stopped' } : { type: 'completed', exitCode: exitCode ?? 0 },
  } as unknown as RuntimeSession)
  const listener = vi.fn()
  session.events.exit.subscribe(listener)
  return { session, listener }
}
describe('startup Stop settlement', () => {
  it('publishes the stopped exit when initialization ended before the engine started', async () => {
    const { session, listener } = fixture(true)
    await session.start({ mode: 'run' })
    expect(listener).toHaveBeenCalledExactlyOnceWith(0)
  })
  it('does not duplicate a real Stop or program exit', async () => {
    for (const stopped of [true, false]) {
      const { session, listener } = fixture(stopped, 7)
      await session.start({ mode: 'run' })
      expect(listener).toHaveBeenCalledExactlyOnceWith(7)
    }
  })
  it('unsubscribes host listeners', async () => {
    const { session } = fixture(true)
    const listener = vi.fn()
    session.events.exit.subscribe(listener)()
    await session.start({ mode: 'run' })
    expect(listener).not.toHaveBeenCalled()
  })
})
