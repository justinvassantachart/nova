#!/usr/bin/env bash
# Run all node-runnable clangd tests. The browser-side wiring (worker boot,
# Monaco providers firing) needs a real browser; this just exercises the
# pure logic + the main-thread ClangdClient using a fake worker shim.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

cd "$root"

NODE_LOADER_BOOT="data:text/javascript,import{register}from'node:module';import{pathToFileURL}from'node:url';register('./scripts/alias-loader.mjs',pathToFileURL('./'));"

echo "== pure logic tests =="
node \
  --experimental-strip-types \
  --import "$NODE_LOADER_BOOT" \
  scripts/test-clangd.mjs

echo
echo "== ClangdClient integration tests =="
node \
  --experimental-strip-types \
  --import "$NODE_LOADER_BOOT" \
  scripts/test-clangd-client.mjs

echo
echo "all clangd tests passed."
