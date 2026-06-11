// Read-only session player: scrub or play through a recorded event stream
// and watch the student's workspace reconstruct itself — files, breakpoints,
// terminal, pause locations — alongside a skimmable activity feed.
//
// Deliberately NOT the IDE: a lightweight viewer with zero dependencies on
// IDE internals (no Monaco, no engine, no stores). It consumes plain
// ReplayEvent data, so it embeds anywhere the recording format reaches.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ReplayEvent } from './types'
import { basename } from './types'
import { ReplayTimeline } from './reconstruct'
import { buildFeed, stripAnsi, type FeedItem, type FeedKind } from './feed'

const FEED_TONE: Record<FeedKind, string> = {
  session: 'text-muted-foreground',
  edit: 'text-sky-400',
  file: 'text-sky-400',
  breakpoint: 'text-red-400',
  build: 'text-red-400',
  run: 'text-emerald-400',
  output: 'text-muted-foreground',
  exit: 'text-muted-foreground',
  debug: 'text-amber-400',
  other: 'text-muted-foreground',
}

const TICK_TONE: Partial<Record<FeedKind, string>> = {
  edit: 'bg-sky-500/70',
  run: 'bg-emerald-500/80',
  debug: 'bg-amber-500/80',
  build: 'bg-red-500/90',
  breakpoint: 'bg-red-400/80',
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
}

