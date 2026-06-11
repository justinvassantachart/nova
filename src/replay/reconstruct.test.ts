import { describe, expect, it } from 'vitest'
import type { ReplayEvent, SessionState } from './types'
import { buildSessions, initialState, reduceEvent, ReplayTimeline } from './reconstruct'
import { buildFeed, stripAnsi } from './feed'

let ts = 1000
function ev(type: string, payload: Record<string, unknown> = {}, sessionId = 's1'): ReplayEvent {
    return { type, payload, clientTs: ts++, sessionId }
}

function fold(events: ReplayEvent[]): SessionState {
    return events.reduce(reduceEvent, initialState())
}

describe('reduceEvent — workspace', () => {
    it('seeds files from session_start and picks main.cpp as active', () => {
        const s = fold([
            ev('session_start', { files: { 'main.cpp': 'int main() {}', '/workspace/notes.txt': 'hi' } }),
        ])
        expect(s.files).toEqual({
            '/workspace/main.cpp': 'int main() {}',
            '/workspace/notes.txt': 'hi',
        })
        expect(s.activeFile).toBe('/workspace/main.cpp')
    })

    it('applies edit content and tracks the active file', () => {
        const s = fold([
            ev('session_start', { files: { 'main.cpp': 'old' } }),
            ev('edit', { file: '/workspace/main.cpp', content: 'new text', length: 8 }),
        ])
        expect(s.files['/workspace/main.cpp']).toBe('new text')
        expect(s.activeFile).toBe('/workspace/main.cpp')
    })

    it('keeps prior content for legacy edits without content', () => {
        const s = fold([
            ev('session_start', { files: { 'main.cpp': 'old' } }),
            ev('edit', { file: 'main.cpp', length: 99 }),
        ])
        expect(s.files['/workspace/main.cpp']).toBe('old')
    })

    it('tracks truncated snapshots per file and clears the flag on a full one', () => {
        const a = fold([
            ev('edit', { file: 'big.cpp', content: 'partial', truncated: true }),
        ])
        expect(a.truncatedFiles['/workspace/big.cpp']).toBe(true)
        const b = [
            ev('edit', { file: 'big.cpp', content: 'partial', truncated: true }),
            ev('edit', { file: 'big.cpp', content: 'small now' }),
        ].reduce(reduceEvent, initialState())
        expect(b.truncatedFiles['/workspace/big.cpp']).toBeUndefined()
    })

    it('creates, renames (with folder prefixes), and deletes files', () => {
        const created = fold([ev('file_create', { path: 'tests.cpp', kind: 'file' })])
        expect(created.files['/workspace/tests.cpp']).toBe('')
        expect(created.activeFile).toBe('/workspace/tests.cpp')

        const renamed = fold([
            ev('session_start', { files: { 'src/a.cpp': 'A', 'src/b.cpp': 'B' } }),
            ev('breakpoint_toggle', { file: 'src/a.cpp', line: 3, on: true }),
            ev('file_rename', { from: '/workspace/src', to: '/workspace/lib' }),
        ])
        expect(Object.keys(renamed.files).sort()).toEqual([
            '/workspace/lib/a.cpp', '/workspace/lib/b.cpp',
        ])
        expect(renamed.breakpoints['/workspace/lib/a.cpp']).toEqual([3])

        const deleted = fold([
            ev('session_start', { files: { 'main.cpp': 'M', 'extra.cpp': 'E' } }),
            ev('edit', { file: 'extra.cpp', content: 'E2' }),
            ev('file_delete', { path: 'extra.cpp' }),
        ])
        expect(deleted.files).toEqual({ '/workspace/main.cpp': 'M' })
        // Active file fell back after its deletion.
        expect(deleted.activeFile).toBe('/workspace/main.cpp')
    })

    it('folders are not files', () => {
        const s = fold([ev('file_create', { path: 'src', kind: 'folder' })])
        expect(s.files).toEqual({})
    })
})

