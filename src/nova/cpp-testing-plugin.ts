import type { IDEPlugin } from 'web-ide'
import { cppTestProvider } from 'web-ide/testing'

const legacyHeader = '#pragma once\n#include "webide_test.h"\n#define EXPECT_EQUALS EXPECT_EQUAL\n'

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
    }],
    resources: [{
      id: 'nova.legacy-test-header',
      scope: 'execution-only',
      files: { '/sysroot/nova_test.h': legacyHeader },
    }],
  },
}
