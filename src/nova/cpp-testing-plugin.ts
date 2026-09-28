import type { IDEPlugin, WorkspaceFiles } from 'web-ide'
import { cppTestProvider } from 'web-ide/testing'

const legacyHeader = '#pragma once\n#include "webide_test.h"\n#define EXPECT_EQUALS EXPECT_EQUAL\n'

function withLegacyHeader(files: WorkspaceFiles): WorkspaceFiles {
  if (!Object.values(files).some(source => /\bnova_test\.h\b/.test(source))
    || Object.keys(files).some(path => /(?:^|\/)nova_test\.h$/.test(path))) return files
  return { ...files, '/sysroot/nova_test.h': legacyHeader }
}

/** Saved lessons keep their old include while all execution uses Testing V2. */
export const novaCppTestingPlugin: IDEPlugin = {
  id: 'nova.testing.cpp',
  contributes: {
    testProviders: [{
      ...cppTestProvider,
      editorSupportFiles: {
        ...cppTestProvider.editorSupportFiles,
        '/workspace/nova_test.h': legacyHeader,
      },
      // Only add legacy support when it is needed. An unconditional resource
      // would make even the plain linked-list demo compile the test framework.
      prepareExecution: request => cppTestProvider.prepareExecution!({
        ...request, files: withLegacyHeader(request.files),
      }),
      prepareRun: (request, context) => cppTestProvider.prepareRun(request, {
        ...context, files: withLegacyHeader(context.files),
      }),
    }],
  },
}
