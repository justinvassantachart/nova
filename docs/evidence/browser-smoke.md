# Browser verification

Verified on 2026-09-24 using headless Chromium 151 on macOS against the production
Vite preview. These checks exercise the actual browser compiler and UI, with no
mocked runtime or student/classroom data.

- The landing page and embedded workspace are cross-origin isolated. The editor
  loads inside the live example, and the full-page example loads independently.
- The linked-list example pauses at the traversal breakpoint, displays one stack
  frame and three allocated nodes, steps forward and through recorded history,
  and prints `10 + 20 + 30 = 60` on a normal run.
  Directly referenced heap nodes share a readable column; root ordering no longer
  changes their pointer-depth rank. Focused layout regression tests also pass.
- The guided demo's failing test reports actual 30 versus expected 60. Its
  breakpoint/heap, stepping/value, and backward/forward-history gates pass.
  Correcting the traversal condition yields one passing test.
- The lesson catalog presents exactly ten lessons. All ten starter workspaces
  also compiled in a separate native C++17 content check, including test helpers
  and separate test translation units where applicable.
- Optional clangd loads from its configured upstream host. Native F2 renames
  `Node` to `ListNode` across all seven references in the sample and retains all
  renamed references after a page reload. No browser page errors occurred.
- At 390 px, the landing page fits the viewport, the debugger screenshot loads,
  and no hidden workbench iframe is mounted. Desktop verification used 1440 px.

The screenshot at `public/debugger-demo.png` is captured from the actual C++
debugger. The public showcase emits no classroom/session telemetry events.

These checks do not exercise signed-in Firebase classrooms, which require a
separately configured test project and teacher/student accounts. Compiler timing
samples and their limitations are recorded in [compiler-benchmark.json](compiler-benchmark.json)
and [the performance guide](../compiler-performance.md).
