import type { WebIDEConfiguration } from 'web-ide'
import { cppRuntimePlugin } from 'web-ide/runtimes'
import { testingPlugin } from 'web-ide/testing'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { canvasPlugin, coreWorkbenchPlugin } from 'web-ide/plugins'
import { novaCppTestingPlugin } from './cpp-testing-plugin'
import { assignmentActivityPlugin } from './assignment-activity-plugin'

export const novaWebIDEConfiguration: WebIDEConfiguration = {
  runtimeProvider: 'web-ide.runtime.cpp',
  languageToolingProvider: 'web-ide.language-tooling.cpp',
  testProvider: 'web-ide.testing.cpp',
  brand: 'WEB IDE',
  terminalName: 'Web IDE Terminal',
  reloadWhenNotIsolated: true,
  plugins: [
    cppRuntimePlugin,
    cppLanguageToolingPlugin,
    novaCppTestingPlugin,
    assignmentActivityPlugin,
    coreWorkbenchPlugin,
    canvasPlugin,
    testingPlugin,
  ],
}

/** Assignment mounts select their host-owned activity through the public API. */
export const novaAssignmentWebIDEConfiguration: WebIDEConfiguration = {
  ...novaWebIDEConfiguration,
  initialLayout: {
    ...novaWebIDEConfiguration.initialLayout,
    selectedActivityId: 'nova.assignment',
  },
}
