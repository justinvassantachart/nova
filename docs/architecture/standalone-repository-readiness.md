# Standalone repository and mirror status

Status: Web IDE has a public standalone source repository and an immutable
`0.3.1` source checkpoint. Nova continues to consume a reviewed relative
workspace mirror so its local, CI, and deployment builds do not depend on an
absolute developer path or an authenticated private-release download.

## Current identities

- The deployable Nova/Web IDE host application is the root of this repository.
- The reusable package used by that application is `packages/web-ide`.
- Reusable source matches tag `web-ide-v0.3.1-source` at
  `ed271757daf80c3ded7ae2b4a67d74102ebf2435`.
- The workspace package is `web-ide@0.3.1`, MIT licensed, exact-pinned to
  `debugger-sh@0.3.15`, `private: true`, and unpublished to npm.
- Hamilton separately retains immutable private-release asset
  `web-ide-0.3.1.tgz` with SHA-256
  `4397b6733d19b69941ce225e5d3cf98fa9fcdaf6b27f93f36b35ea8d3e3d37ae`.
- Karel remains a separate companion concern and is not part of Nova's C++
  composition.

The root manifest uses `file:packages/web-ide` and npm workspaces. A clean
checkout therefore builds without the sibling standalone repository or a
machine-specific path. The root lock records the workspace package as 0.3.1 and
the exact browser shim/runtime dependency graph.

## Separated boundary

The reusable package contains:

- package metadata, ESM subpath exports, generated declarations, and compiled
  workbench CSS;
- editor, VFS, terminal, workbench, debugger surfaces, and public host/plugin
  contracts;
- backend-neutral runtime provider/session contracts and optional C++/Python
  browser providers;
- mount-owned initial activity/panel layout, shared contributed execution,
  owner-scoped source presentation, execution-only resources, settled runtime
  lifecycle, and awaited workspace close;
- the generic Tests workflow plus C++ and Python test providers;
- optional C/C++ clangd language tooling behind a separate public subpath;
- unit, contract, integration, workbench, testing, and packed-consumer checks;
- MIT and third-party license/notices plus public contract documentation.

It does not contain:

- site routing or deployment configuration;
- Firebase, authentication, classes, assignments, or submissions;
- guided lessons or session replay;
- host credentials, production data, or user data;
- Karel code, Karel worlds, or a bundled Karel Python library;
- a closed list of allowed third-party plugins.

The root host imports only declared package exports and supplies its Assignment
activity as an ordinary host-created plugin. Assignment-backed mounts select
that installed activity through
`WebIDEConfiguration.initialLayout.selectedActivityId`; standalone and lesson
mounts omit the field. Lessons use the public `WebIDEInstanceHandle`, and replay
uses typed host events. No host path imports Web IDE stores, VFS, Monaco, or
private React contexts.

## Mirror policy

The in-repo workspace and standalone source are not automatically synchronized.
For each upstream change:

1. select an exact source commit/tag and validate the standalone repository;
2. mirror reusable source, applicable tests, licenses, notices, and public docs;
3. retain only Nova-specific package scripts and packed-consumer layout;
4. update both manifests and the root lockfile intentionally;
5. compare reusable source bytes and run both repositories' gates.

Do not introduce an absolute local `file:` dependency or combine contributions
from two Web IDE package instances. Switching Nova to the private Hamilton
asset, Git, a public release, or npm requires a separate reviewed migration with
portable authentication/bootstrap, exact integrity, React deduplication, cache,
rollback, and deployment behavior.

## Validation gate

From the Nova repository root:

```sh
npm install --ignore-scripts
npm --workspace web-ide run validate
npm run lint:app
npm run test:app
npm run typecheck
npm run build
npm audit --omit=dev
npm audit
```

The standalone source owns the production Playwright matrix for real C++ and
Python runtime behavior. Before a deployment to
[webide.org](https://webide.org), also smoke-test the built Nova site:

- the landing page and navigation;
- `/ide` editing, C++ Run, Debug, terminal input/output, and a real
  `STUDENT_TEST` result;
- `/learn` lesson loading and public-handle checks;
- an assignment route with Assignment initially selected and Explorer
  available second;
- sign-in routing and a configured non-production Firebase flow when
  authentication or LMS code changed;
- cross-origin isolation on IDE routes and the non-isolated policy on `/` and
  `/login`.

Authenticated Firebase checks require a test project and account. They must not
use production data merely to validate the package boundary.

## Known limitations

- One Web IDE mount per JavaScript realm is supported because legacy VFS and
  several workbench stores remain module-scoped.
- C++ run/debug is Nova's production path. The optional Python provider supports
  run, source debugging, variables, and unittest execution; Rust is absent.
- The generic Canvas contribution does not by itself provide a graphics
  runtime.
- Browser execution, Monaco, and clangd depend on reviewed external assets and
  correct host COOP/COEP/CSP/CORS/CORP behavior.
- Automated authenticated LMS and live clangd browser coverage require more
  infrastructure than the package-level suite provides.
- The current production dependency audit reports zero known vulnerabilities.
  The full Nova development tree reports eight moderate `uuid` advisories
  through Firebase Admin's Google Cloud tooling. npm's proposed automatic fix
  moves `firebase-admin` across a semver-major boundary, so it was not applied
  as part of this Web IDE migration.
- The mirror can drift unless exact source comparison remains part of every
  update.

## Future distribution decisions

An npm release still needs explicit namespace ownership, account controls,
provenance, CI, and long-term artifact policy. A direct private-release
dependency needs a least-privilege authenticated bootstrap that works in local
development, CI, and deployment without committing credentials. Neither change
is required for Nova to consume the current exact 0.3.1 source mirror.

Publishing Web IDE does not authorize publishing Karel or moving
Firebase/LMS/lesson/replay behavior into the reusable package.
