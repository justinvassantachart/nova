// Guided-lesson data model.
//
// A lesson is plain, JSON-serializable data: starter files plus an ordered
// list of steps, where each step carries instructional prose and a CheckSpec
// describing the observable IDE state that completes it. The lesson runner
// (src/lessons/LessonRunner.tsx) hosts the IDE through the public IDEHost
// contract and evaluates checks against the IDE's state stores — the IDE
// itself has no knowledge of lessons. Anyone embedding the IDE component in
// their own platform can ship their own lesson content by constructing
// these objects; nothing here imports from the IDE internals.

import type { EventType } from '@/ide-host'

// ── Checks ──────────────────────────────────────────────────────
//
// Line numbers are never hard-coded. Checks that target a source line carry
// an `anchor`: a substring of that line's text. The line is resolved against
// the CURRENT file content at evaluation time, so checks keep working while
// the learner edits the file above the target. Regexes are stored as source
// strings to keep lessons serializable.

export type CheckSpec =
    // Learner clicks "Continue" — for prose-only steps.
    | { kind: 'manual' }
    // An instrumented IDE action fired at least `count` times (default 1)
    // since the lesson page loaded, e.g. 'debug_step_over' or 'run'.
    | { kind: 'event'; event: EventType; count?: number; label?: string }
    // A breakpoint exists on the line containing `anchor`.
    | { kind: 'breakpoint'; anchor: string; file?: string; label?: string }
    // Execution is paused. Optional constraints: on the line containing
    // `anchor`, and/or inside a function whose name contains `func`.
    | { kind: 'paused'; anchor?: string; func?: string; file?: string; label?: string }
    // While paused, a variable in the visible stack frames has this value.
    // `equals` compares trimmed string forms; `contains` is a substring
    // match. Optionally restrict to frames of `func`.
    | { kind: 'variable'; name: string; equals?: string; contains?: string; func?: string; label?: string }
    // The call stack holds at least `minCount` frames of `func`.
    | { kind: 'call-stack'; func: string; minCount: number; label?: string }
    // The heap holds at least `minAllocations` live allocations (paused).
    | { kind: 'heap'; minAllocations: number; label?: string }
    // The current run's terminal output contains `includes`, or matches
    // `matches` (a regex source string; `flags` defaults to 'm').
    | { kind: 'stdout'; includes?: string; matches?: string; flags?: string; label?: string }
    // The program finished. If `code` is given, it must match the exit code.
    | { kind: 'program-exit'; code?: number; label?: string }
    // The file's current content matches `matches` (regex source string).
    // With `absent: true` the check passes when the pattern does NOT match.
    | { kind: 'code'; matches: string; flags?: string; file?: string; absent?: boolean; label?: string }
    // The student-test suite state: at least `minTotal` tests declared and,
    // when `allPass` is set, every completed test passing. `minFailed`
    // gates on at least that many failures (for "watch a test fail" steps).
    | { kind: 'tests'; minTotal?: number; allPass?: boolean; minFailed?: number; label?: string }
    // A specific right-panel tab is open ('variables' | 'graph' | 'canvas' | 'tests').
    | { kind: 'right-tab'; tab: string; label?: string }
    // Composites. `all` renders its children as a live checklist.
    | { kind: 'all'; of: CheckSpec[] }
    | { kind: 'any'; of: CheckSpec[]; label?: string }

// ── Steps & lessons ─────────────────────────────────────────────

export type LessonStep = {
    id: string
    title: string
    // Markdown-lite (see markdown.tsx): paragraphs, **bold**, *italic*,
    // `inline code`, ```fenced blocks```, and "- " bullet lists.
    body: string
    check: CheckSpec
    // Shown inside a collapsed "Hint" disclosure.
    hint?: string
    // One-liner shown in the success banner when the check passes.
    successNote?: string
}

export type Lesson = {
    // Stable id; also the OPFS namespace key, so renaming it orphans saved code.
    id: string
    // URL segment under /learn/.
    slug: string
    title: string
    // Short tagline for the lesson card.
    tagline: string
    // Longer description for the lesson card back / intro.
    description: string
    minutes: number
    tags: string[]
    // Workspace seed. Keys may be bare names ('main.cpp') or full
    // '/workspace/...' paths; bare names are normalized on use.
    files: Record<string, string>
    // File that anchor-bearing checks resolve against by default.
    primaryFile: string
    steps: LessonStep[]
}

// Normalize a lesson file key to the VFS path format used by the IDE's
// stores ('/workspace/...').
export function workspacePath(file: string): string {
    return file.startsWith('/workspace/') ? file : `/workspace/${file.replace(/^\/+/, '')}`
}