describe('reduceEvent — breakpoints', () => {
    it('honors the recorded post-toggle state and sorts lines', () => {
        const s = fold([
            ev('breakpoint_toggle', { file: 'main.cpp', line: 9, on: true }),
            ev('breakpoint_toggle', { file: 'main.cpp', line: 3, on: true }),
        ])
        expect(s.breakpoints['/workspace/main.cpp']).toEqual([3, 9])
        const off = reduceEvent(s, ev('breakpoint_toggle', { file: 'main.cpp', line: 9, on: false }))
        expect(off.breakpoints['/workspace/main.cpp']).toEqual([3])
    })

    it('falls back to flip semantics for legacy events without `on`', () => {
        const s = fold([
            ev('breakpoint_toggle', { file: 'main.cpp', line: 5 }),
            ev('breakpoint_toggle', { file: 'main.cpp', line: 5 }),
        ])
        expect(s.breakpoints['/workspace/main.cpp']).toBeUndefined()
    })

    it('breakpoints_validated replaces a file’s set wholesale', () => {
        const s = fold([
            ev('breakpoint_toggle', { file: 'main.cpp', line: 4, on: true }),
            ev('breakpoints_validated', { file: 'main.cpp', lines: [5, 12] }),
        ])
        expect(s.breakpoints['/workspace/main.cpp']).toEqual([5, 12])
    })
})

describe('reduceEvent — runs, terminal, debugging', () => {
    it('run clears the terminal and stdout accumulates', () => {
        const s = fold([
            ev('run', { debug: false }),
            ev('terminal_stdout', { text: 'old run\n' }),
            ev('program_exit', { code: 0 }),
            ev('run', { debug: false }),
            ev('terminal_stdout', { text: 'hello ' }),
            ev('terminal_stdout', { text: 'world', stream: 'stderr' }),
        ])
        expect(s.terminal).toBe('hello world')
        expect(s.running).toBe(true)
        expect(s.lastExit).toBeNull()
    })

    it('program_exit lands the exit code and stops everything', () => {
        const s = fold([
            ev('run', { debug: true }),
            ev('debug_paused', { file: 'main.cpp', line: 7, func: 'main' }),
            ev('debug_continue', {}),
            ev('program_exit', { code: 3 }),
        ])
        expect(s).toMatchObject({ running: false, debugging: false, paused: null, lastExit: 3 })
    })

    it('tracks pause locations and mirrors the IDE’s file jump', () => {
        const s = fold([
            ev('session_start', { files: { 'main.cpp': '', 'tests.cpp': '' } }),
            ev('edit', { file: 'tests.cpp', content: 'x' }),
            ev('run', { debug: true }),
            ev('debug_paused', { file: '/workspace/main.cpp', line: 12, func: 'reverse' }),
        ])
        expect(s.paused).toEqual({ file: '/workspace/main.cpp', line: 12, func: 'reverse' })
        expect(s.activeFile).toBe('/workspace/main.cpp')
        expect(s.debugging).toBe(true)

        const stepped = reduceEvent(s, ev('debug_step_over', {}))
        expect(stepped.paused).toEqual(s.paused) // step keeps last location until next pause
        const continued = reduceEvent(s, ev('debug_continue', {}))
        expect(continued.paused).toBeNull()
    })

    it('compile_error stops the run without an exit code', () => {
        const s = fold([ev('run', { debug: false }), ev('compile_error', { debug: false })])
        expect(s).toMatchObject({ running: false, lastExit: null })
    })
})

describe('ReplayTimeline', () => {
    function randomLog(n: number): ReplayEvent[] {
        // Deterministic pseudo-random log exercising every reducer branch.
        let seed = 42
        const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
        const files = ['main.cpp', 'tests.cpp', 'list.h']
        const out: ReplayEvent[] = [
            ev('session_start', { files: { 'main.cpp': 'seed' } }),
        ]
        for (let i = 0; i < n; i++) {
            const r = rnd()
            const file = files[Math.floor(rnd() * files.length)]
            if (r < 0.35) out.push(ev('edit', { file, content: `v${i}`, length: 3 }))
            else if (r < 0.45) out.push(ev('breakpoint_toggle', { file, line: 1 + Math.floor(rnd() * 30) }))
            else if (r < 0.55) out.push(ev('run', { debug: rnd() < 0.5 }))
            else if (r < 0.7) out.push(ev('terminal_stdout', { text: `out${i};` }))
            else if (r < 0.78) out.push(ev('debug_paused', { file, line: i % 20, func: 'f' }))
            else if (r < 0.84) out.push(ev('program_exit', { code: i % 3 }))
            else if (r < 0.9) out.push(ev('file_create', { path: `extra${i % 4}.cpp`, kind: 'file' }))
            else if (r < 0.95) out.push(ev('debug_continue', {}))
            else out.push(ev('file_delete', { path: `extra${i % 4}.cpp` }))
        }
        return out
    }

    it('stateAt matches a naive fold at every index (checkpoint boundaries included)', () => {
        const log = randomLog(300)
        const timeline = new ReplayTimeline(log, 37) // odd interval to stress boundaries
        let naive = initialState()
        expect(timeline.stateAt(-1)).toEqual(naive)
        for (let i = 0; i < log.length; i++) {
            naive = reduceEvent(naive, log[i])
            expect(timeline.stateAt(i), `index ${i}`).toEqual(naive)
        }
    })

    it('random access after sequential playback stays correct', () => {
        const log = randomLog(120)
        const timeline = new ReplayTimeline(log, 25)
        for (let i = 0; i < 60; i++) timeline.stateAt(i) // play forward
        const jumpBack = timeline.stateAt(10)
        const naive = log.slice(0, 11).reduce(reduceEvent, initialState())
        expect(jumpBack).toEqual(naive)
    })

    it('clamps out-of-range indices', () => {
        const log = randomLog(10)
        const timeline = new ReplayTimeline(log, 4)
        expect(timeline.stateAt(-99)).toEqual(initialState())
        expect(timeline.stateAt(999)).toEqual(timeline.stateAt(log.length - 1))
    })
})

