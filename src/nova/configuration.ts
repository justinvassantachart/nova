import type { WebIDEConfiguration } from 'web-ide'
import { cppRuntimePlugin } from 'web-ide/runtimes'
import { cppTestingPlugin, testingPlugin } from 'web-ide/testing'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { canvasPlugin, coreWorkbenchPlugin } from 'web-ide/plugins'
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
    cppTestingPlugin,
    assignmentActivityPlugin,
    coreWorkbenchPlugin,
    canvasPlugin,
    testingPlugin,
  ],
}

/** Assignment mounts use Web IDE 0.3.1's public, mount-owned activity selection. */
export const novaAssignmentWebIDEConfiguration: WebIDEConfiguration = {
  ...novaWebIDEConfiguration,
  initialLayout: {
    ...novaWebIDEConfiguration.initialLayout,
    selectedActivityId: 'nova.assignment',
  },
}
