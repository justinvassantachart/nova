import { useDebugStore } from '@/store/debug-store'
import { getAllFiles } from '@/vfs/volume'
import type { IDEWorkspace, WorkspaceFiles } from '../contracts/host'
import { canonicalWorkspaceFilePath } from './workspace-path'

type BreakpointStorage = Pick<Storage, 'getItem' | 'setItem'>
let activeBinding: object | undefined

function browserStorage(): BreakpointStorage | undefined {
  try { return window.localStorage } catch { return undefined }
}

function validBreakpoints(value: unknown, files: WorkspaceFiles): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [path, lines] of Object.entries(value)) {
    if (!Array.isArray(lines)) continue
    let canonical: string
    try { canonical = canonicalWorkspaceFilePath(path) } catch { continue }
    if (!Object.hasOwn(files, canonical)) continue
    const lineCount = files[canonical].split('\n').length
    result[canonical] = [...new Set(lines.filter((line): line is number =>
      Number.isInteger(line) && line > 0 && line <= lineCount,
    ))].sort((a, b) => a - b)
  }
  return result
}

/** Applies an opted-in host's seed once, then saves the user's breakpoint choices. */
export function bindWorkspaceBreakpoints(
  workspace: IDEWorkspace,
  freshlySeeded: boolean,
  storage: BreakpointStorage | undefined = browserStorage(),
): () => void {
  if (workspace.initialBreakpoints === undefined) return () => {}
  const binding = {}
  activeBinding = binding
  const persistent = workspace.localCache !== 'memory'
  const storageKey = `web-ide.workspace-breakpoints.v1:${workspace.id}`
  let saved: string | null = null
  if (persistent) {
    try { saved = storage?.getItem(storageKey) ?? null } catch { /* storage is optional */ }
  }
  let restored: unknown = freshlySeeded ? workspace.initialBreakpoints : {}
  if (saved !== null) {
    // A saved empty map means the user removed every breakpoint. Invalid saved
    // data also fails closed rather than silently bringing defaults back.
    try { restored = JSON.parse(saved) } catch { restored = {} }
  }
  const breakpoints = validBreakpoints(restored, getAllFiles())
  const debug = useDebugStore.getState()
  for (const path of Object.keys(debug.breakpoints)) debug.setFileBreakpoints(path, [])
  for (const [path, lines] of Object.entries(breakpoints)) debug.setFileBreakpoints(path, lines)

  const save = () => {
    if (!persistent || activeBinding !== binding) return
    try {
      storage?.setItem(storageKey, JSON.stringify(
        validBreakpoints(useDebugStore.getState().breakpoints, getAllFiles()),
      ))
    } catch { /* unavailable storage never blocks the workbench */ }
  }
  save()
  let previous = useDebugStore.getState().breakpoints
  const unsubscribe = useDebugStore.subscribe((state) => {
    if (state.breakpoints === previous) return
    previous = state.breakpoints
    save()
  })
  return () => {
    unsubscribe()
    if (activeBinding !== binding) return
    activeBinding = undefined
    // The debug store is shared. Leave no seeded or restored breakpoints for
    // the next host, and never persist this teardown as the user's choice.
    const debug = useDebugStore.getState()
    for (const path of Object.keys(debug.breakpoints)) debug.setFileBreakpoints(path, [])
  }
}
