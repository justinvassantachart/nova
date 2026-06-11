// Pure reconstruction core: replay = a fold of recorded events over an
// empty workspace. `reduceEvent` is the single source of truth for what
// each event means; `ReplayTimeline` makes random access (scrubbing) fast
// with periodic checkpoints; `buildSessions` splits a submission's full
// event log into per-visit sessions.

import type { PausedLocation, ReplayEvent, ReplaySession, SessionState } from './types'
import { normPath } from './types'

export function initialState(): SessionState {
  return {
    files: {},
    activeFile: null,
    breakpoints: {},
    terminal: '',
    running: false,
    debugging: false,
    paused: null,
    lastExit: null,
    truncatedFiles: {},
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Pick the file a fresh session most plausibly shows first.
function defaultActiveFile(files: Record<string, string>): string | null {
  const keys = Object.keys(files).sort()
  return keys.find((k) => k.endsWith('/main.cpp')) ?? keys[0] ?? null
}

function withBreakpoints(
  state: SessionState,
  file: string,
  lines: number[],
): SessionState {
  const breakpoints = { ...state.breakpoints }
  if (lines.length === 0) delete breakpoints[file]
  else breakpoints[file] = [...lines].sort((a, b) => a - b)
  return { ...state, breakpoints }
}

// Move every key under `from` (a file, or a folder prefix) to `to`.
function renamePaths<T>(map: Record<string, T>, from: string, to: string): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    if (key === from) out[to] = value
    else if (key.startsWith(from + '/')) out[to + key.slice(from.length)] = value
    else out[key] = value
  }
  return out
}

function deletePaths<T>(map: Record<string, T>, path: string): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    if (key === path || key.startsWith(path + '/')) continue
    out[key] = value
  }
  return out
}

export function reduceEvent(state: SessionState, ev: ReplayEvent): SessionState {
  const p = ev.payload ?? {}
  switch (ev.type) {
    case 'session_start': {
      const seed = (p.files ?? {}) as Record<string, unknown>
      const files: Record<string, string> = {}
      for (const [key, value] of Object.entries(seed)) {
        if (typeof value === 'string') files[normPath(key)] = value
      }
      return { ...initialState(), files, activeFile: defaultActiveFile(files) }
    }

    case 'edit': {
      const file = str(p.file)
      if (!file) return state
      const path = normPath(file)
      const next: SessionState = { ...state, activeFile: path }
      const content = str(p.content)
      if (content !== null) {
        next.files = { ...state.files, [path]: content }
        const truncatedFiles = { ...state.truncatedFiles }
        if (p.truncated === true) truncatedFiles[path] = true
        else delete truncatedFiles[path]
        next.truncatedFiles = truncatedFiles
      }
      return next
    }

    case 'file_create': {
      const path = str(p.path)
      if (!path) return state
      if (p.kind === 'folder') return state
      const norm = normPath(path)
      return {
        ...state,
        files: { ...state.files, [norm]: state.files[norm] ?? '' },
        activeFile: norm,
      }
    }

    case 'file_rename': {
      const from = str(p.from)
      const to = str(p.to)
      if (!from || !to) return state
      const f = normPath(from)
      const t = normPath(to)
      return {
        ...state,
        files: renamePaths(state.files, f, t),
        breakpoints: renamePaths(state.breakpoints, f, t),
        truncatedFiles: renamePaths(state.truncatedFiles, f, t),
        activeFile: state.activeFile === f ? t : state.activeFile,
      }
    }

    case 'file_delete': {
      const path = str(p.path)
      if (!path) return state
      const norm = normPath(path)
      const gone = state.activeFile === norm || state.activeFile?.startsWith(norm + '/')
      const files = deletePaths(state.files, norm)
      return {
        ...state,
        files,
        breakpoints: deletePaths(state.breakpoints, norm),
        truncatedFiles: deletePaths(state.truncatedFiles, norm),
        activeFile: gone ? defaultActiveFile(files) : state.activeFile,
      }
    }

    case 'breakpoint_toggle': {
      const file = str(p.file)
      const line = num(p.line)
      if (!file || line === null) return state
      const path = normPath(file)
      const current = state.breakpoints[path] ?? []
      // `on` is the post-toggle state when recorded; legacy events without
      // it fall back to flip semantics.
      const on = typeof p.on === 'boolean' ? p.on : !current.includes(line)
      const lines = on
        ? current.includes(line) ? current : [...current, line]
        : current.filter((l) => l !== line)
      return withBreakpoints(state, path, lines)
    }

    case 'breakpoints_validated': {
      const file = str(p.file)
      if (!file) return state
      const lines = Array.isArray(p.lines)
        ? p.lines.filter((l): l is number => typeof l === 'number')
        : []
      return withBreakpoints(state, normPath(file), lines)
    }

    case 'run':
    case 'run_tests':
      return {
        ...state,
        terminal: '',
        running: true,
        debugging: ev.type === 'run' && p.debug === true,
        paused: null,
        lastExit: null,
      }

    case 'terminal_stdout': {
      const text = str(p.text)
      if (text === null) return state
      return { ...state, terminal: state.terminal + text }
    }

    case 'program_exit':
      return {
        ...state,
        running: false,
        debugging: false,
        paused: null,
        lastExit: num(p.code) ?? 0,
      }

    case 'compile_error':
      // The program never started; the engine's diagnostic text arrives
      // through the terminal stream.
      return { ...state, running: false, debugging: false, paused: null }

    case 'debug_paused': {
      const file = str(p.file)
      const paused: PausedLocation = {
        file: file ? normPath(file) : null,
        line: num(p.line),
        func: str(p.func),
      }
      return {
        ...state,
        debugging: true,
        paused,
        // The IDE jumps to the paused file; mirror it.
        activeFile: paused.file ?? state.activeFile,
      }
    }

    case 'debug_continue':
      return { ...state, paused: null }

    case 'debug_restart':
      return { ...state, paused: null }

    // Step actions un-pause momentarily; the following debug_paused event
    // re-establishes the location. History navigation (step_back/forward)
    // doesn't change live program state at all.
    case 'debug_step_into':
    case 'debug_step_over':
    case 'debug_step_out':
    case 'debug_step_back':
    case 'debug_step_forward':
    default:
      return state
  }
}

