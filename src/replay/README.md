# Session replay (`src/replay`)

Reconstructs and replays everything a student did in the IDE — file edits,
breakpoints, runs, terminal output, debugger pauses — from the recorded
host-event stream. Teachers reach it from a submission ("Replay activity")
or the submissions roster; `/replay-demo` (dev builds) drives the viewer
with synthetic data.

## How recording works

The IDE never knows it is being recorded. It emits typed events through its
public host contract ([`src/ide-host.ts`](../ide-host.ts) → `IDEHost.onEvent`);
the LMS host persists that stream with `useFirestoreEventSink`. For student
assignment work the events land under the submission itself —

```
classes/{c}/assignments/{a}/submissions/{uid}/events/{id}
```

— which buys teacher read access through the class rules and a plain
`orderBy(clientTs)` query with no composite index. Lesson and teacher-edit
traces keep flowing to the top-level `events` collection;
`collectionGroup('events')` spans both for research queries.

Three event-vocabulary details make traces replayable:

- `session_start` — emitted by the **host** with the workspace seed
  (`{ mode, files }`), so a trace folds from t=0.
- `edit` carries the post-edit file `content` (capped at
  `EDIT_CONTENT_CAP`), throttled leading+trailing so a typing burst's final
  state is always captured.
- Runtime events (`terminal_stdout` incl. stderr-tagged chunks,
  `program_exit`, `debug_paused`) flow when the host sets
  `wantsRuntimeEvents` — the LMS student host does.

## How replay works

Replay is a **fold**: `reduceEvent(state, event)` is the single source of
truth for what each event means, and the state after `events[0..i]` is the
reconstruction at scrub position `i` (`reconstruct.ts`). `ReplayTimeline`
adds periodic checkpoints (O(K) scrubbing) and a one-step cache (O(1)
sequential playback). `feed.ts` derives the human-readable activity feed —
typing bursts, stdout chunks and step→pause pairs collapse so minutes of
work skim in a dozen rows.

`SessionReplay.tsx` renders one session: transport controls (play/pause,
speed, jump-to-start), a scrubber with per-category tick marks, the
reconstructed file tabs + code pane (breakpoint dots, paused-line marker),
the terminal, and the clickable activity feed.

## Separation contract

This directory depends on **nothing** from the IDE internals or the LMS —
only the documented event vocabulary and plain `ReplayEvent` data. The LMS
page (`src/lms/pages/ReplayPage.tsx`) owns Firestore loading and auth and
passes plain arrays in. Anyone embedding the IDE elsewhere can persist the
same `onEvent` stream however they like and reuse this whole directory (or
just `reconstruct.ts`) to replay it.

The reducer, timeline, sessionizer, and feed are pure and covered by
`reconstruct.test.ts`, including a property test that checks
`ReplayTimeline.stateAt(i)` against a naive fold at every index.
