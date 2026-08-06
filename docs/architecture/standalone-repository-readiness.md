# Standalone repository readiness

Status: Web IDE is integrated into the deployed-site repository as an npm
workspace. A separate local package candidate exists for review, but no
standalone remote, release, or package publication is part of the site build.

## Current source locations

- The deployable Web IDE host application is the root of this repository.
- The reusable package used by that application is `packages/web-ide`.
- The package source is mirrored from the standalone local review candidate at
  `/Users/justinvassantachart/Projects/web-ide`.
- Karel is a separate companion concern and is not present in either the root
  application bundle or `packages/web-ide`.

The root manifest uses `file:packages/web-ide` and npm workspaces. It has no
machine-specific dependency path, and deployment does not need the standalone
local directory. The in-repo copy is the package input for the site until a
published package, Git dependency, or release artifact is explicitly chosen.

The standalone candidate currently has local Git metadata but no commit or
remote. It remains `private: true` and `UNLICENSED`. Those facts describe a
review candidate, not an authorized public repository.

## What has been separated

The reusable package contains:

- package metadata, ESM subpath exports, generated declarations, and compiled
  workbench CSS;
- editor, VFS, terminal, workbench, debugger surfaces, and public host/plugin
  contracts;
- backend-neutral runtime provider/session contracts and optional C++/Python
  browser providers;
- the generic Tests workflow plus C++ and Python test providers;
- optional C/C++ clangd language tooling behind a separate public subpath;
- unit, contract, integration, workbench, testing, and packed-consumer checks;
- architecture, integration, third-party, and publication-readiness notes.

It does not contain:

- site routing or deployment configuration;
- Firebase, authentication, classes, assignments, or submissions;
- guided lessons or session replay;
- host credentials, production data, or user data;
- Karel code, Karel worlds, or a bundled Karel Python library;
- a closed list of allowed third-party plugins.

The root host imports only declared package exports and supplies its Assignment
activity as an ordinary host-created plugin. Lessons use the public
`WebIDEInstanceHandle`; replay uses the typed host-event stream. These are the
consumer paths that prove the package boundary without copying application
logic into the workbench.

## Mirror policy before publication

The in-repo workspace and standalone review candidate are not automatically
synchronized. Their source, tests, and documentation should remain equivalent,
while package scripts and example-app layout may differ to fit their respective
repository roots.

Until distribution is authorized:

1. make deployed-site changes against `packages/web-ide` and its public API;
2. deliberately synchronize reusable source/tests/docs with the standalone
   candidate;
3. review any metadata differences rather than copying manifests blindly;
4. run validation in the root workspace and in the standalone candidate;
5. keep the root dependency relative and reproducible.

Do not introduce an absolute local `file:` dependency. When an official remote
or package exists, replace the mirrored copy only through a reviewed migration
that preserves the same public exports and reruns the host regression suite.

## Validation gate

From the deployed-site repository root:

```sh
npm install
npm run validate
```

The root `validate` script runs the package's lint, tests, type check, library
build, packed fresh-consumer check, and package-content check before validating
and building the site host. Useful narrower checks are:

```sh
npm --workspace web-ide run validate
npm run lint:app
npm run test:app
npm run typecheck
npm run build
```

The standalone candidate must pass its own `npm run validate` from its
repository root. Before any release, install its packed tarball in a clean
consumer and confirm that it cannot resolve root-site aliases or files.

Before a deployment to [webide.org](https://webide.org), also smoke-test the
actual production build in a browser:

- the landing page and navigation;
- `/ide` editing, C++ Run, Debug, terminal input/output, and a real
  `STUDENT_TEST` result;
- `/learn` lesson loading and public-handle checks;
- sign-in routing and a configured non-production Firebase class/assignment
  flow when authentication or LMS code changed;
- cross-origin isolation on IDE routes and the non-isolated policy on `/` and
  `/login`.

Authenticated Firebase checks require a test project and account. They should
not use production data merely to validate package extraction.

## Known limitations

- One Web IDE mount per JavaScript realm is supported because several legacy
  UI stores and VFS services remain module-scoped.
- C++ run/debug is the verified production path. Python run is available, but
  Python debugging is not; Rust is not implemented.
- The generic Canvas contribution does not by itself provide a graphics
  runtime.
- The optional clangd provider and browser runtimes depend on external
  WebAssembly/toolchain assets and host cross-origin-isolation policy.
- Automated authenticated LMS and live clangd browser coverage require more CI
  infrastructure than the package-level suite provides.
- The production audit currently reports React Router's RSC-action CSRF
  advisory. This site uses client-only `BrowserRouter` routes and does not
  enable React Server Components or server actions. npm's offered remediation
  is a forced downgrade to 7.11.0, so it was not applied; continue tracking a
  patched compatible release.
- The mirror workflow can drift until a single published source of truth is
  selected; source/package diff review remains part of every sync.
- Private/unlicensed metadata prevents accidental publication but is not a
  substitute for a license and redistribution audit.

## Decisions required for a standalone release

The following require explicit maintainer decisions before creating a remote,
publishing a package, or advertising a standalone release:

- open-source license and third-party redistribution review;
- repository owner, name, visibility, default branch, protections, and CI;
- npm name/scope, version, provenance, and publication strategy;
- ownership and hosting policy for compiler, runtime, Monaco, and clangd assets;
- CSP, CORS/CORP, caching, privacy, uptime, and version-pinning policy;
- whether language tooling/runtime/testing remain subpath exports or later
  become independently versioned packages;
- the migration plan from the in-repo mirror to the selected artifact;
- separate repository/package ownership and release policy for any Karel
  companion.

Publishing Web IDE does not authorize publishing Karel, changing the deployed
site, or moving Firebase/LMS/lesson/replay code. Each external change should be
reviewed and authorized independently.
