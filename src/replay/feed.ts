// Human-readable activity feed derived from a session's event list.
// Noise control is the whole game: typing bursts collapse into one row,
// stdout chunks collapse into one row per run, and step→pause pairs merge
// into a single "stepped to" row, so a teacher skims minutes of work in a
// dozen lines.

import type { ReplayEvent } from './types'
import { basename } from './types'

export type FeedKind =
  | 'session' | 'edit' | 'file' | 'breakpoint'
  | 'build' | 'run' | 'output' | 'exit' | 'debug' | 'other'

export type FeedItem = {
  // Event index this row represents — scrubbing target when clicked.
  index: number
  ts: number
  kind: FeedKind
  label: string
  detail?: string
}

const STEP_LABEL: Record<string, string> = {
  debug_step_into: 'Stepped into',
  debug_step_over: 'Stepped over',
  debug_step_out: 'Stepped out',
}

function pausedSuffix(p: Record<string, unknown>): string {
  const file = typeof p.file === 'string' ? basename(p.file) : null
  const line = typeof p.line === 'number' ? p.line : null
  const func = typeof p.func === 'string' && p.func ? p.func : null
  const loc = file ? `${file}${line !== null ? `:${line}` : ''}` : null
  if (loc && func) return `${loc} (${func})`
  return loc ?? func ?? ''
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

export function buildFeed(events: ReplayEvent[]): FeedItem[] {
  const items: FeedItem[] = []
  let i = 0
  while (i < events.length) {
    const ev = events[i]
    const p = ev.payload ?? {}
    switch (ev.type) {
      case 'session_start': {
        const n = Object.keys((p.files as object) ?? {}).length
        items.push({ index: i, ts: ev.clientTs, kind: 'session', label: 'Session started', detail: `${n} file${n === 1 ? '' : 's'}` })
        i++
        break
      }
      case 'edit': {
        // Collapse a run of edits to the same file; land on the LAST one
        // so clicking the row shows the burst's final text.
        const file = String(p.file ?? '')
        let j = i
        while (
          j + 1 < events.length
          && events[j + 1].type === 'edit'
          && String(events[j + 1].payload?.file ?? '') === file
        ) j++
        const count = j - i + 1
        items.push({
          index: j,
          ts: events[j].clientTs,
          kind: 'edit',
          label: `Edited ${basename(file)}`,
          detail: count > 1 ? `×${count}` : undefined,
        })
        i = j + 1
        break
      }
      case 'terminal_stdout': {
        let j = i
        let chars = 0
        while (j < events.length && events[j].type === 'terminal_stdout') {
          chars += String(events[j].payload?.text ?? '').length
          j++
        }
        items.push({
          index: j - 1,
          ts: events[i].clientTs,
          kind: 'output',
          label: 'Program output',
          detail: `${chars} chars`,
        })
        i = j
        break
      }
      case 'debug_step_into':
      case 'debug_step_over':
      case 'debug_step_out': {
        // Merge with the pause that lands right after the step.
        const next = events[i + 1]
        if (next?.type === 'debug_paused') {
          const where = pausedSuffix(next.payload ?? {})
          items.push({
            index: i + 1,
            ts: ev.clientTs,
            kind: 'debug',
            label: `${STEP_LABEL[ev.type]}${where ? ` → ${where}` : ''}`,
          })
          i += 2
        } else {
          items.push({ index: i, ts: ev.clientTs, kind: 'debug', label: STEP_LABEL[ev.type] })
          i++
        }
        break
      }
      case 'debug_paused': {
        const where = pausedSuffix(p)
        items.push({ index: i, ts: ev.clientTs, kind: 'debug', label: `Paused${where ? ` at ${where}` : ''}` })
        i++
        break
      }
      case 'breakpoint_toggle': {
        const file = typeof p.file === 'string' ? basename(p.file) : '?'
        const line = typeof p.line === 'number' ? p.line : '?'
        const on = p.on !== false
        items.push({
          index: i,
          ts: ev.clientTs,
          kind: 'breakpoint',
          label: `Breakpoint ${on ? 'set' : 'removed'} — ${file}:${line}`,
        })
        i++
        break
      }
      case 'run':
        items.push({ index: i, ts: ev.clientTs, kind: 'run', label: p.debug === true ? 'Started debugging' : 'Ran the program' })
        i++
        break
      case 'run_tests':
        items.push({ index: i, ts: ev.clientTs, kind: 'run', label: 'Ran the tests' })
        i++
        break
      case 'compile':
      case 'compile_debug':
      case 'compile_test':
        // The matching run/run_tests row already tells the story.
        i++
        break
      case 'compile_error':
        items.push({ index: i, ts: ev.clientTs, kind: 'build', label: 'Compile error' })
        i++
        break
      case 'program_exit': {
        const code = typeof p.code === 'number' ? p.code : 0
        items.push({
          index: i,
          ts: ev.clientTs,
          kind: 'exit',
          label: `Program exited`,
          detail: `code ${code}`,
        })
        i++
        break
      }
      case 'debug_continue':
        items.push({ index: i, ts: ev.clientTs, kind: 'debug', label: 'Continued' })
        i++
        break
      case 'debug_restart':
        items.push({ index: i, ts: ev.clientTs, kind: 'debug', label: 'Restarted debugging' })
        i++
        break
      case 'debug_step_back':
        items.push({ index: i, ts: ev.clientTs, kind: 'debug', label: 'Stepped back in history' })
        i++
        break
      case 'debug_step_forward':
        items.push({ index: i, ts: ev.clientTs, kind: 'debug', label: 'Stepped forward in history' })
        i++
        break
      case 'file_create':
        items.push({ index: i, ts: ev.clientTs, kind: 'file', label: `Created ${basename(String(p.path ?? '?'))}` })
        i++
        break
      case 'file_rename':
        items.push({
          index: i,
          ts: ev.clientTs,
          kind: 'file',
          label: `Renamed ${basename(String(p.from ?? '?'))} → ${basename(String(p.to ?? '?'))}`,
        })
        i++
        break
      case 'file_delete':
        items.push({ index: i, ts: ev.clientTs, kind: 'file', label: `Deleted ${basename(String(p.path ?? '?'))}` })
        i++
        break
      case 'breakpoints_validated':
        // Engine bookkeeping — state-relevant but not narrative.
        i++
        break
      default: {
        // Host-domain events (lesson_*…) and future types still show up,
        // prettified, instead of disappearing.
        const label = ev.type.replace(/[_-]+/g, ' ')
        items.push({ index: i, ts: ev.clientTs, kind: 'other', label: label.charAt(0).toUpperCase() + label.slice(1) })
        i++
        break
      }
    }
  }
  return items
}
