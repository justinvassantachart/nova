// C++ test-framework payload, loaded as text at build time so it can be
// injected into the compiler's file map and clangd's snapshot without
// round-tripping through the VFS (which would persist to OPFS and show up
// in the file explorer).

import NOVA_TEST_HEADER from './nova_test.h?raw'
import NOVA_TEST_RUNNER from './nova_test_runner.cpp?raw'

export { NOVA_TEST_HEADER, NOVA_TEST_RUNNER }

// Path the header is mounted at in the compiler's in-memory file system.
// Workspace files are mapped without the `/workspace/` prefix at compile
// time, so the header sits next to user .cpp files and `#include
// "nova_test.h"` resolves via the local include search.
export const NOVA_TEST_HEADER_NAME = 'nova_test.h'

// Path where clangd sees the header. The VFS uses /workspace/-rooted paths,
// so the same file appears at a different absolute path inside the LSP.
export const NOVA_TEST_HEADER_CLANGD_PATH = '/workspace/nova_test.h'

// Synthetic runner cpp mounted next to user files in test mode. Provides
// the program's `int main()`; the user's own main (if any) is rewritten
// to `nova_hidden_main` so the two coexist without a link conflict.
export const NOVA_TEST_RUNNER_NAME = 'nova_test_runner.cpp'

// Stdout sentinel. Anything emitted by the test framework is prefixed with
// this marker so the engine can split test events out of normal program
// output line-by-line without false positives on student `cout` traffic.
export const NOVA_TEST_MARKER = '###NOVA_TEST###|~|'

// Field delimiter inside a marker payload. Must match nova_test.h::emit().
export const NOVA_TEST_DELIM = '|~|'
