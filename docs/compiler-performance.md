# C++ compilation and precompiled headers

The site consumes Web IDE 0.12.0-upstream.2 with the unmodified official npm Engine
`0.4.2` release. `package-lock.json` records both archives'
exact integrity. `VITE_ENGINE_BACKEND` defaults to `upstream`; a build with
`VITE_ENGINE_BACKEND=legacy` selects the retained legacy Engine and legacy PCH
profiles together. Unknown values fail configuration rather than selecting an
unintended compiler.

Nova ships two standard-library-only PCH profiles: `<iostream>` and `<iostream>`
followed by `<vector>`. No Stanford support archive is needed. The upstream
profiles were rebuilt with the compiler/sysroot identities and complete flags
in [the upstream manifest](../public/compiler/upstream/manifest.json). That
manifest preserves their original e7 build provenance. Engine 0.4.2 uses the
same compiler and sysroot bytes, so these PCH files are reused unchanged. Their
compiler SHA-256 is `8da7e06bf24341e85e0261bc727c65f0ff4b1f191a71f2af431e44f345bc6bd6`
and sysroot SHA-256 is `c549ba2c715645298ddec4609859b6982188ab4662326ad023a4568a289f3a7b`.
The runtime passes this required tuple to the public Web IDE provider before any
PCH is compiled. The exception libraries are part of that same verified sysroot.
The unchanged [legacy manifest](../public/compiler/manifest.json) and assets
remain available for rollback. The two sets have separate paths and hashes.

## Initial warming and repeat runs

Every editable IDE mount (including the landing embed, standalone IDE, guided
demo, lessons, and assignments) creates its own account/workspace-scoped C++
provider. After the workspace has loaded, one low-priority callback prepares the
compiler. It does not execute student constructors or main, clear the terminal, or
repeat on edits. Upstream preparation can compile and link through a private
debugger initialization barrier before guest execution. An explicit Run/Debug/Tests request takes priority. Navigation
and cancellation fence pending PCH downloads before they can submit engine work.
A host runtime adapter supplies a missing exit notification if the runtime
settles Stop during engine initialization, so the toolbar can run again. Actual
engine exits are forwarded unchanged and are never duplicated.
Read-only views do not schedule preparation.

The legacy rollback provider retains the compiler worker for up to 30 idle
seconds and reuses its verified compiled WebAssembly module. The upstream
provider uses the pinned adapter’s per-session compiler and object reuse. Hidden tabs cancel background work
and release idle compiler resources; unmount disposes the session. The public
engine keeps every Run's program state fresh. Stop preserves only permitted
compiler resources. Account/workspace changes create a fresh mount and engine.
The historical legacy measurement retained roughly 148 MiB of compiler/toolchain
identity buffers while active, in addition to browser-managed compiled code and
worker memory; this is not a measurement of the upstream backend.

The upstream adapter keys its compilation cache by the immutable toolchain and
actual PCH bytes, and the Engine invalidates objects when source/header contents
or flags change. Engine 0.4.2 also reuses the linked executable for unchanged
inputs. The Web IDE adapter invalidates that executable when source selection,
mounted source/header/archive bytes, or build flags change, preserving object
reuse while preventing stale links. Each Run still starts fresh guest state.
Cache lifetime is confined to the account/workspace
provider; a new provider starts with a fresh Engine.

Nova's legacy standard-library PCH profile is not certified for translation-unit
object caching. `objectCache` is explicitly disabled: every Run still compiles
student sources and links a new executable. Warming shifts toolchain download,
verification, and preparation ahead of the click; it does not eliminate cold
network costs. After resource release, the next Run may need preparation again.

To reproduce the comparison with the exact installed release:

```sh
npm run dev -- --host 127.0.0.1
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/compiler/warmup-benchmark.mjs
```

Historical legacy results (before this migration): on 2026-11-05, Chromium 151.0.7922.34 on an Apple M1 Max measured the linked-list
example in three isolated browser contexts. These are local development-harness
measurements of prepare + Run + settlement, not universal production timings.
All nine runs printed `10 + 20 + 30 = 60` and completed successfully.

