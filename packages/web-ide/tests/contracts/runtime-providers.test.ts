import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const engineCreate = vi.hoisted(() =>
  vi.fn<(language: string) => Promise<unknown>>(),
)

vi.mock('debugger-sh', () => ({
  Engine: { create: engineCreate },
}))

import {
  cppRuntimeProvider,
  pythonRuntimeProvider,
} from '../../src/runtimes/providers'
import type { RuntimeSession } from '../../src/web-ide/contracts/runtime'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((next) => {
      resolve = next
    }),
    resolve: (value) => resolve(value),
  }
}

class FakeDataStream {
  private readonly listeners = new Set<(chunk: Uint8Array) => void>()

  on(_event: 'data', listener: (chunk: Uint8Array) => void): void {
    this.listeners.add(listener)
  }

  emit(text: string): void {
    const chunk = new TextEncoder().encode(text)
    for (const listener of this.listeners) listener(chunk)
  }
}

class FakeDebugger {
  enabled = true
  filterInternals = false

  on(): void {}

  send(): { success: true } {
    return { success: true }
  }
}

type RunResult =
  | { type: 'completed'; exitCode: number }
  | { type: 'stopped' }

class FakeEngine {
  fs: Record<string, unknown> = {}
  readonly stdout = new FakeDataStream()
  readonly stderr = new FakeDataStream()
  readonly stdin = { write: vi.fn(() => Promise.resolve()) }
  readonly debugger = new FakeDebugger()
  private readonly completion = deferred<RunResult>()

  readonly run = vi.fn(() => this.completion.promise)
  readonly stop = vi.fn(() => this.completion.resolve({ type: 'stopped' }))

  complete(exitCode = 0): void {
    this.completion.resolve({ type: 'completed', exitCode })
  }
}

const sessions: RuntimeSession[] = []

function createSession(provider: typeof cppRuntimeProvider): RuntimeSession
function createSession(provider: typeof pythonRuntimeProvider): RuntimeSession
function createSession(
  provider: typeof cppRuntimeProvider | typeof pythonRuntimeProvider,
): RuntimeSession {
  const session = provider.createSession()
  sessions.push(session)
  return session
}

beforeEach(() => {
  engineCreate.mockReset()
})

afterEach(() => {
  for (const session of sessions.splice(0).reverse()) session.dispose?.()
})

