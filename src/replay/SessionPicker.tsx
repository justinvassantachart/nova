// Dropdown over a submission's recorded sessions: "Session 2 — Jun 11,
// 3:40 PM (12 min, 84 events)". Pure presentational; pages own the state.

import type { ReplaySession } from './types'

function fmtStart(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 1) return '<1 min'
  return `${min} min`
}

function sessionLabel(s: ReplaySession, ordinal: number): string {
  return `Session ${ordinal} — ${fmtStart(s.startTs)} (${fmtDuration(s.endTs - s.startTs)}, ${s.events.length} events)`
}

export function SessionPicker({
  sessions,
  value,
  onChange,
}: {
  sessions: ReplaySession[]
  value: string
  onChange: (sessionId: string) => void
}) {
  if (sessions.length === 0) return null
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Recorded session"
      className="bg-transparent border rounded px-1.5 py-1 text-xs max-w-[320px]"
    >
      {sessions.map((s, i) => (
        <option key={s.sessionId} value={s.sessionId}>
          {sessionLabel(s, i + 1)}
        </option>
      ))}
    </select>
  )
}