| Provider | Initial background preparation | First Run | Next two Runs |
| --- | --- | --- | --- |
| 0.10.0 default + existing PCH | none | 5.74 s | 2.02 s, 2.10 s |
| Scoped compiler reuse + PCH | none | 4.56 s | 0.40 s, 0.37 s |
| Scoped compiler reuse + PCH, warmed | 3.84 s | 0.87 s | 0.35 s, 0.34 s |

The warmed result had successful compiler preparation; repeat runs reported
`workerReused: true` and two immutable compiler-module hits with zero module
compilation time. Object-cache entries remained zero. The retained provider's
repeat runs were about five times faster than the default provider in this
sample. First-visit background costs and browser/network variability remain.
Raw results are in `docs/validation/compiler-warmup-0.10.0.json`.

## When the optimization applies

The demo runtime selects the longest supported leading include sequence shared
by **every user C++ translation unit**. Comments and whitespace may precede it.
A macro, conditional, local include, unusual preprocessing syntax, or a source
file lacking that prefix keeps the normal source compilation path. This keeps
missing includes and source-local macros meaningful when readers edit demos.
Files and source line numbers are unchanged; no additional headers are silently
made available to a program. Four lesson test files now spell out the same
standard includes as their main files so their ordinary runs can share a PCH.
The exact Testing V2 framework implementation supplied by the pinned package is
allowed alongside those sources: its reviewed standard-library includes are
compatible with both profiles. Modified or similarly named files do not get this
exception. Generated test runners and transformed test sources with different
prefixes intentionally compile normally. A legacy test-header bridge is added
only when needed, so plain programs do not compile the testing framework.

The PCH downloads only when a matching program is prepared to run or debug.
The upstream compressed assets are about 6.6 MB and 7.2 MB, respectively
(the rollback assets are 7.3 MB and 7.8 MB); they use
content-addressed URLs, HTTP caching and a shared in-session promise cache.
The `.pch.bin` suffix contains gzip data and avoids static servers that
transparently decode `.gz` responses. After decompression, size and SHA-256 are
checked before any bytes reach the compiler. Missing, corrupt or timed-out
(download deadline: eight seconds) assets fall back to ordinary compilation.
Restricted browser crypto support also falls back. The editable landing embed can fetch PCHs during preparation; a landing
layout without an IDE embed does not. They do not remove the engine/compiler/sysroot first-use download.

The runtime copies binary inputs during preparation, rejects file collisions,
and clears artifacts before a later ordinary run. Clang additionally validates
PCH input contents. A new engine/toolchain requires regenerating and validating
these artifacts; this site does not claim arbitrary engine compatibility.

## Reproduce the assets and measurements

After `npm ci`:

```sh
node tools/compiler/build-pch.mjs --backend=upstream
# Only when intentionally regenerating the rollback profile:
# node tools/compiler/build-pch.mjs --backend=legacy
npm run dev -- --host 127.0.0.1 --port 4187
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/compiler/pch-compatibility.mjs
```

The build downloads and verifies the pinned compiler and sysroot into
`node_modules/.cache/web-ide-toolchain-upstream` (or the separate legacy cache), runs the compiler through Node WASI, and
writes the compressed PCHs plus generated selection metadata. Node may print
its standard experimental-WASI warning. Runtime license notices are retained in
[`public/compiler/`](../public/compiler/NOTICE.txt) and the engine's unmodified
exception-runtime notices in [`public/third-party/debugger-sh/`](../public/third-party/debugger-sh/).

The compatibility runner creates fresh Chromium and WebKit contexts for both
backends. It uses Nova's actual provider to warm each PCH profile, Run, repeat
unchanged, edit one source, then Debug through a breakpoint, Step Over and
Continue. It records stdout, stderr, settlement, source locations and actual
upstream clang worker commands. The upstream edit must compile exactly one
source using `-include-pch`; completed warmup and unchanged runs must compile
zero sources. This distinguishes working PCH/object reuse from silent source
fallback. Set `BENCHMARK_URL` to the dev-server URL ending in
`/tools/compiler/pch-compatibility.html` (default port 4187), and
`BENCHMARK_OUTPUT` to choose the JSON report path.

The older `benchmark.mjs` and `debug-smoke.mjs` are explicitly legacy Engine
harnesses for the historical measurements below; they do not select the current
upstream provider. First-use network and Wasm initialization costs must always
be distinguished from subsequent build costs.

