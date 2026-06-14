// IDE host contract. The IDE *defines* this type and emits events through it.
// Hosts (e.g. the LMS) implement it and inject via <IDEHostProvider>.
// In standalone mode, no host is provided and the IDE works as a self-contained app.
//
// IMPORTANT: this file (and ide-host-context.tsx) MUST NOT import from anywhere
// under src/lms or src/shared. Dependency direction is LMS -> IDE.

export type EventType =
  // Emitted by the HOST (not the IDE) when it mounts a workspace, with
  // { mode, files } — the seed snapshot that makes an event trace
  // replayable from t=0. The IDE never emits it; it's listed here so the
  // whole session vocabulary lives in one union.
  | 'session_start'
  // { file, length, content, truncated? } — content is the post-edit file
  // text (sliced to EDIT_CONTENT_CAP chars, with truncated:true when it
  // was), throttled with a trailing emit so the final state of a typing
  // burst is always captured.
  | 'edit'
  | 'compile'
  | 'compile_debug'
  | 'compile_test'
  // { debug } — whether the failed build was for a debug session.
  | 'compile_error'
  // { debug } — true when the session runs under the debugger.
  | 'run'
  | 'run_tests'
  // { file, line, on } — `on` is the post-toggle state of that line.
  | 'breakpoint_toggle'
  // { file, lines } — the debugger snapped/verified a file's breakpoints;
  // `lines` is the authoritative post-bind set for that file.
  | 'breakpoints_validated'
  | 'debug_step_into'
  | 'debug_step_over'
  | 'debug_step_out'
  | 'debug_continue'
  | 'debug_restart'
  | 'debug_step_back'
  | 'debug_step_forward'
  // { file, line, func } — where execution paused. Gated (with the other
  // runtime events) on wantsRuntimeEvents.
  | 'debug_paused'
  | 'file_create'
  | 'file_rename'
  | 'file_delete'
  | 'terminal_stdout'
  | 'program_exit'

// Edit events snapshot the whole file so traces replay without a diff
// engine; this cap keeps a pathological paste from blowing up an event
// document (Firestore caps docs at 1 MiB).
export const EDIT_CONTENT_CAP = 60_000

export type IDEMode =
  | 'standalone'
  | 'teacher-edit'      // teacher authoring an assignment's starter files
  | 'student-work'      // student doing an assignment; edits auto-save to their submission
  | 'teacher-review'    // teacher inspecting a student submission; no persistence
  | 'lesson'            // guided lesson host (src/lessons); progress lives in localStorage

// UI-surface configuration for embedding hosts. Anything omitted defaults
// to true — the full IDE. Hosts strip chrome that doesn't fit their context
// (a guided lesson hides the file explorer for a one-file workspace; a
// kiosk embed might drop the status bar) without forking the layout.
// Run/Debug/Tests controls and the editor are not configurable: an IDE
// embed that can't run code isn't one.
export type IDEChrome = {
  // ActivityBar + file-explorer sidebar (editor tabs still allow switching
  // between open files when this is off).
  sidebar?: boolean
  // The NOVA·IDE wordmark in the toolbar — off when the host shows its own
  // branding next to the embed.
  brand?: boolean
  statusBar?: boolean
}

export type IDEHost = {
  mode: IDEMode
  assignmentId?: string
  submissionId?: string
  // Omit for the full IDE; see IDEChrome.
  chrome?: IDEChrome
  // Replaces the IDE's default template files at boot, if provided.
  initialFiles?: Record<string, string>
  // Fires on a debounced VFS change with the full /workspace snapshot.
  // Return a Promise if persisting is async — the IDE uses that to drive
  // the save-status indicator and the beforeunload guard.
  onWorkspaceChange?: (files: Record<string, string>) => void | Promise<void>
  // Fires for each instrumented user action. Host owns buffering/flushing.
  onEvent?: (type: EventType, payload: Record<string, unknown>) => void
  // Opt-in to high-volume / engine runtime events on onEvent:
  // 'terminal_stdout' { text }, 'program_exit' { code }, and 'debug_paused'
  // { file, line, func }. Off by default so hosts that persist events
  // (e.g. the LMS Firestore sink) don't pay for every chunk of program
  // output; hosts that *react* to program behavior (guided lessons) or
  // *record* it for replay (the LMS student host) set this.
  wantsRuntimeEvents?: boolean
}

// Assignment metadata surfaced through a SEPARATE context from IDEHost
// (see [src/components/sidebar/assignment-info-context.tsx]). Splitting
// it out matters: IDEHost holds the file/event channels that App.tsx
// re-runs effects on, so we want its identity stable. AssignmentInfo
// rerenders on every Firestore push and would force those effects to
// rebind otherwise.
export type AssignmentInfo = {
  title: string
  description: string
  isTeacher: boolean
  published?: boolean
  submitted?: boolean
  // Callbacks — undefined means the host doesn't support that action in
  // the current mode (e.g. students can't toggle publish).
  onSubmit?: () => void | Promise<void>
  onDownload?: () => void
  onTogglePublish?: () => void
  onTitleChange?: (s: string) => void
  onDescriptionChange?: (s: string) => void
}
