// Session-replay data model. Everything here is plain, JSON-serializable
// data — the replay module consumes an ordered list of recorded host
// events (the IDEHost.onEvent stream a host chose to persist) and
// reconstructs what the student's workspace looked like at any moment.
//
// IMPORTANT: this module must stay free of IDE-internal and LMS imports.
// It depends only on the event VOCABULARY (string types + payload shapes
// documented in src/ide-host.ts), not on the IDE's implementation, so it
// works against any host's recording — Firestore, a JSON file, a fixture.

export type ReplayEvent = {
  type: string
  payload: Record<string, unknown>
  // Client wall-clock millis; the ordering + playback-gap key.
  clientTs: number
  sessionId: string
}

export type PausedLocation = {
  file: string | null
  line: number | null
  func: string | null
}

// The reconstructed IDE-visible state after applying a prefix of events.
export type SessionState = {
  // '/workspace/...'-keyed file contents.
  files: Record<string, string>
  // The file the student was plausibly looking at (last touched).
  activeFile: string | null
  // Sorted breakpoint lines per file.
  breakpoints: Record<string, number[]>
  // Raw terminal text for the most recent run (ANSI sequences intact —
  // strip at render time).
  terminal: string
  running: boolean
  debugging: boolean
  paused: PausedLocation | null
  lastExit: number | null
  // Files whose most recent snapshot was truncated by the recorder's
  // content cap — the viewer shows a notice instead of silently lying.
  truncatedFiles: Record<string, true>
}

export type ReplaySession = {
  sessionId: string
  events: ReplayEvent[]
  startTs: number
  endTs: number
}

export function normPath(p: string): string {
  return p.startsWith('/workspace/') ? p : `/workspace/${p.replace(/^\/+/, '')}`
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}
