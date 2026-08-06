# Web IDE

Web IDE is a browser-based C++ workspace with editing, compilation,
step-through debugging, tests, a terminal, and memory visualization. The live
site is [webide.org](https://webide.org).

This repository contains both the deployed site and the reusable workbench it
embeds. The two layers are kept separate so the workbench can later be released
as its own package without moving the site's Firebase, course, or replay code
with it.

## What is included

- Monaco editing with C/C++ syntax support and optional clangd completion,
  hover, diagnostics, and navigation
- in-browser C++ compilation and execution
- breakpoints, step controls, call stacks, variables, and memory graphs
- a virtual multi-file workspace that persists in the browser
- terminal input and output
- `STUDENT_TEST`/`EXPECT_EQUALS` support with a generic Tests panel
- an optional Canvas panel for runtimes or plugins that emit graphics events
- guided C++ lessons at `/learn`
- Firebase-backed classes, assignments, submissions, and teacher review
- recorded student-session replay

The reusable workbench is not tied to the teaching application. Runtime,
testing, language-tooling, panel, command, and activity integrations are
registered through public contracts.

## Site routes

| Route | Purpose | Sign-in |
| --- | --- | --- |
| `/` | Product landing page | No |
| `/ide` | Standalone Web IDE workspace | No |
| `/learn` | Guided lesson catalog and lesson runner | No |
| `/login` | Account sign-in | No |
| `/dashboard`, `/classes/...` | Classes, assignments, submissions, and replay | Yes |

## Repository structure

```text
src/                       deployed site host
  lms/                     Firebase-backed teaching workflows
  lessons/                 guided course and lesson host
  replay/                  session reconstruction and playback
  nova/                    legacy internal path for site composition
packages/web-ide/          reusable Web IDE workspace package
docs/architecture/         extraction and release-readiness notes
```

The root application owns routing, authentication, Firebase persistence, LMS
screens, lessons, replay, and deployment behavior. `packages/web-ide` owns the
editor workbench, VFS, terminal, debugger surfaces, typed contracts, and
optional providers. Root application code imports only the package's public
exports (`web-ide`, `web-ide/host`, `web-ide/plugins`, `web-ide/runtimes`,
`web-ide/testing`, and `web-ide/language-tools`).

See [the extraction architecture](docs/architecture/web-ide-extraction.md) for
the complete boundary.

## Local development

Node.js 20.19 or newer is required.

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. The development command builds the Web IDE
workspace package first and then starts the complete site. Changes to the site
are handled by Vite; after changing package source, restart the root development
command or run the package watcher in a second terminal:

```sh
npm --workspace web-ide run dev
```

Useful checks:

```sh
npm run validate                 # package + site lint, tests, types, and build
npm run test                     # package and site tests
npm run typecheck                # package and site TypeScript checks
npm run build                    # production package and site build
npm run build:web-ide            # package build only
npm --workspace web-ide run validate
```

## Embedding the workbench

The site composes Web IDE using the same public API available to another host:

```tsx
import { WebIDE, type WebIDEConfiguration } from 'web-ide'
import { cppLanguageToolingPlugin } from 'web-ide/language-tools'
import { canvasPlugin, coreWorkbenchPlugin } from 'web-ide/plugins'
import { cppRuntimePlugin } from 'web-ide/runtimes'
import { cppTestingPlugin, testingPlugin } from 'web-ide/testing'
import 'web-ide/styles.css'

const configuration: WebIDEConfiguration = {
  brand: 'WEB IDE',
  runtimeProvider: 'web-ide.runtime.cpp',
  testProvider: 'web-ide.testing.cpp',
  languageToolingProvider: 'web-ide.language-tooling.cpp',
  plugins: [
    cppRuntimePlugin,
    cppTestingPlugin,
    cppLanguageToolingPlugin,
    coreWorkbenchPlugin,
    canvasPlugin,
    testingPlugin,
  ],
}

export function Workspace() {
  return <WebIDE configuration={configuration} />
}
```

An application that needs controlled workspace identity, seed files,
persistence, read-only behavior, or event recording wraps the component with
`WebIDEHostProvider` from `web-ide/host`. The package README at
[packages/web-ide/README.md](packages/web-ide/README.md) documents the host,
runtime, testing, language-tooling, and plugin contracts in detail.

### Extension boundaries

| Extension | Responsibility |
| --- | --- |
| Runtime provider | Prepare a copied execution plan; start, stop, and optionally debug one backend session; emit typed runtime events |
| Test provider | Supply framework files and transforms, prepare a test runner, and parse its output into generic test events |
| Language-tooling provider | Own an optional editor language service and all worker/Monaco cleanup |
| Plugin | Contribute panels, activities, commands, resources, or providers through public facades |
| Host application | Choose the composition and own routing, identity, persistence, and product-specific workflows |

The packaged C++ runtime uses a browser execution dependency internally, but
the public API is backend-neutral. Tests are not a special runtime: the C++
test provider prepares an ordinary execution plan, the selected runtime runs
it, and the generic Tests panel renders structured results.

Karel is deliberately not bundled in this repository or in Web IDE. A Karel
integration belongs in a separate companion package that consumes the open
plugin API and is composed by its host with a compatible Python runtime. Web
IDE does not contain a closed plugin catalog.

## Firebase setup for the teaching features

The standalone IDE and anonymous lessons run without Firebase configuration.
Classes, assignments, submissions, authenticated lesson telemetry, and replay
require a Firebase project.

1. Create a Firebase project and register a Web application.
2. Enable Google sign-in under **Authentication → Sign-in method**.
3. Create a Firestore database in production mode.
4. Copy `.env.example` to `.env.local` and fill in the six values from the
   Firebase web-app configuration:

   ```sh
   cp .env.example .env.local
   ```

   | Firebase field | Environment variable |
   | --- | --- |
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

5. Publish the repository's `firestore.rules` in the Firebase console, or use
   the Firebase CLI:

   ```sh
   firebase deploy --only firestore:rules
   ```

The rules are required: they enforce per-class teacher access and per-student
submission access. Do not deploy the LMS against an unrestricted database.

## Deployment notes

`npm run build` produces the static site in `dist/`. The included
`netlify.toml` supplies SPA routing, cache policy, and the cross-origin headers
required by the browser runtime and clangd workers. A different host must
reproduce those policies, including the non-isolated landing/sign-in routes
and the isolated IDE routes. Set the same `VITE_FIREBASE_*` variables in the
hosting environment when deploying the teaching features.

The in-repo package is currently mirrored from the separate local Web IDE
review candidate at `/Users/justinvassantachart/Projects/web-ide`. The deployed
site depends only on the relative workspace package at `packages/web-ide`; it
does not depend on that machine-specific path. Publication, a package registry,
or a separate remote has not yet been authorized.

## Current limitations

- One mounted Web IDE workbench per JavaScript realm is supported; some legacy
  workbench state and VFS services are still module-scoped.
- C++ run/debug is the production path. Python run exists as an optional
  provider, but Python debugging is not supported; Rust is not implemented.
- The Canvas contribution is generic, but working end-to-end graphics output
  still requires a runtime or companion plugin that emits graphics events.
- Browser runtime and clangd assets require network access and correct
  cross-origin isolation headers.
- Authenticated Firebase/LMS browser checks require a configured non-production
  test project and account.
- The reusable package remains `private: true` and `UNLICENSED` until ownership,
  licensing, third-party redistribution, and publication decisions are made.

More detail is available in [standalone repository readiness](docs/architecture/standalone-repository-readiness.md),
[guided lessons](src/lessons/README.md), and [session replay](src/replay/README.md).
