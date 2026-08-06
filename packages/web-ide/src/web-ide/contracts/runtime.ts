import type { EventSource } from './events'
import type { WorkspaceFiles } from './host'

export interface RuntimePreparationResult {
  success: boolean
  errors: string[]
}

export interface VariableNode {
  name: string
  type: string
  value: string | number
  rawValue: number
  address: number
  size: number
  isPointer: boolean
  pointsTo?: number
  pointeeType?: string
  isStruct?: boolean
  members?: VariableNode[]
}

export interface HeapAllocation {
  ptr: number
  size: number
  typeName: string
  label: string
  members: VariableNode[]
}

export interface StackFrame {
  id: string
  funcName: string
  line: number
  sp: number
  variables: VariableNode[]
  isActive: boolean
}

export interface MemorySnapshot {
  frames: StackFrame[]
  heapAllocations: HeapAllocation[]
}

export interface DebugPauseState {
  line: number | null
  func: string | null
  file: string | null
  callStack: StackFrame[]
  memorySnapshot: MemorySnapshot | null
  nextKnownTypes?: Record<number, string>
}

export type DrawCommand =
  | { type: 'CLEAR' }
  | { type: 'CIRCLE'; x: number; y: number; r: number; color: string }
  | { type: 'RECT'; x: number; y: number; w: number; h: number; color: string }

export type RuntimeExecutionMode = 'run' | 'debug'

/**
 * Optional execution-scoped stream transform. Workbench workflows can remove
 * framed control messages while leaving runtime sessions protocol-agnostic.
 */
export interface RuntimeStreamInterceptor {
  push(stream: 'stdout' | 'stderr', chunk: string): string
  /** Flushes buffered stdout immediately before the exit event is published. */
  finish(): string
}

export interface RuntimeExecutionPlan {
  files: WorkspaceFiles
  mode: RuntimeExecutionMode
  /** Workspace path to execute when the runtime needs an explicit entrypoint. */
  entrypoint?: string
  streamInterceptor?: RuntimeStreamInterceptor
}

export interface RuntimeStartRequest {
  mode: RuntimeExecutionMode
}

export interface RuntimeCapabilities {
  debug: boolean
  breakpoints: boolean
  stdin: boolean
  graphics: boolean
}

export interface RuntimeDiagnostic {
  message: string
  severity: 'error' | 'warning'
  phase: 'preparation' | 'execution'
  mode: RuntimeExecutionMode
}

export interface RuntimeEventChannels {
  stdout: EventSource<string>
  stderr: EventSource<string>
  terminalClear: EventSource<void>
  graphicsDraw: EventSource<DrawCommand[]>
  debugPaused: EventSource<DebugPauseState>
  debugResumed: EventSource<void>
  exit: EventSource<number>
  diagnostic: EventSource<RuntimeDiagnostic>
  breakpointsValidated: EventSource<{ file: string; lines: number[] }>
}

/** A long-lived runtime instance owned by exactly one Web IDE mount. */
export interface RuntimeSession {
  readonly id: string
  readonly languageIds: readonly string[]
  readonly capabilities: Readonly<RuntimeCapabilities>
  readonly events: RuntimeEventChannels

  prepare(plan: RuntimeExecutionPlan): Promise<RuntimePreparationResult>
  start(request: RuntimeStartRequest): Promise<void>
  stop(): void

  setBreakpoints(file: string, lines: number[]): Promise<void>
  stepInto(): Promise<void>
  stepOver(): Promise<void>
  stepOut(): Promise<void>
  continueExecution(): Promise<void>
  writeStdin?(data: string): void
  dispose?(): void
}

/** Declarative runtime contribution; sessions are lazy and instance-scoped. */
export interface RuntimeProvider {
  id: string
  label: string
  languageIds: readonly string[]
  capabilities: Readonly<RuntimeCapabilities>
  createSession(): RuntimeSession
  order?: number
}
