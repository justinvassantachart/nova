# Web IDE

Web IDE is an embeddable browser workbench extracted from Nova. It provides a
Monaco editor, virtual workspace, terminal, debugging UI, contribution
registries, typed runtime events, host persistence, and plugin lifecycle APIs.

This repository is a local, private extraction. It has no remote and no
publication license yet. The current built-in browser runtime providers support
C/C++ execution and debugging plus Python execution. Python debugging and Rust
are not claimed as supported here. The provider-neutral session contract does
not expose the underlying engine package.

## Quick start

```tsx
import { createRoot } from 'react-dom/client'
import {
  WebIDE,
  WebIDEHostProvider,
  initWebIDETheme,
  type WebIDEConfiguration,
} from 'web-ide'
import { cppRuntimePlugin } from 'web-ide/runtimes'
import { cppTestingPlugin, testingPlugin } from 'web-ide/testing'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { coreWorkbenchPlugin } from 'web-ide/plugins'
import 'web-ide/styles.css'

const configuration: WebIDEConfiguration = {
  runtimeProvider: 'web-ide.runtime.cpp',
  languageToolingProvider: 'web-ide.language-tooling.cpp',
  testProvider: 'web-ide.testing.cpp',
  plugins: [
    cppRuntimePlugin,
    cppLanguageToolingPlugin,
    cppTestingPlugin,
    coreWorkbenchPlugin,
    testingPlugin,
  ],
}

initWebIDETheme()
createRoot(document.getElementById('root')!).render(
  <WebIDEHostProvider
    host={{
      workspace: {
        id: 'example-v1',
        initialFiles: { '/workspace/main.cpp': 'int main() { return 0; }' },
      },
    }}
  >
    <div style={{ width: '100vw', height: '100vh' }}>
      <WebIDE configuration={configuration} />
    </div>
  </WebIDEHostProvider>,
)
```

The runnable example is in `examples/basic`.

The packaged browser runtime providers currently use Debugger.sh internally,
but that implementation name is not part of the public provider/session API.
Because the consuming application performs the final bundle, configure
`vite-plugin-wasm`, `vite-plugin-top-level-await`, the required Node polyfills,
and the dependency pre-bundling exclusion:

```ts
plugins: [
  wasm(),
  topLevelAwait(),
  nodePolyfills({
    include: ['buffer', 'process', 'stream', 'path', 'events'],
    globals: { Buffer: true, process: true },
  }),
],
optimizeDeps: { exclude: ['debugger-sh'] },
worker: { format: 'es', plugins: () => [wasm(), topLevelAwait()] },
build: { target: 'esnext' },
```

See `examples/basic/vite.config.ts` for the complete local configuration,
including the response headers required by the runtime.

## Package surface

- `web-ide` — React component, host provider, runtime/event/plugin contracts,
  and the narrow `WebIDEInstanceHandle` host facade.
- `web-ide/host` — lightweight host provider, hook, and host/event types. This
  subpath is safe to import in Node-side rendering and tests.
- `web-ide/plugins` — optional core workbench and Canvas contributions. It
  retains `testingPlugin` as a compatibility alias.
- `web-ide/runtimes` — optional C/C++ and Python browser runtime providers.
- `web-ide/testing` — the generic Tests UI plus C++ and Python unittest
  testing providers.
- `web-ide/language-tools` — the optional C/C++ clangd provider and its
  preference helpers. Core imports do not load the clangd worker integration.
- `web-ide/styles.css` — compiled workbench styles and Codicon assets.

Internal React contexts, registries, VFS modules, and Zustand stores are not
package exports. Plugins receive public runtime/workspace/panel facades only.

## How the pieces fit

