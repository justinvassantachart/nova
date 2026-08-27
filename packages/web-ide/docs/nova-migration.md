# Nova integration and migration

Nova consumes the Web IDE 0.3.1 source through the relative
`packages/web-ide` workspace. Its host
configuration imports `WebIDE` and public types from `web-ide`, the C++ runtime
provider from `web-ide/runtimes`, the C++ provider and generic Tests UI from
`web-ide/testing`, the optional clangd provider from `web-ide/language-tools`,
and selected built-ins from `web-ide/plugins`. Nova explicitly selects
`web-ide.testing.cpp` and `web-ide.language-tooling.cpp`; generic workbench UI
has no C++ protocol, source-transform, or clangd knowledge.

Nova itself supplies `nova.assignment-activity`. That plugin owns the Assignment
view and its LMS context. Assignment, Firebase, routing, lessons, replay, and
authentication remain entirely in Nova.

Assignment-backed mounts request `nova.assignment` through the public
`initialLayout.selectedActivityId` contract. Standalone `/ide`, lessons, and
review mounts without assignment context omit that request and preserve Web
IDE's existing Explorer/persisted default. Nova never clicks workbench DOM,
writes Web IDE's sidebar storage, or imports its selection controller.

Guided lessons hold a `WebIDEInstanceHandle` ref. They observe immutable public
snapshots and request intent-level open/reset actions. They no longer import IDE
stores, VFS, debugger, or test modules.

## Mirror workflow

The reusable source is synchronized from the exact immutable source checkpoint
`web-ide-v0.3.1-source` at
`ed271757daf80c3ded7ae2b4a67d74102ebf2435`. For a later upstream change:

1. Validate the exact standalone source and its production-browser matrix.
2. Mirror reusable source, applicable tests, licenses, notices, and public docs.
3. Retain Nova's workspace-specific package scripts and consumer harness.
4. Update both manifests and the root lockfile intentionally.
5. Confirm reusable source bytes against the selected source checkpoint and run
   validation in both repositories.

Do not introduce an absolute local `file:` dependency. Moving Nova to the
private Hamilton tarball, a public release asset, Git, or npm requires a
separate portable dependency/bootstrap migration.

## Next migration stages

1. Instance-scope VFS, Monaco model ownership, and all UI stores.
2. Decide whether the provider-owned C++ clangd/runtime/testing subpaths should
   become independently installable language packages.
3. Add a Rust provider independently. Python source debugging, imported-module
   stepping, and unittest execution are covered in Web IDE's production browser
   suite.
4. Move any future graphics implementation behind a runtime/plugin package.
5. Review, license, and eventually publish the existing sibling Karel companion
   independently; do not copy it into this repository or Nova's LMS layer.
6. Decide whether Nova should replace its source mirror with a portable exact
   artifact once authentication, hosting, and rollback are defined.
