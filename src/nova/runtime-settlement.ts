import type { RuntimeSession } from 'web-ide'

/** Web IDE 0.10.0 can settle an early Stop before publishing its exit event. */
export function settleStartupStop(session: RuntimeSession): RuntimeSession {
  const listeners = new Set<(code: number) => void>()
  let exitSequence = 0
  let startSequence = 0
  const emit = (code: number) => {
    exitSequence++
    for (const listener of listeners) listener(code)
  }
  session.events.exit.subscribe(emit)
  const events = { ...session.events, exit: {
    subscribe(listener: (code: number) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  } }
  const start = session.start.bind(session)
  return Object.assign(session, {
    events,
    async start(request: Parameters<RuntimeSession['start']>[0]) {
      const run = ++startSequence
      const exitsBefore = exitSequence
      await start(request)
      const outcome = await session.waitForSettlement?.()
      // Publish only an actual stopped settlement with no corresponding exit.
      // Normal execution/debugger exits keep their original event and code.
      if (run === startSequence && outcome?.type === 'stopped' && exitSequence === exitsBefore) emit(0)
    },
  })
}
