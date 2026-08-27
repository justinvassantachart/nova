# Web IDE host and package architecture

Status: the deployed product is Web IDE, and this repository is its first host.
The reusable workbench is integrated as the relative npm workspace package at
`packages/web-ide`. Its reusable source matches Web IDE `0.3.1` source commit
`ed271757daf80c3ded7ae2b4a67d74102ebf2435`.

## Dependency direction

```text
Web IDE site host
  routing / Firebase / LMS / lessons / replay / deployment policy
    -> WebIDEHostProvider and host-created Assignment activity
      -> public `web-ide` package exports
        -> selected runtime provider
        -> selected test provider and generic Tests UI
        -> selected language-tooling provider
        -> core workbench and optional panels
```

The dependency is one way. The package contains no router, Firebase SDK,
authentication, LMS, assignment, lesson, replay, or deployment configuration.
The root host does not import package source paths, private React contexts, VFS
modules, or Zustand stores. It consumes only the exports declared by
[`packages/web-ide/package.json`](../../packages/web-ide/package.json):

- `web-ide`
- `web-ide/host`
- `web-ide/plugins`
- `web-ide/runtimes`
- `web-ide/testing`
- `web-ide/language-tools`
- `web-ide/styles.css`

The internal `src/nova` directory name is retained for migration compatibility;
it is not the product name or a package boundary.

## Site composition

[`src/nova/configuration.ts`](../../src/nova/configuration.ts) registers and
selects the current C++ composition:

1. `web-ide.runtime.cpp` from `web-ide/runtimes`;
2. `web-ide.testing.cpp` and the generic Tests UI from `web-ide/testing`;
3. `web-ide.language-tooling.cpp` from `web-ide/language-tools`;
4. the core workbench and optional Canvas contribution;
5. the host-created Assignment activity plugin.

The shared configuration preserves Web IDE's ordinary Explorer/persisted
sidebar default. Mounts wrapped in Nova's assignment context use a second
static configuration whose public `initialLayout.selectedActivityId` is the
installed `nova.assignment` contribution. Standalone and lesson mounts omit
that field. Nova does not import the mount-owned layout controller, click DOM,
or write Web IDE's sidebar preference.

