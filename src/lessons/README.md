# Guided lessons (`/learn`)

A self-contained interactive lesson series that teaches debugging — including
debugging AI-generated code — inside the Nova IDE. Live at `/learn`, no
account required; progress persists in `localStorage`.

## Architecture: the lesson system is a *host*, not a fork

The IDE is a reusable React component with a public host contract
([`src/ide-host.ts`](../ide-host.ts)). The lesson runner embeds it exactly the
way any third-party platform would:

```tsx
<IDEHostProvider host={{
    mode: 'lesson',
    assignmentId: `lesson:${lesson.id}:r${resetNonce}`, // OPFS namespace
    initialFiles: lesson.files,                          // workspace seed
    chrome: { sidebar: false, brand: false },            // focused surface
    wantsRuntimeEvents: true,                            // stdout / exit events
    onEvent: (type, payload) => runtime.record(type, payload),
}}>
    <App />
</IDEHostProvider>
```

Lessons run the IDE with reduced chrome (`IDEChrome` in `ide-host.ts`): no
activity bar or file explorer — lesson workspaces are 1–2 files, all opened
as editor tabs by the runner — and no IDE wordmark, since the lesson panel
provides the page identity. Run/Debug/Tests, the debug panels, terminal and
status bar remain.

No IDE internals were modified to support lessons. Step completion is
detected by observing the IDE's public state stores (`debug-store`,
`execution-store`, `test-store`, the VFS) plus the host event stream. If you
embed the IDE in your own platform, you can reuse this whole directory — or
just the pattern.

## Anatomy

| File | Role |
|---|---|
| `types.ts` | `Lesson` / `LessonStep` / `CheckSpec` — plain, JSON-serializable data |
| `content/` | The six lessons; `content/index.ts` is the registry |
| `checks.ts` | Pure evaluator: `CheckSpec` × IDE-state snapshot → pass/fail per part |
| `runtime.ts` | Accumulates host events (per-run stdout, exit code, action counts) |
| `use-step-check.ts` | React hook: re-evaluates the active step's check on state change |
| `progress-store.ts` | localStorage-persisted progress; sticky step completion |
| `LessonRunner.tsx` | `/learn/:slug` — panel + embedded IDE |
| `LessonPanel.tsx` | Instructions, live checklist, hints, step navigation, reset |
| `LessonsHome.tsx` | `/learn` — the series landing page |

## Telemetry (for studies)

Step gating and recording are separate concerns:

- **Gating** is local and instant: checks evaluate against the IDE's state
  stores and the host event stream. Nothing needs a network.
- **Recording**: when a user is signed in, every event flows into the
  Firestore `events` collection under one `sessionId` — the IDE's
  instrumented actions (`run`, `breakpoint_toggle`, `debug_step_over`,
  `terminal_stdout`, `program_exit`, …) interleaved with lesson-level
  events (`lesson_step_complete`, `lesson_step_navigate`,
  `lesson_hint_open`, `lesson_complete`, `lesson_reset`). Every event
  carries a `lessonStep` payload field, so a trace reads as "on step *fix*,
  the student set a breakpoint, stepped twice, edited, re-ran, passed."
  Anonymous visitors keep progress in localStorage only; to capture traces
  from logged-out demo users, enable Firebase Anonymous Auth and sign in
  silently on `/learn` routes.

## Authoring a lesson

A lesson is starter files plus steps; each step's `check` describes the
observable IDE state that completes it:

```ts
{
    id: 'fix',
    title: 'Fix the guard',
    body: 'Change the loop condition, then **Run**.',   // markdown-lite
    check: {
        kind: 'all',
        of: [
            { kind: 'code', matches: 'while \\(current != nullptr\\)' },
            { kind: 'stdout', includes: 'Sum:  60' },
        ],
    },
    hint: 'Test the node, not its successor.',
}
```

Check kinds: `manual`, `event`, `breakpoint`, `paused`, `variable`,
`call-stack`, `heap`, `stdout`, `program-exit`, `code`, `tests`, `right-tab`,
and the composites `all` / `any` (see `types.ts` for fields).

Two authoring rules, both enforced by `content.test.ts`:

1. **Never hard-code line numbers.** Checks that target a source line use an
   `anchor` (a substring of that line), resolved against the *current* file
   content — so checks survive the learner's edits. An anchor must match
   exactly one line of the starter code.
2. **Fix-gating `code` regexes must not match the starter code**, or the
   "fix it" step auto-passes before the learner does anything.

Run `npx vitest run src/lessons` after editing content.