describe('buildSessions', () => {
    it('groups by sessionId and orders sessions by start time', () => {
        const events = [
            ev('run', {}, 'b'),
            ev('edit', { file: 'a' }, 'a'),
            ev('run', {}, 'a'),
            ev('edit', { file: 'b' }, 'b'),
        ]
        // Make session "a" start earlier despite appearing second.
        events[1].clientTs = 1
        events[2].clientTs = 2
        const sessions = buildSessions(events)
        expect(sessions.map((s) => s.sessionId)).toEqual(['a', 'b'])
        expect(sessions[0].events).toHaveLength(2)
        expect(sessions[0].startTs).toBe(1)
        expect(sessions[1].endTs).toBeGreaterThanOrEqual(sessions[1].startTs)
    })
})

describe('buildFeed', () => {
    it('collapses edit bursts per file and lands on the burst’s last event', () => {
        const log = [
            ev('edit', { file: 'main.cpp', content: '1' }),
            ev('edit', { file: 'main.cpp', content: '12' }),
            ev('edit', { file: 'main.cpp', content: '123' }),
            ev('edit', { file: 'tests.cpp', content: 'T' }),
        ]
        const feed = buildFeed(log)
        expect(feed).toHaveLength(2)
        expect(feed[0]).toMatchObject({ label: 'Edited main.cpp', detail: '×3', index: 2 })
        expect(feed[1]).toMatchObject({ label: 'Edited tests.cpp', index: 3 })
    })

    it('merges stdout runs and step→pause pairs', () => {
        const log = [
            ev('run', { debug: true }),
            ev('terminal_stdout', { text: 'a' }),
            ev('terminal_stdout', { text: 'bc' }),
            ev('debug_paused', { file: 'main.cpp', line: 5, func: 'main' }),
            ev('debug_step_over', {}),
            ev('debug_paused', { file: 'main.cpp', line: 6, func: 'main' }),
            ev('program_exit', { code: 0 }),
        ]
        const labels = buildFeed(log).map((f) => f.label)
        expect(labels).toEqual([
            'Started debugging',
            'Program output',
            'Paused at main.cpp:5 (main)',
            'Stepped over → main.cpp:6 (main)',
            'Program exited',
        ])
    })

    it('describes breakpoints, files, errors, and unknown host events', () => {
        const labels = buildFeed([
            ev('breakpoint_toggle', { file: '/workspace/main.cpp', line: 12, on: true }),
            ev('breakpoint_toggle', { file: '/workspace/main.cpp', line: 12, on: false }),
            ev('file_rename', { from: 'a.cpp', to: 'b.cpp' }),
            ev('compile_error', { debug: false }),
            ev('lesson_step_complete', { step: 'fix' }),
        ]).map((f) => f.label)
        expect(labels).toEqual([
            'Breakpoint set — main.cpp:12',
            'Breakpoint removed — main.cpp:12',
            'Renamed a.cpp → b.cpp',
            'Compile error',
            'Lesson step complete',
        ])
    })

    it('stripAnsi removes color sequences', () => {
        expect(stripAnsi('\x1b[31merror\x1b[0m: boom')).toBe('error: boom')
    })
})
