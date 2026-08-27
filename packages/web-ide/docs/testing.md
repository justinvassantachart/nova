# Testing the embedded Web IDE package

Nova embeds the exact reusable Web IDE 0.3.1 source checkpoint
`ed271757daf80c3ded7ae2b4a67d74102ebf2435`, also maintained in the
standalone `web-ide` repository. Runtime changes must pass both repositories:
the standalone production-browser gate proves the actual browser backend, and
Nova's gate proves the LMS host still composes the package without regressions.

## Test locations

All tests stay under `packages/web-ide/tests`; never place tests beside
production source.

- `tests/contracts` covers public contracts, provider metadata, lifecycle,
  cleanup, DAP requests, source mapping, and breakpoint state with controlled
  fakes.
- `tests/integration` covers plugin/provider composition and capability-driven
  workbench visibility.
- `tests/testing` covers test-provider transforms, generated files, protocols,
  diagnostics, and parser behavior.
- `tests/workbench` covers isolated UI helpers and workbench behavior.
- `tests/consumer` packs the package and builds a fresh consumer without Nova
  aliases or private source imports.

The production Playwright fixture lives only in the standalone repository's
`tests/browser` folder. Do not duplicate that harness inside Nova. It exercises
the production bundle with the real pinned backend and covers C++ Run/Debug,
Python imported-module debugging, repeat/stop lifecycle, passing and failing
unittest flows, diagnostic source mapping, COOP/COEP isolation, and clean
browser/network diagnostics.

## Required gates

For package-only changes in Nova:

```sh
npm --workspace web-ide run validate
npm run lint:app
npm run test:app
npm run typecheck
npm run build
```

For runtime, worker, DAP, source-path, test-provider, dependency, or package
changes, first run in the standalone repository:

```sh
npm ci
npx playwright install chromium
npm run validate:production
npm run test:browser -- --repeat-each=3
```

Then mirror only the verified reusable source/tests/docs into
`packages/web-ide`, update Nova's lockfile, confirm the intended files are
byte-identical, and run Nova's gates above. Never use Nova's deployed site as a
substitute for the local production-browser test; post-deploy smoke is an
additional check after an authorized push.

For dependency changes, record full and production-only audits in both
repositories. The exact 0.3.1 standalone release baseline and Nova's packed
production consumer report zero known vulnerabilities. Nova's root production
audit is also clean; its full development tree currently reports eight
moderate `uuid` advisories through Firebase Admin's Google Cloud tooling. npm's
suggested fix crosses a breaking Firebase Admin version and is not part of this
Web IDE migration.

## Regression rules

- A runtime capability is supported only after a real-engine browser test;
  mocks alone are insufficient.
- Shared debugger changes require both Python and C++ browser regressions.
- Wait for observable UI or typed runtime state. Do not use fixed sleeps or
  broad console/network-error suppression.
- Verify negative capability behavior: Python exposes Variables but not the
  native-memory Graph; unsupported commands remain hidden or rejected.
- Treat `RuntimeExecutionPlan.files` as ephemeral. Test providers may remove,
  rename, or add files; persistent breakpoint state must survive a
  Debug → Tests → Debug sequence.
- Keep generated runner/support files out of the host VFS and map diagnostics
  back to real host source paths.
- Check cleanup and races: one resume per pause, stale events ignored,
  stop/restart/repeat runs, disposal during initialization, and bounded
  synchronous variable expansion.
- Record exact commands, browser/version, workflows, skipped checks, audit
  results, limitations, and whether any commit/remote/deployment changed.

The browser providers are certified against exactly `debugger-sh@0.3.15`.
Keep that dependency pinned until a broader compatibility matrix passes. An
upgrade requires upstream protocol/asset review, focused contract tests,
standalone `validate:production`, a three-repeat browser run, then the complete
Nova host regression.
