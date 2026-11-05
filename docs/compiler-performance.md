# C++ compilation and precompiled headers

The site consumes Web IDE 0.10.1, which pins `debugger-sh` to the public fork
release [`0.3.15-webide.0.9.0.1`](https://github.com/justinvassantachart/engine/releases/tag/debugger-sh-v0.3.15-webide.0.9.0.1).
`package-lock.json` records both release archives' exact integrity. Nova retains the legacy compiler profile and explicit PCH rejection
fallback, while enabling scoped worker and compiled-module reuse. The
course-specific object cache is not enabled here. The 0.10.1 graph and build
progress updates retain the compiler-warming configuration measured below.

The PCH profiles were regenerated for this engine. Its standard compiler flags,
compiler SHA-256, and sysroot SHA-256 match the prior pin, so the generated PCH
bytes and content-addressed filenames remain unchanged.

The CS106B course uses a shared precompiled Stanford support library. This site
instead ships two smaller, standard-library-only PCH profiles: `<iostream>` and
`<iostream>` followed by `<vector>`. No Stanford support archive is needed.
The assets are built with the exact compiler/sysroot SHA-256 identities and
compiler flags recorded in [the manifest](../public/compiler/manifest.json).

## Initial warming and repeat runs

Every editable IDE mount (including the landing embed, standalone IDE, guided
demo, lessons, and assignments) creates its own account/workspace-scoped C++
provider. After the workspace has loaded, one low-priority callback prepares the
compiler. It does not run student code, link a program, clear the terminal, or
repeat on edits. An explicit Run/Debug/Tests request takes priority. Navigation
and cancellation fence pending PCH downloads before they can submit engine work.
A host runtime adapter supplies a missing exit notification when Web IDE 0.10.0
settles Stop during engine initialization, so the toolbar can run again. Actual
engine exits are forwarded unchanged and are never duplicated.
Read-only views do not schedule preparation.

The provider retains the compiler worker for up to 30 idle seconds and reuses
its verified compiled WebAssembly module. Hidden tabs cancel background work
and release idle compiler resources; unmount disposes the session. The public
engine keeps every Run's program state fresh. Stop preserves only permitted
compiler resources. Account/workspace changes create a fresh mount and engine.
This retains roughly 148 MiB of compiler/toolchain identity buffers while active,
in addition to browser-managed compiled code and worker memory.

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

On 2026-11-05, Chromium 151.0.7922.34 on an Apple M1 Max measured the linked-list
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
The compressed assets are about 7.3 MB and 7.8 MB, respectively; they use
content-addressed URLs, HTTP caching and a shared in-session promise cache.
The `.pch.bin` suffix contains gzip data and avoids static servers that
transparently decode `.gz` responses. After decompression, size and SHA-256 are
checked before any bytes reach the compiler. Missing, corrupt or timed-out
(download deadline: eight seconds) assets fall back to ordinary compilation.
Restricted browser crypto support also falls back. PCHs are not fetched on the
landing page. They do not remove the engine/compiler/sysroot first-use download.

The runtime copies binary inputs during preparation, rejects file collisions,
and clears artifacts before a later ordinary run. Clang additionally validates
PCH input contents. A new engine/toolchain requires regenerating and validating
these artifacts; this site does not claim arbitrary engine compatibility.

## Reproduce the assets and measurements

After `npm ci`:

```sh
node tools/compiler/build-pch.mjs
npm run dev -- --host 127.0.0.1
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/compiler/benchmark.mjs
```

The build downloads and verifies the pinned compiler and sysroot into
`node_modules/.cache/web-ide-toolchain`, runs the compiler through Node WASI, and
writes the compressed PCHs plus generated selection metadata. Node may print
its standard experimental-WASI warning. Runtime license notices are retained in
[`public/compiler/`](../public/compiler/NOTICE.txt) and the engine's unmodified
exception-runtime notices in [`public/third-party/debugger-sh/`](../public/third-party/debugger-sh/).

The benchmark creates its own headless Chromium instance. It alternates normal
and PCH builds of the same `iostream` and `iostream`/`vector` programs, and records
stdout, stderr, exit status, engine build time and total elapsed time. Set
`BENCHMARK_URL` to override the default localhost port 5173 and
`BENCHMARK_OUTPUT` to choose the JSON report path. First-use network and Wasm
initialization costs must be distinguished from subsequent build costs.

## Validation

Focused tests cover shared-prefix selection, missing includes, macros,
conditionals, multiple source files, binary path collisions, missing artifacts,
immutable byte snapshots, clearing artifacts, corrupt/download-failure fallback,
and the existing C++/Python session lifecycle. Browser results are recorded below.

On 2026-09-24, Chromium headless 151.0.7922.34 on an Intel i7-8850H Mac
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

If the upstream compiler/sysroot changes behind its URL, Clang may reject an
otherwise intact cached PCH. Demo inputs explicitly opt into one Debug source retry
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