describe('built-in runtime providers', () => {
  it('publish provider-neutral metadata without loading the engine dependency', () => {
    expect(cppRuntimeProvider).toMatchObject({
      id: 'web-ide.runtime.cpp',
      label: 'C/C++',
      languageIds: ['c', 'cpp'],
      capabilities: {
        debug: true,
        breakpoints: true,
        stdin: true,
        graphics: false,
      },
    })
    expect(pythonRuntimeProvider).toMatchObject({
      id: 'web-ide.runtime.python',
      label: 'Python',
      languageIds: ['python'],
      capabilities: {
        debug: false,
        breakpoints: false,
        stdin: true,
        graphics: false,
      },
    })
    expect(engineCreate).not.toHaveBeenCalled()
  })

  it('creates a fresh isolated session for each mount', () => {
    const first = createSession(cppRuntimeProvider)
    const second = createSession(cppRuntimeProvider)

    expect(first).not.toBe(second)
    expect(first.events).not.toBe(second.events)
    expect(first.events.stdout).not.toBe(second.events.stdout)
    expect(engineCreate).not.toHaveBeenCalled()
  })

  it('maps a C++ workspace and selects the C engine lazily', async () => {
    const engine = new FakeEngine()
    engineCreate.mockResolvedValueOnce(engine)
    const session = createSession(cppRuntimeProvider)

    await expect(session.prepare({
      files: {
        '/workspace/main.cpp': 'int main() { return 0; }',
        '/workspace/include/value.hpp': '#define VALUE 1',
        '/sysroot/course.hpp': '#pragma once',
      },
      mode: 'run',
      entrypoint: '/workspace/main.cpp',
    })).resolves.toEqual({ success: true, errors: [] })
    expect(engineCreate).not.toHaveBeenCalled()

    const running = session.start({ mode: 'run' })
    await vi.waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1))

    expect(engineCreate).toHaveBeenCalledExactlyOnceWith('c')
    expect(engine.debugger.enabled).toBe(false)
    expect(engine.fs).toEqual({
      'main.cpp': 'int main() { return 0; }',
      include: {
        'value.hpp': '#define VALUE 1',
      },
      'course.hpp': '#pragma once',
    })
    expect(Object.getPrototypeOf(engine.fs)).toBeNull()
    expect(Object.getPrototypeOf(engine.fs.include)).toBeNull()

    engine.complete()
    await running
  })

  it('runs a selected Python entrypoint with normalized stdio', async () => {
    const engine = new FakeEngine()
    engineCreate.mockResolvedValueOnce(engine)
    const session = createSession(pythonRuntimeProvider)
    const stdout: string[] = []
    const stderr: string[] = []
    session.events.stdout.subscribe((text) => stdout.push(text))
    session.events.stderr.subscribe((text) => stderr.push(text))

    await expect(session.prepare({
      files: {
        '/workspace/lesson.py': 'print("hello")',
        '/workspace/helpers.py': 'VALUE = 1',
      },
      mode: 'run',
      entrypoint: '/workspace/lesson.py',
    })).resolves.toEqual({ success: true, errors: [] })

    const running = session.start({ mode: 'run' })
    await vi.waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1))

    expect(engineCreate).toHaveBeenCalledExactlyOnceWith('python')
    expect(engine.debugger.filterInternals).toBe(true)
    expect(engine.debugger.enabled).toBe(false)
    expect(engine.fs).toMatchObject({
      'main.py': 'print("hello")',
      'helpers.py': 'VALUE = 1',
    })

    engine.stdout.emit('hello\n')
    engine.stderr.emit('warning\n')
    session.writeStdin?.('answer')
    session.writeStdin?.('\r')

    expect(stdout).toContain('hello\r\n')
    expect(stderr).toContain('warning\r\n')
    expect(engine.stdin.write).toHaveBeenCalledWith('answer\n')

    engine.complete()
    await running
  })

  it('rejects Python debugging without loading the engine', async () => {
    const session = createSession(pythonRuntimeProvider)

    await expect(session.prepare({
      files: { '/workspace/main.py': 'print("run only")' },
      mode: 'debug',
      entrypoint: '/workspace/main.py',
    })).resolves.toEqual({
      success: false,
      errors: ['Runtime provider "web-ide.runtime.python" does not support debugging'],
    })
    await expect(session.start({ mode: 'debug' })).rejects.toThrow(
      'Runtime provider "web-ide.runtime.python" does not support debugging',
    )
    await expect(session.setBreakpoints('/workspace/main.py', [1])).rejects.toThrow(
      'Runtime provider "web-ide.runtime.python" does not support breakpoints',
    )
    expect(engineCreate).not.toHaveBeenCalled()
  })

  it('builds nested runtime directories without flattening Python imports', async () => {
    const engine = new FakeEngine()
    engineCreate.mockResolvedValueOnce(engine)
    const session = createSession(pythonRuntimeProvider)

    await expect(session.prepare({
      files: {
        '/workspace/main.py': 'from helpers.steps import move_twice',
        '/workspace/helpers/__init__.py': '',
        '/workspace/helpers/steps.py': 'def move_twice(): pass',
      },
      mode: 'run',
      entrypoint: '/workspace/main.py',
    })).resolves.toEqual({ success: true, errors: [] })

    const running = session.start({ mode: 'run' })
    await vi.waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1))
    expect(engine.fs).toEqual({
      'main.py': 'from helpers.steps import move_twice',
      helpers: {
        '__init__.py': '',
        'steps.py': 'def move_twice(): pass',
      },
    })
    expect(Object.getPrototypeOf(engine.fs)).toBeNull()
    expect(Object.getPrototypeOf(engine.fs.helpers)).toBeNull()

    engine.complete()
    await running
  })

  it('rejects traversal and file-directory collisions before loading the engine', async () => {
    const session = createSession(pythonRuntimeProvider)

    await expect(session.prepare({
      files: { '/workspace/../escape.py': 'print("escaped")' },
      mode: 'run',
    })).resolves.toMatchObject({
      success: false,
      errors: [expect.stringContaining('not canonical')],
    })
    await expect(session.prepare({
      files: {
        '/workspace/helpers': 'not a directory',
        '/workspace/helpers/steps.py': 'def move(): pass',
      },
      mode: 'run',
    })).resolves.toMatchObject({
      success: false,
      errors: [expect.stringContaining('both a file and directory')],
    })
    expect(engineCreate).not.toHaveBeenCalled()
  })

  it('treats special object-property names as ordinary runtime files', async () => {
    const engine = new FakeEngine()
    engineCreate.mockResolvedValueOnce(engine)
    const session = createSession(pythonRuntimeProvider)
    const files = JSON.parse('{"/workspace/__proto__/module.py":"VALUE = 1","/workspace/main.py":"pass"}') as Record<string, string>

    await expect(session.prepare({
      files,
      mode: 'run',
      entrypoint: '/workspace/main.py',
    })).resolves.toEqual({ success: true, errors: [] })

    const running = session.start({ mode: 'run' })
    await vi.waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1))
    expect(Object.hasOwn(engine.fs, '__proto__')).toBe(true)
    expect(engine.fs.__proto__).toEqual({ 'module.py': 'VALUE = 1' })
    expect(Object.getPrototypeOf(engine.fs)).toBeNull()
    expect(Object.getPrototypeOf(engine.fs.__proto__)).toBeNull()

    engine.complete()
    await running
  })
})
