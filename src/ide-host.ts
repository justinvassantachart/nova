// IDE host contract. The IDE *defines* this type and emits events through it.
// Hosts (e.g. the LMS) implement it and inject via <IDEHostProvider>.
// In standalone mode, no host is provided and the IDE works as a self-contained app.
//
// IMPORTANT: this file (and ide-host-context.tsx) MUST NOT import from anywhere
// under src/lms or src/shared. Dependency direction is LMS -> IDE.

export type EventType =
  | 'edit'
  | 'compile'
  | 'compile_debug'
  | 'compile_error'
  | 'run'
  | 'breakpoint_toggle'
  | 'debug_step_into'
  | 'debug_step_over'
  | 'debug_continue'
  | 'debug_step_back'
  | 'debug_step_forward'
  | 'file_create'
  | 'file_rename'
  | 'file_delete'
  | 'terminal_stdout'

export type IDEMode = 'standalone' | 'teacher-edit' | 'student-work'

export type IDEHost = {
  mode: IDEMode
  assignmentId?: string
  submissionId?: string
  // Replaces the IDE's default template files at boot, if provided.
  initialFiles?: Record<string, string>
  // Fires on a debounced VFS change with the full /workspace snapshot.
  onWorkspaceChange?: (files: Record<string, string>) => void
  // Fires for each instrumented user action. Host owns buffering/flushing.
  onEvent?: (type: EventType, payload: Record<string, unknown>) => void
}
