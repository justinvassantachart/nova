// Dev-only harness for the session-replay viewer (/replay-demo, DEV builds
// only — see main.tsx). Feeds the viewer a synthetic recording so viewer
// work never needs a Firebase backend or a real student.

import { useMemo, useState } from 'react'
import { buildSessions } from './reconstruct'
import { SessionPicker } from './SessionPicker'
import { SessionReplay } from './SessionReplay'
import { demoEvents } from './demo-fixture'

export default function ReplayDemo() {
  const sessions = useMemo(() => buildSessions(demoEvents()), [])
  const [sessionId, setSessionId] = useState(sessions[sessions.length - 1]?.sessionId ?? '')
  const session = sessions.find((s) => s.sessionId === sessionId) ?? sessions[0]

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 text-sm flex items-center gap-3">
        <span className="font-semibold">Session replay — demo data</span>
        <span className="text-xs text-muted-foreground">
          synthetic recording; the real thing lives under a submission
        </span>
      </header>
      <div className="flex-1 min-h-0">
        <SessionReplay
          events={session?.events ?? []}
          header={
            <SessionPicker
              sessions={sessions}
              value={session?.sessionId ?? ''}
              onChange={setSessionId}
            />
          }
        />
      </div>
    </div>
  )
}
