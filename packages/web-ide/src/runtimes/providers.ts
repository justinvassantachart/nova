import type { IDEPlugin } from '@/web-ide/contracts/plugin'
import type { RuntimeCapabilities, RuntimeProvider } from '@/web-ide/contracts/runtime'
import { BrowserRuntimeSession } from './BrowserRuntimeSession'

const cppCapabilities = {
  debug: true,
  breakpoints: true,
  stdin: true,
  graphics: false,
} as const satisfies RuntimeCapabilities

const pythonCapabilities = {
  debug: false,
  breakpoints: false,
  stdin: true,
  graphics: false,
} as const satisfies RuntimeCapabilities

// Clang frontend/linker diagnostics reported while the engine is building.
// Anchoring the filename form avoids treating arbitrary runtime stderr text
// containing "error:" as a failed preparation.
const cppPreparationErrorPattern =
  /(^[^\s:]+:\d+:\d+:\s+(?:fatal\s+)?error:|^wasm-ld:\s+error:|^\d+\s+errors?\s+generated\.)/

export const cppRuntimeProvider: RuntimeProvider = {
  id: 'web-ide.runtime.cpp',
  label: 'C/C++',
  languageIds: ['c', 'cpp'],
  capabilities: cppCapabilities,
  createSession: () =>
    new BrowserRuntimeSession({
      id: 'web-ide.runtime.cpp',
      languageIds: ['c', 'cpp'],
      engineLanguage: 'c',
      capabilities: cppCapabilities,
      preparationErrorPattern: cppPreparationErrorPattern,
      debugFallbackPath: '/main.cpp',
    }),
}

export const pythonRuntimeProvider: RuntimeProvider = {
  id: 'web-ide.runtime.python',
  label: 'Python',
  languageIds: ['python'],
  capabilities: pythonCapabilities,
  createSession: () =>
    new BrowserRuntimeSession({
      id: 'web-ide.runtime.python',
      languageIds: ['python'],
      engineLanguage: 'python',
      capabilities: pythonCapabilities,
      filterInternals: true,
      defaultEntrypoint: 'main.py',
    }),
}

export const cppRuntimePlugin: IDEPlugin = {
  id: 'web-ide.runtime.cpp.plugin',
  contributes: { runtimeProviders: [cppRuntimeProvider] },
}

export const pythonRuntimePlugin: IDEPlugin = {
  id: 'web-ide.runtime.python.plugin',
  contributes: { runtimeProviders: [pythonRuntimeProvider] },
}
