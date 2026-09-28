import type { IDEPlugin, TestProvider } from 'web-ide'
import { cppTestProvider } from 'web-ide/testing'

const compatibilityHeaderPath = '/workspace/webide_test.h'
const compatibilityHeader = '#pragma once\n#include "nova_test.h"\n#ifndef EXPECT_EQUAL\n#define EXPECT_EQUAL EXPECT_EQUALS\n#endif\n'
const headerReference = /(?:^|[\s/<"'])webide_test\.h(?=$|[\s>"'])/m

/** Accept saved lessons from the newer testing API without changing their source. */
const compatibleCppTestProvider: TestProvider = {
  ...cppTestProvider,
  editorSupportFiles: {
    ...cppTestProvider.editorSupportFiles,
    [compatibilityHeaderPath]: compatibilityHeader,
  },
  prepare(request) {
    const needsBridge = Object.values(request.files).some(source => headerReference.test(source))
      && !Object.hasOwn(request.files, compatibilityHeaderPath)
      && !Object.hasOwn(request.files, 'webide_test.h')
    if (!needsBridge) return cppTestProvider.prepare(request)

    // Add the bridge before delegation so ordinary Run/Debug also detects
    // nova_test.h and includes its implementation. All support stays in the
    // execution-plan copy; the editor's workspace and saved files are untouched.
    return cppTestProvider.prepare({
      ...request,
      files: { ...request.files, [compatibilityHeaderPath]: compatibilityHeader },
    })
  },
}

export const novaCppTestingPlugin: IDEPlugin = {
  id: 'nova.testing.cpp',
  contributes: { testProviders: [compatibleCppTestProvider] },
}