## Validation

The 2026-11-23 official Engine 0.4.2 refresh repeated the Nova provider check in
Chromium 151.0.7922.34 and WebKit 26.5 for both upstream and legacy backends.
Both PCH profiles passed warmup, Run, unchanged Run, one-source edit, breakpoint,
Step Over, and Continue. Upstream warm/unchanged runs compiled zero sources;
edits and restored-source Debug compiled one source with the actual PCH flag.
The existing compressed and raw PCH hashes remain unchanged. These functional
checks were performed during other development work and are not benchmarks.

On 2026-11-16, both profiles passed the actual Nova provider compatibility check
in Chromium 151.0.7922.34 and WebKit 26.5, with both upstream and legacy backends:
eight successful warmups, 32 successful foreground operations, and breakpoint,
Step Over and Continue at the expected source lines. Every operation completed
with exit zero and empty stderr. The upstream worker trace showed zero clang
jobs for the first post-warmup Run and the unchanged Run, exactly one PCH-backed
clang job for the one-source edit, and one PCH-backed job for Debug after
restoring the original source. Both PCH files also rebuilt byte-for-byte with
fresh sysroot extraction, and the retained legacy files were unchanged. These
checks establish compatibility and cache behavior, not a timing guarantee.


Focused tests cover shared-prefix selection, missing includes, macros,
conditionals, multiple source files, binary path collisions, missing artifacts,
immutable byte snapshots, clearing artifacts, corrupt/download-failure fallback,
and the existing C++/Python session lifecycle. Browser results are recorded below.

Historical legacy results: on 2026-09-24, Chromium headless 151.0.7922.34 on an Intel i7-8850H Mac
completed twelve real browser runs, with identical expected stdout, empty stderr
and exit code zero for both compilation paths. These are local measurements,
not a browser/device performance guarantee; concurrent development work caused
substantial timing variation. Full samples and machine details are in
[`evidence/compiler-benchmark.json`](./evidence/compiler-benchmark.json).

| Program | Ordinary build, median | PCH build, median | Build reduction |
| --- | ---: | ---: | ---: |
| `iostream` | 16.34 s | 6.51 s | 60% |
| `iostream` + `vector` | 22.29 s | 8.71 s | 61% |

The first `iostream` pair is excluded from the warm comparison (two measured
pairs remain). The vector comparison uses three pairs after the toolchain was
already loaded. Median total elapsed time, including PCH fetch/decompression
in this harness, fell from 18.20 s to 9.33 s and from 24.09 s to 11.77 s,
respectively. The initial ordinary `iostream` run took 34.06 s after
`Engine.create`; engine module download/initialization itself is outside these
samples. Cold network cost still matters.

For the legacy rollback profile, a compiler/sysroot change behind its old URL
can make Clang reject an otherwise intact cached PCH. The upstream PCH profile
uses explicit compiler/sysroot tuple validation;
mismatch requires a reviewed rebuild. Official Engine 0.4.2 fetches versioned
upstream toolchain URLs without checking their bytes at runtime. The release
audit verified that those bytes match the pinned tuple; the build recipe checks
download hashes before regenerating PCH. That verification does not make the
upstream URLs immutable or protect against future runtime asset drift.
Demo inputs explicitly opt into one Debug source retry
for a compiler PCH/AST rejection before the authoritative DAP `initialized`
event. Debug retains a single session and exit; Stop/dispose still cancels
recovery. Ordinary Run has no explicit compilation-phase event, so compiler
rejections are reported without automatically rerunning the program. Execution
timings are not used to infer safety: browser clocks can round them to zero.
A program that prints a similar message is not rerun. Other runtime consumers can leave this policy disabled when their
PCH contains required implicit includes. Regenerate artifacts when updating the
pinned toolchain; the first-use download remains dependent on its upstream host.

A separate actual PCH **Debug** run also passed in the same Chromium version:
the breakpoint bound to `main.cpp:4`, Step Over paused at line 5, Continue
completed with stdout `7\n`, empty stderr and exit zero. This verifies the shared
PCH works with the engine's debug flags and preserves source line mapping.
Reproduce with the same dev server and Playwright module override:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/compiler/debug-smoke.mjs
```
