import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebugStore } from '../../src/store/debug-store'
import { bootstrapWorkspace } from '../../src/vfs/volume'
import type { IDEWorkspace } from '../../src/web-ide/contracts/host'
import { bindWorkspaceBreakpoints } from '../../src/web-ide/core/workspace-breakpoints'

const MAIN = '/workspace/main.cpp'
const initialFiles = { [MAIN]: 'int main() {\n    return 0;\n}\n' }
const workspace: IDEWorkspace = {
  id: 'breakpoint-example', initialFiles, initialBreakpoints: { 'main.cpp': [2] },
}
let saved: Map<string, string>
let cleanups: (() => void)[]
const storage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value) },
}
const bind = (options = workspace, fresh = true) => {
  const stop = bindWorkspaceBreakpoints(options, fresh, storage)
  cleanups.push(stop)
  return stop
}

beforeEach(() => {
  saved = new Map()
  cleanups = []
  bootstrapWorkspace(initialFiles)
  useDebugStore.setState({ breakpoints: {} })
})
afterEach(() => { for (const stop of cleanups) stop() })

describe('host-owned workspace default breakpoints', () => {
  it('seeds a fresh workspace and retains a removed default after reload', () => {
    const stop = bind()
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([2])
    useDebugStore.getState().toggleBreakpoint(MAIN, 2)
    stop()
    useDebugStore.setState({ breakpoints: {} })

    bind(workspace, false)
    expect(useDebugStore.getState().breakpoints[MAIN] ?? []).toEqual([])
  })

  it('does not impose defaults on existing workspace files without saved breakpoint state', () => {
    bind(workspace, false)
    expect(useDebugStore.getState().breakpoints[MAIN] ?? []).toEqual([])
  })

  it('restores changed breakpoints by workspace identity without leaking between projects', () => {
    let stop = bind()
    useDebugStore.getState().setFileBreakpoints(MAIN, [1, 3])
    stop()
    stop = bind({ ...workspace, id: 'second-example' })
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([2])
    stop()
    bind(workspace, false)
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([1, 3])
  })

  it('ignores stale files and invalid lines when restoring stored data', () => {
    saved.set(`web-ide.workspace-breakpoints.v1:${workspace.id}`, JSON.stringify({
      [MAIN]: [0, 2, 2, 2.5, 100, '1'],
      '/workspace/deleted.cpp': [1],
      '../outside.cpp': [1],
    }))
    bind(workspace, false)
    expect(useDebugStore.getState().breakpoints).toEqual({ [MAIN]: [2] })
  })

  it('keeps memory-only workspaces ephemeral and leaves non-opted-in hosts alone', () => {
    const stop = bind({ ...workspace, localCache: 'memory' })
    useDebugStore.getState().toggleBreakpoint(MAIN, 2)
    expect(saved.size).toBe(0)
    stop()
    bind({ ...workspace, localCache: 'memory' })
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([2])
    bind({ id: 'unconfigured' })
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([2])
  })

  it('continues without persistent storage when browser storage is unavailable', () => {
    const unavailable = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('blocked') }),
    }
    cleanups.push(bindWorkspaceBreakpoints(workspace, true, unavailable))
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([2])
    expect(() => useDebugStore.getState().toggleBreakpoint(MAIN, 2)).not.toThrow()
  })

  it('clears opted-in breakpoint state on exit without forgetting the saved choices', () => {
    const stop = bind()
    stop()
    bind({ id: 'ordinary-lesson' })
    expect(useDebugStore.getState().breakpoints[MAIN] ?? []).toEqual([])
    bind(workspace, false)
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([2])
  })

  it('does not let a stale cleanup clear a newer workspace binding', () => {
    const stopOld = bind()
    bind({ ...workspace, id: 'newer', initialBreakpoints: { [MAIN]: [3] } })
    stopOld()
    expect(useDebugStore.getState().breakpoints[MAIN]).toEqual([3])
  })
})
