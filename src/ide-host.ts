// Compatibility entry point. Reusable contracts come from the Web IDE
// workspace package and are re-exported here while host call sites migrate.
export type {
  IDEEvent,
  IDEEventMap,
  IDEEventSink,
  IDEEventType as EventType,
  IDESessionMode as IDEMode,
} from 'web-ide/host'
export type {
  IDEChrome,
  IDEWorkspace,
  IDEWorkspacePersistence,
  WebIDEHost as IDEHost,
  WorkspaceFiles,
  WorkspaceSaveContext,
} from 'web-ide/host'

// Edit events snapshot the whole file so traces replay without a diff
// engine; this cap keeps a pathological paste from blowing up an event
// document (Firestore caps docs at 1 MiB).
export const EDIT_CONTENT_CAP = 60_000

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