| Piece | Owns | Does not own |
| --- | --- | --- |
| Web IDE core | editor, VFS, terminal, workbench layout, typed contracts, registries, lifecycle | a language toolchain, test framework, LMS, lessons, replay, or Karel |
| Runtime provider | one language backend session: prepare files, start/stop, stdin, debug operations, and typed runtime events | workspace persistence, panels, or test-framework parsing |
| Test provider | framework support files, per-run transforms/runner, and translation into generic `TestEvent` values | process execution or the Tests UI |
| Language-tooling provider | optional Monaco language service and its worker/cleanup | program execution |
| Plugin | declarative panels, activities, commands, resources, and any providers it chooses to contribute | private Web IDE stores |
| Host application | composition, workspace identity/persistence, chrome, routing, and application features | Web IDE internals |

The host selects providers by ID and passes their plugins in
`WebIDEConfiguration`. Registration and selection are separate on purpose: a
host may register several implementations but selects exactly one runtime and,
optionally, one test and language-tooling provider for a workbench.

For a Python workbench with the generic Tests UI:

```tsx
import { pythonRuntimePlugin } from 'web-ide/runtimes'
import { pythonTestingPlugin, testingPlugin } from 'web-ide/testing'
import { coreWorkbenchPlugin } from 'web-ide/plugins'

const configuration: WebIDEConfiguration = {
  runtimeProvider: 'web-ide.runtime.python',
  testProvider: 'web-ide.testing.python-unittest',
  plugins: [
    pythonRuntimePlugin,
    pythonTestingPlugin,
    coreWorkbenchPlugin,
    testingPlugin,
  ],
}
```

Python is run-only today, so the Debug command and Variables/Graph panels are
automatically hidden by capability predicates. Monaco still supplies Python
syntax support without a selected language-tooling backend.

## Bring your own runtime or plugin

`RuntimeProvider` is the stable boundary around any execution engine, whether
it is a browser library, worker, remote service, or host implementation:

```ts
import type { IDEPlugin, RuntimeProvider } from 'web-ide'

const myRuntimeProvider: RuntimeProvider = {
  id: 'my-app.runtime.python',
  label: 'My Python runtime',
  languageIds: ['python'],
  capabilities: {
    debug: false,
    breakpoints: false,
    stdin: true,
    graphics: false,
  },
  createSession() {
    return new MyPythonRuntimeSession()
  },
}

export const myRuntimePlugin: IDEPlugin = {
  id: 'my-app.runtime.python.plugin',
  contributes: { runtimeProviders: [myRuntimeProvider] },
}
```

`MyPythonRuntimeSession` implements the exported `RuntimeSession` contract. A
new instance receives a copied `RuntimeExecutionPlan` in `prepare`, starts the
backend in `start`, publishes only the typed event channels, stops promptly,
and releases workers/listeners in `dispose`. The session never receives React
stores or host credentials. See `src/web-ide/contracts/runtime.ts` and the
contract tests under `tests/contracts` for the exact lifecycle.

## Testing providers

Testing is a workbench workflow, not a runtime mode. A `TestProvider` receives
an immutable workspace snapshot and returns an ephemeral `RuntimeExecutionPlan`
plus a fresh output parser. The runtime session sees only prepared files, an
optional entrypoint, and ordinary `run`/`debug` execution. The parser translates
framework-specific output into public structured `TestEvent` values consumed by
the optional generic Tests panel.

`cppTestingPlugin` preserves Nova's `nova_test.h`, `STUDENT_TEST`, and
`EXPECT_EQUALS` behavior. It supplies the header and implementation for Tests
or when ordinary C++ source references `nova_test.h`; unrelated Run
and Debug commands do not pay for an extra test-framework compilation. Tests
also add a copied hidden-main transform and synthetic runner.
`pythonTestingPlugin` supplies an ephemeral standard-library `unittest`
discovery runner. Neither provider writes generated files to the workspace,
local cache, explorer, or host persistence.

Hosts may set `configuration.testProvider` explicitly. When it is omitted, Web
IDE selects a provider only if exactly one registered provider supports a
language exposed by the selected runtime; ambiguous matches leave testing
unavailable until the host chooses one.

Test providers may expose ephemeral `editorSupportFiles`. The selected language
tooling provider can index those declarations without adding them to the VFS,
file explorer, host snapshot, or persistence. The C++ provider uses this seam to
offer completion for `STUDENT_TEST` and `EXPECT_EQUALS` from `nova_test.h`.