export function SessionReplay({
  events,
  header,
}: {
  // One session's events, ordered by clientTs.
  events: ReplayEvent[]
  // Optional host-supplied bar content (student name, session picker…).
  header?: ReactNode
}) {
  const timeline = useMemo(() => new ReplayTimeline(events), [events])
  const feed = useMemo(() => buildFeed(events), [events])
  const [index, setIndex] = useState(events.length - 1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  // When the user clicks a file tab we pin it until the recording itself
  // switches files again.
  const [pinnedFile, setPinnedFile] = useState<string | null>(null)

  // New event list (e.g. session switch): land on the end state, paused.
  // Adjusted during render (not in an effect) so the first paint of the
  // new session is already correct.
  const [prevEvents, setPrevEvents] = useState(events)
  if (events !== prevEvents) {
    setPrevEvents(events)
    setIndex(events.length - 1)
    setPlaying(false)
    setPinnedFile(null)
  }

  const state = timeline.stateAt(index)
  const startTs = events[0]?.clientTs ?? 0
  const currentTs = index >= 0 ? events[index].clientTs : startTs

  // Playback: advance one event at a time, compressing dead air. The
  // timer callback both advances and stops at the end, so the effect body
  // never sets state synchronously.
  useEffect(() => {
    if (!playing || index >= events.length - 1) return
    const gap = events[index + 1].clientTs - (index >= 0 ? events[index].clientTs : events[index + 1].clientTs)
    const delay = Math.min(Math.max(gap, 40), 1200) / speed
    const t = setTimeout(() => {
      const next = Math.min(index + 1, events.length - 1)
      setIndex(next)
      if (next >= events.length - 1) setPlaying(false)
    }, delay)
    return () => clearTimeout(t)
  }, [playing, index, speed, events])

  // The reconstruction's own active file wins whenever it changes —
  // render-phase adjustment, same pattern as the session switch above.
  const [prevAutoFile, setPrevAutoFile] = useState(state.activeFile)
  if (state.activeFile !== prevAutoFile) {
    setPrevAutoFile(state.activeFile)
    setPinnedFile(null)
  }

  const viewedFile = pinnedFile && state.files[pinnedFile] !== undefined
    ? pinnedFile
    : state.activeFile

  const fileNames = Object.keys(state.files).sort()
  const code = viewedFile ? state.files[viewedFile] ?? '' : ''
  // Plain derivation — files are a few KB; splitting per render is cheap
  // and keeps the render-phase state adjustments above legal.
  const lines = code.split('\n')
  const bps = viewedFile ? new Set(state.breakpoints[viewedFile] ?? []) : new Set<number>()
  const pausedLine = state.paused?.file === viewedFile ? state.paused.line : null

  // Keep the paused line and the current feed row in view.
  const pausedRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    pausedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [pausedLine, viewedFile])

  const currentFeedIdx = useMemo(() => {
    let last = -1
    for (let i = 0; i < feed.length; i++) {
      if (feed[i].index <= index) last = i
      else break
    }
    return last
  }, [feed, index])
  const feedRef = useRef<HTMLOListElement | null>(null)
  useEffect(() => {
    feedRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [currentFeedIdx])

  const terminalRef = useRef<HTMLPreElement | null>(null)
  useEffect(() => {
    const el = terminalRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.terminal])

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        No recorded activity in this session.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* Transport controls */}
      <div className="border-b px-3 py-2 flex items-center gap-3 text-sm flex-wrap">
        {header}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setIndex(-1); setPlaying(false) }}
            title="Jump to start"
            aria-label="Jump to start"
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            ⏮
          </button>
          <button
            onClick={() => {
              if (!playing && index >= events.length - 1) setIndex(-1)
              setPlaying((p) => !p)
            }}
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 font-medium"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
            className="bg-transparent border rounded px-1.5 py-1 text-xs"
          >
            {[1, 2, 4, 8].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          t+{fmtElapsed(currentTs - startTs)} · event {index + 1}/{events.length}
        </div>
        <div className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
          {state.running && !state.paused && (
            <span className="px-2 py-0.5 rounded-full border border-emerald-700 text-emerald-400">running</span>
          )}
          {state.paused && (
            <span className="px-2 py-0.5 rounded-full border border-amber-700 text-amber-400">
              paused{state.paused.file ? ` — ${basename(state.paused.file)}:${state.paused.line ?? '?'}` : ''}
            </span>
          )}
          {!state.running && state.lastExit !== null && (
            <span className={`px-2 py-0.5 rounded-full border ${state.lastExit === 0 ? 'text-muted-foreground' : 'border-red-700 text-red-400'}`}>
              exit {state.lastExit}
            </span>
          )}
        </div>
      </div>

      {/* Scrubber with category ticks */}
      <div className="border-b px-3 pt-2 pb-1.5">
        <input
          type="range"
          min={-1}
          max={events.length - 1}
          value={index}
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }}
          aria-label="Scrub through the session"
          className="w-full accent-[var(--color-primary,#3b82f6)]"
        />
        <div className="relative h-1.5 mt-0.5" aria-hidden>
          {feed.map((item) => {
            const tone = TICK_TONE[item.kind]
            if (!tone) return null
            const left = events.length > 1 ? (item.index / (events.length - 1)) * 100 : 0
            return (
              <span
                key={`${item.index}-${item.kind}`}
                className={`absolute top-0 h-full w-[2px] ${tone}`}
                style={{ left: `${left}%` }}
              />
            )
          })}
        </div>
      </div>

      {/* Workspace + side column */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(280px,38%)' }}>
        {/* Code pane */}
        <div className="min-w-0 flex flex-col border-r">
          <div className="flex items-center border-b text-xs overflow-x-auto shrink-0">
            {fileNames.length === 0 && (
              <span className="px-3 py-2 text-muted-foreground">No files yet</span>
            )}
            {fileNames.map((f) => (
              <button
                key={f}
                onClick={() => setPinnedFile(f)}
                className={
                  'px-3 py-2 border-r whitespace-nowrap font-mono ' +
                  (f === viewedFile
                    ? 'bg-accent/40 text-foreground'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {basename(f)}
              </button>
            ))}
          </div>
          {viewedFile && state.truncatedFiles[viewedFile] && (
            <div className="px-3 py-1 text-[11px] bg-amber-950/40 text-amber-400 border-b shrink-0">
              This snapshot was truncated by the recorder's size cap — the file was longer than shown.
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto font-mono text-[13px] leading-6">
            {lines.map((text, i) => {
              const ln = i + 1
              const isPaused = pausedLine === ln
              return (
                <div
                  key={ln}
                  ref={isPaused ? pausedRef : undefined}
                  className={'flex ' + (isPaused ? 'bg-amber-500/15' : '')}
                >
                  <span className="w-5 shrink-0 text-center select-none">
                    {isPaused
                      ? <span className="text-amber-400">▶</span>
                      : bps.has(ln) && <span className="text-red-500">●</span>}
                  </span>
                  <span className="w-10 shrink-0 pr-3 text-right select-none text-muted-foreground/60">
                    {ln}
                  </span>
                  <span className="whitespace-pre flex-1">{text}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Terminal + activity feed */}
        <div className="min-w-0 flex flex-col">
          <div className="h-[38%] min-h-[110px] flex flex-col border-b">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b shrink-0">
              Terminal
            </div>
            <pre
              ref={terminalRef}
              className="flex-1 min-h-0 overflow-auto px-3 py-2 text-[12px] leading-5 whitespace-pre-wrap font-mono text-emerald-100/90 bg-black/30"
            >
              {stripAnsi(state.terminal) || (state.running ? '' : '— no output —')}
            </pre>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b shrink-0">
              Activity
            </div>
            <ol ref={feedRef} className="flex-1 min-h-0 overflow-auto py-1">
              {feed.map((item: FeedItem, fi: number) => {
                const reached = item.index <= index
                const current = fi === currentFeedIdx
                return (
                  <li key={`${item.index}-${fi}`}>
                    <button
                      data-current={current || undefined}
                      onClick={() => { setPlaying(false); setIndex(item.index) }}
                      className={
                        'w-full text-left px-3 py-1 flex items-baseline gap-2 text-[12px] hover:bg-accent/40 ' +
                        (current ? 'bg-accent/60 ' : '') +
                        (reached ? '' : 'opacity-45')
                      }
                    >
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-16">
                        {fmtClock(item.ts)}
                      </span>
                      <span className={`truncate ${FEED_TONE[item.kind]}`}>{item.label}</span>
                      {item.detail && (
                        <span className="text-muted-foreground text-[11px] shrink-0">{item.detail}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
