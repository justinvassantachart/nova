# Guided lessons (`/learn`)

The lesson host provides a ten-part course from introductory Python concepts to
C++ and linked lists inside Web IDE. Each lesson combines short explanations,
starter files, a focused debugging exercise, tests, and observable completion
checks. No account is required, and progress persists in `localStorage`.

Lessons belong to the deployed site host, not to the reusable
`packages/web-ide` package. They are a concrete example of an application
embedding the workbench through its public API.

## Architecture: a host, not a workbench fork

The lesson runner creates a `WebIDEHost` through the compatibility exports in
[`src/ide-host.ts`](../ide-host.ts) and embeds the same composed application used
by `/ide`:

```tsx
const ideRef = useRef<WebIDEInstanceHandle>(null)

const host: IDEHost = {
  workspace: {
    id: `lesson:${lesson.id}:r${resetNonce}`,
    initialFiles: lessonFiles,
  },
  chrome: { sidebar: false, brand: false },
  events: {
    includeRuntime: true,
    emit: (type, payload) => {
      runtime.record(type, payload)
      report(type, payload)
    },
  },
}

<IDEHostProvider host={host}>
  <App ref={ideRef} />
</IDEHostProvider>
```

`IDEHostProvider` is a root-level compatibility name for
`WebIDEHostProvider` from `web-ide/host`; it does not expose package internals.

Lessons hide the activity bar, explorer, and workbench brand because the
lesson panel supplies the page identity and each workspace contains only a few
files. Run, Debug, Tests, terminal, debug panels, and status remain available.
The runner uses the public handle to keep lesson files open when the explorer
is hidden.

Step completion observes two public seams:

1. `WebIDEInstanceHandle.subscribe()` signals workbench changes, and
   `snapshot()` returns immutable debug, panel, test, and workspace state.
2. The host event sink records run output, exit status, and action counts in a
   lesson-owned `LessonRuntime`.

No lesson code imports Web IDE's VFS, React context, registry, or Zustand
stores. Package refactors that preserve the public handle and event contracts
therefore do not require a lesson-system fork.

## Anatomy

| File | Role |
| --- | --- |
| `types.ts` | JSON-friendly `Lesson`, `LessonStep`, and `CheckSpec` definitions |
| `content/` | The ten lessons; `content/index.ts` is the registry |
| `checks.ts` | Pure `CheckSpec` evaluation against a public IDE snapshot |
| `runtime.ts` | Lesson-owned host-event accumulator for output, exits, and action counts |
| `use-step-check.ts` | React hook that re-evaluates a step when public IDE or runtime state changes |
| `progress-store.ts` | `localStorage` progress, current step, and reset nonce |
| `LessonRunner.tsx` | `/learn/:slug` host layout and Web IDE embedding |
| `LessonPanel.tsx` | Instructions, checklist, hints, navigation, and reset |
| `LessonsHome.tsx` | `/learn` catalog |

## Workspace lifecycle

Each lesson reset increments `resetNonce`, which changes the host workspace ID.
That gives the VFS a fresh browser-local namespace and allows the workbench to
seed the starter files without racing persistence from the previous session.

Because the explorer is hidden, `LessonRunner` opens every lesson file through
`WebIDEInstanceHandle.ensureFilesOpen()`. If a learner closes a tab, the runner
quietly restores it; if the final tab closes, the primary file is focused.

## Completion checks

`CheckSpec` values are pure data. Supported checks include:

- manual confirmation and recorded host events;
- breakpoint, pause, variable, call-stack, and heap state;
- terminal output and program exit status;
- current workspace source;
- structured test results and selected right-side panel;
- `all` and `any` combinations.

`checks.ts` evaluates those specifications against a `CheckContext`. It has no
React, Firebase, package-store, or VFS dependency, so check behavior is directly
unit-testable.

## Telemetry

Completion gating is local and immediate. It does not require a network or an
account.

When a visitor is already signed in, IDE events and lesson-level events are
sent to the root application's Firestore event sink under one session ID. The
payload records the current lesson step, allowing a trace to relate edits,
runs, breakpoints, debugger actions, hints, navigation, and completion.
Anonymous visitors keep progress locally and do not write telemetry.

The event sink and Firebase SDK remain in the site host. They are not part of
Web IDE's package or plugin API.

## Authoring a lesson

A lesson defines starter files and ordered steps. Each step's `check` describes
observable evidence required for completion:

```ts
{
  id: 'fix',
  title: 'Fix the guard',
  body: 'Change the loop condition, then **Run**.',
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

Two authoring rules are enforced by `content.test.ts`:

1. Do not hard-code line numbers. A source-line check uses an `anchor`, which
   must match exactly one line of starter code and is resolved against the
   learner's current file.
2. A fix-gating code expression must not already match the starter code, or the
   step would pass before the learner makes the intended change.

After changing lesson content or checks, run:

```sh
npm run test:app -- src/lessons
npm run typecheck
```

For the broader workbench/host boundary, see
[`docs/architecture/web-ide-extraction.md`](../../docs/architecture/web-ide-extraction.md).