## Language tooling providers

Language tooling is optional and selected independently from execution and
testing. A host opts into the packaged C/C++ backend by registering
`cppLanguageToolingPlugin` and setting `languageToolingProvider` to
`web-ide.language-tooling.cpp`. A selected provider must share at least one
language ID with the selected runtime; mismatches fail fast as configuration
errors. Omitting both leaves Monaco usable with its built-in syntax support;
editor focus, the status bar, and settings remain safe for Python, Karel, or
custom runtimes without a language backend.

The C/C++ provider preserves lazy startup, completion, hover, signatures,
definitions, symbols, diagnostics, and the existing clangd preference. A
read-only workspace disables backend startup. Provider effects own the worker,
Monaco registrations, workspace synchronization, diagnostics, and teardown.

## Host-created plugins are first class

Any consuming application can create, own, register, omit, or replace a plugin:

```tsx
import type { IDEPlugin } from 'web-ide'

export const notesPlugin: IDEPlugin = {
  id: 'my-app.notes',
  contributes: {
    activities: [{
      id: 'my-app.notes.activity',
      title: 'Notes',
      icon: 'note',
      component: ({ workspace }) => (
        <pre>{Object.keys(workspace.snapshot()).join('\n')}</pre>
      ),
    }],
    resources: [{
      id: 'my-app.notes.seed',
      files: { '/activity/readme.txt': 'Host-owned plugin resource' },
    }],
  },
  activate(context) {
    if (context.runtime) {
      context.register(context.runtime.events.stdout.subscribe(console.log))
    }
  },
}
```

Karel is deliberately not present in this repository. The separately
maintained `@web-ide/karel` companion lives in the local sibling
`../web-ide-karel` repository. It consumes this same public plugin API, owns its
panel/Python library/world/protocol, and is supplied by the host. It does not
provide or import a Python interpreter; the host composes it with any selected
Python runtime provider. Web IDE does not maintain a closed plugin catalog.

## Local development

Requires Node 20.19 or newer.

```sh
npm install
npm run validate
npm run dev
```

`npm run validate` checks lint, types, the unit/integration suite, the library
and example builds, package contents, and a fresh consumer that installs the
packed tarball without source aliases or sibling imports.

For a normal sibling Nova clone, use `"web-ide": "file:../web-ide"`, build Web
IDE first, and add `resolve.dedupe: ['react', 'react-dom']` while locally linked.
The isolated Codex worktree uses an absolute `file:` dependency only for local
verification; that path is not a publishing strategy.

## Browser and runtime requirements

Debugger.sh and the optional clangd provider use WebAssembly and
`SharedArrayBuffer`. A host using either backend must serve IDE pages with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The package cannot set response headers. The basic example configures them for
Vite development and preview. The host is also responsible for compatible CSP,
CORS/CORP, service-worker, authentication, and route policies.

Monaco, Debugger.sh toolchains, and optional clangd assets are online runtime
dependencies today. `VITE_CLANGD_WASM_URL` and `VITE_CLANGD_JS_URL` can point to
host-owned, versioned clangd assets. The public upstream service is only a
best-effort default.

## Current limitations

- One mounted `<WebIDE>` per JavaScript realm is supported. Runtime sessions and
  plugin managers are mount-scoped; legacy workbench stores and VFS are not yet.
- `workspace.readOnly` disables editing, explorer mutation, and selected
  language-tooling startup, but it is a UI policy rather than a security boundary.
- Workspace resources seed a workspace. Version the workspace ID when a plugin
  resource upgrade must replace browser-local cached content.
- C++ run/debug and Python run are verified. The separate Karel companion has a
  real-browser Python/nested-import regression, but is not included in this
  package. Python debugging, Rust, and end-to-end graphics output remain future
  provider/plugin work.
- The C++ clangd backend still ships in this package, isolated behind the
  opt-in `web-ide/language-tools` subpath rather than independently versioned.

See [architecture](docs/architecture.md), [Nova migration](docs/nova-migration.md),
and [publishing readiness](docs/publishing-readiness.md).