// State after events[0..index] (inclusive); index -1 is the empty initial
// state. Checkpoints every `checkpointEvery` events make scrubbing O(K)
// instead of O(n), and a one-step cache makes sequential playback O(1).
export class ReplayTimeline {
  readonly events: ReplayEvent[]
  private readonly every: number
  // checkpoints[k] = state after events[0 .. k*every - 1]
  private readonly checkpoints: SessionState[] = []
  private cache: { index: number; state: SessionState } | null = null

  constructor(events: ReplayEvent[], checkpointEvery = 200) {
    this.events = events
    this.every = Math.max(1, checkpointEvery)
    let state = initialState()
    this.checkpoints.push(state)
    for (let i = 0; i < events.length; i++) {
      state = reduceEvent(state, events[i])
      if ((i + 1) % this.every === 0) this.checkpoints.push(state)
    }
  }

  get length(): number {
    return this.events.length
  }

  stateAt(index: number): SessionState {
    const clamped = Math.max(-1, Math.min(index, this.events.length - 1))
    if (this.cache && this.cache.index === clamped) return this.cache.state
    // Sequential playback: extend the cached state by one event.
    if (this.cache && clamped === this.cache.index + 1) {
      const state = reduceEvent(this.cache.state, this.events[clamped])
      this.cache = { index: clamped, state }
      return state
    }
    const checkpoint = Math.min(
      Math.floor((clamped + 1) / this.every),
      this.checkpoints.length - 1,
    )
    let state = this.checkpoints[checkpoint]
    for (let i = checkpoint * this.every; i <= clamped; i++) {
      state = reduceEvent(state, this.events[i])
    }
    this.cache = { index: clamped, state }
    return state
  }
}

// Split a submission's full event log into sessions (one per IDE visit),
// ordered chronologically. Events inside a session keep log order after a
// stable sort by clientTs.
export function buildSessions(events: ReplayEvent[]): ReplaySession[] {
  const sorted = [...events].sort((a, b) => a.clientTs - b.clientTs)
  const byId = new Map<string, ReplayEvent[]>()
  for (const ev of sorted) {
    const list = byId.get(ev.sessionId)
    if (list) list.push(ev)
    else byId.set(ev.sessionId, [ev])
  }
  return [...byId.values()]
    .map((list) => ({
      sessionId: list[0].sessionId,
      events: list,
      startTs: list[0].clientTs,
      endTs: list[list.length - 1].clientTs,
    }))
    .sort((a, b) => a.startTs - b.startTs)
}
