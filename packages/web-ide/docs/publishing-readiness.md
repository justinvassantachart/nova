# Publishing readiness

The local repository is ready for review and a single initial commit, but it is
not authorized or configured for public distribution.

## Completed locally

- Host-neutral package metadata, ESM export map, declarations, compiled CSS,
  clangd worker emission, and raw C++ test resources.
- Separate exports for host APIs, built-in plugins, browser runtime providers,
  generic/language-specific testing providers, and optional C/C++ language
  tooling.
- Nova consuming only public package exports through a local file dependency.
- Unit/integration tests in dedicated test folders.
- Real example and packed-tarball consumer builds without a Nova alias.
- Source/dist scans excluding LMS, Firebase, lessons, replay, Karel, absolute
  developer paths, and unresolved `@/` aliases.
- No copied compiler/sysroot archive, Stanford library, Firebase service worker,
  deployment file, or local yowasp tarball.
- The packed package consumer uses five exact browser shims instead of the
  whole-stdlib polyfill plugin and its top-level-await transform. Production
  dependency audit has no known vulnerabilities. Nova's repository-wide
  development audit still includes the host application's separate polyfill
  toolchain; reassess that root-only stack independently rather than adding it
  back to the reusable package harness.

## Decisions required before publication

- Open-source license and confirmation of redistribution rights.
- Final npm name/scope and semantic version.
- GitHub organization/owner, visibility, branch protections, and CI policy.
- npm, Git dependency, or release-tarball distribution strategy.
- Whether Monaco, Debugger.sh, clangd, LLVM/WASI, and toolchain assets remain
  externally hosted or become audited self-hosted release assets.
- CSP, CORS/CORP, caching, uptime, version pinning, and privacy policy for those
  runtime downloads.

Until those decisions are made, keep `private: true`, `license: UNLICENSED`, no
remote, and no releases.

## Pre-publish gate

Run `npm ci && npm run validate`, inspect `npm pack --dry-run`, audit the actual
tarball and third-party licenses, test it in a clean browser consumer, and repeat
Nova's unit/build/browser regression pass. Publication should not claim Python
debugging or end-to-end browser unittest execution, Rust, bundled Karel
functionality, offline use, multiple simultaneous embeds, or working graphics
output until each has the required browser-level tests. The separately
maintained Karel companion has its own real Python browser coverage; that does
not make Karel part of the Web IDE package.