[`src/main.tsx`](../../src/main.tsx) remains the application shell. It owns the
route table, authentication provider, service-worker gate, lesson pages, LMS
pages, replay pages, and the standalone `/ide` route. The root site at
[webide.org](https://webide.org) is therefore an application that embeds Web
IDE, not package code disguised as an application.

The host-specific integrations remain outside the package:

- Assignment context, Firestore persistence, and session recording are root
  application concerns.
- Guided lessons create a `WebIDEHost`, retain a narrow
  `WebIDEInstanceHandle`, and observe immutable public snapshots and typed
  events. They do not read package stores.
- Replay consumes recorded host events and reconstructs application state. It
  is not a Web IDE plugin or a package dependency.

## Public contracts

### Host

`WebIDEHost` supplies workspace identity, initial files, local-cache policy,
read-only behavior, persistence callbacks, chrome choices, and an event sink.
`WebIDEHostProvider` makes that contract available to one workbench. The host
owns user identity and storage credentials; the package never receives them.

`WebIDEInstanceHandle` is an intent-level embedding API. It exposes immutable
snapshots, subscriptions, file-opening requests, and reset behavior without
exposing React contexts or Zustand state. Web IDE 0.3.1 additionally exposes a
persistable `/workspace` projection plus awaited flush and close operations;
close keeps persistence retryable when save or flush fails.

### Runtime

`RuntimeProvider` describes a backend-neutral execution option and creates one
mount-owned `RuntimeSession`. A session receives a copied
`RuntimeExecutionPlan`, starts and stops its backend, accepts optional stdin and
debug operations, emits typed events, and releases its listeners/workers during
disposal.

The packaged C++ and Python providers currently wrap a browser execution
library internally. Hosts and plugins depend on Web IDE's provider/session
contract, not that library's object model. This intermediary keeps the
workbench, testing UI, and host application stable if the backend is upgraded
or replaced.

Runtime capabilities drive the UI. A run-only provider does not expose Debug,
Variables, or Graph controls. The current production composition supports C++
run and debug. The optional Python provider also supports source debugging and
unittest execution; Rust execution is not claimed. Additive settlement methods
allow awaited stop/dispose while preserving older synchronous provider
contracts and numeric exit events.

### Testing

Testing is separate from runtime execution. A `TestProvider` owns framework
support files, source transforms, the test runner plan, and a fresh output
parser. It produces an ordinary runtime execution plan plus structured
`TestEvent` values. The selected runtime executes the plan; the generic Tests
panel renders the events without knowing the language or framework protocol.

The packaged C++ provider preserves `nova_test.h`, `STUDENT_TEST`, and
`EXPECT_EQUALS` source compatibility. Its generated support files and hidden
runner are ephemeral: they are not written into the user's VFS, explorer,
local cache, snapshot, or host persistence. A Python standard-library
`unittest` provider is also available for a Python composition.

### Language tooling

`LanguageToolingProvider` is selected independently of runtime and testing. It
owns an optional Monaco language service, worker, supplemental declarations,
status, preferences, and cleanup. The current C/C++ clangd provider is opt-in
through `web-ide/language-tools`; importing the package root does not eagerly
load its worker integration.

The C++ test provider can expose editor-only declarations to language tooling
without adding those files to the workspace. Omitting language tooling leaves
Monaco syntax support and the rest of the editor usable.

### Plugins

`IDEPlugin` is an open contribution contract. A host or third-party package can
register activities, commands, panels, workspace resources, runtime providers,
test providers, and language-tooling providers. Activation receives public
facades and scoped disposal; it never receives private workbench stores.

Panel and activity components receive only mount-scoped execution,
owner-scoped source-presentation, immutable workspace, selected-runtime, and
panel-reveal facades. Workspace resources are either ordinary editable seeds or
execution-only `/sysroot` inputs excluded from VFS and host persistence.

Built-in workbench, Canvas, and Tests contributions use this same mechanism.
They are examples of composition, not a closed catalog.

## Ownership boundaries

| Concern | Owner |
| --- | --- |
| Editor, workbench layout, VFS, terminal, debug surfaces | `packages/web-ide` core |
| C++/Python process execution and debug capabilities | Selected runtime provider |
| C++ test framework or Python `unittest` preparation/parsing | Selected test provider |
| Tests results presentation | Generic testing plugin |
| clangd worker and Monaco registrations | Selected language-tooling provider |
| Canvas presentation | Optional generic panel contribution |
| Routes, users, Firebase, classes, assignments, lessons, replay | Root site host |
| Product-specific activities and persistence | Host-created plugins and `WebIDEHost` |

## Karel boundary

Karel is not bundled in this repository, in `packages/web-ide`, or in the root
teaching application. A Karel integration belongs in a separate companion
package/repository that consumes the public plugin API. That companion would
own its panel, world model, Python library, framed event protocol, workspace
resources, and cleanup, while the host separately selects a compatible Python
runtime provider.

This separation matters because neither the interpreter nor a particular Karel
implementation is a workbench concern. An application can register its own
activity plugin, choose an independently maintained companion, replace it, or
omit it.

## Source and distribution model

The root package manifest declares an npm workspace and a relative dependency:

```json
{
  "workspaces": ["packages/web-ide"],
  "dependencies": {
    "web-ide": "file:packages/web-ide"
  }
}
```

Therefore local development, CI, and deployment never depend on a developer's
absolute filesystem path. `npm install` links the in-repo package, and root
build/validation scripts build it before the application.

The workspace package is a maintained mirror of the public standalone Web IDE
repository's immutable `web-ide-v0.3.1-source` checkpoint, with
workspace-specific package scripts and consumer tooling. Web IDE is MIT
licensed and Hamilton has independently verified an exact immutable private
release asset, but it is not published to npm. Nova continues using the
relative mirror because an exact private-asset dependency would require a
portable authenticated bootstrap for local development, CI, and deployment.
Changes must be synchronized intentionally and validated in both contexts; an
absolute sibling `file:` dependency is prohibited.

## Browser and deployment requirements

The C++ runtime and optional clangd integration use WebAssembly and
`SharedArrayBuffer`. IDE routes require compatible Cross-Origin-Opener-Policy
and Cross-Origin-Embedder-Policy headers. The package cannot set response
headers, so the host owns those rules, along with CSP, CORS/CORP, caching,
service-worker, authentication, and route policy. This repository's
`netlify.toml` and `public/coep-sw.js` implement the current site policy.

## Remaining limitations

- One workbench mount per JavaScript realm is supported. Runtime/plugin
  lifecycles are mount-scoped, but several legacy UI stores and the VFS remain
  module singletons.
- Read-only mode is a user-interface policy, not a security boundary.
- Rust and end-to-end graphics execution are not complete. Python run,
  debugging, variables, and unittest execution are supported by the optional
  provider.
- Browser execution and clangd still use external WebAssembly/toolchain assets.
- Authenticated Firebase/LMS browser coverage needs a configured test project;
  it is not part of an unauthenticated local package test.
- The package remains private and unpublished to npm. Replacing Nova's source
  mirror with a remote artifact still requires explicit authentication,
  provenance, cache, rollback, and deployment decisions.

For consumer-facing package details, see
[`packages/web-ide/README.md`](../../packages/web-ide/README.md) and its
[`architecture document`](../../packages/web-ide/docs/architecture.md).
