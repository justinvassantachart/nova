# Distribution status

Nova embeds the MIT-licensed Web IDE `0.3.1` source as a relative npm
workspace. The reusable source matches the immutable
`web-ide-v0.3.1-source` checkpoint at
`ed271757daf80c3ded7ae2b4a67d74102ebf2435`; Nova keeps only
workspace-specific package scripts, consumer tooling, and documentation around
that source.

The package remains `private: true` and is not published to npm. Hamilton's
separate distribution is the exact immutable private-release asset
`web-ide-0.3.1.tgz`, with SHA-256
`4397b6733d19b69941ce225e5d3cf98fa9fcdaf6b27f93f36b35ea8d3e3d37ae`.
That release does not require Nova to fetch a private artifact during ordinary
local development or deployment; Nova continues to build the reviewed relative
workspace mirror recorded in its root lockfile.

## Current package boundary

- The export map, React peer ranges, and exact `debugger-sh@0.3.15` runtime
  pin match Web IDE 0.3.1.
- The reusable source is MIT licensed and includes its generated third-party
  license inventory and notices.
- Nova imports only the documented root, host, plugin, runtime, testing,
  language-tooling, style, and package-metadata exports.
- The packed-consumer gate installs a fresh tarball with lifecycle scripts
  disabled, proves one React identity, audits production dependencies, and
  builds without Nova aliases or private source imports.
- Nova's final browser bundle uses exact narrow browser shims rather than a
  whole-stdlib polyfill plugin.

## Future distribution changes

Switching Nova from its relative workspace to the private Hamilton artifact,
a public release asset, Git dependency, or npm requires a separate reviewed
migration. It must preserve exact artifact identity, reproducible
authentication/bootstrap behavior where needed, public-export-only imports,
React deduplication, runtime asset policy, production-browser evidence, and
rollback. Do not introduce an absolute developer-machine `file:` dependency.

Publishing to npm still requires an explicit owner decision for the namespace,
account controls, provenance, release workflow, and long-term artifact policy.
The current source license and private GitHub release do not by themselves
authorize npm publication.
