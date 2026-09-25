# Teaching with web-ide

## Try it without an account

Open [the linked-list workspace](https://webide.org/ide?example=linked-list) to edit,
run, and debug a complete C++ example. Open [the lessons](https://webide.org/learn)
for ten self-paced assignments. Students can start anywhere; their lesson code and
progress are saved in their browser. The [guided demo](https://webide.org/demo)
introduces a failing test, breakpoints, pointer visualization, and recorded history.

A useful first activity is to ask students to predict the values and links before
stepping. Click beside a line number to set a breakpoint, choose **Debug**, then
use **Step Over** while watching the **Graph** panel and variables. History
controls revisit captured states; they do not rewind the running program.

## Create a class and assignment

The hosted classroom requires sign-in. A self-hosted classroom also needs the
Firebase configuration described in [self-hosting](self-hosting.md).

1. [Sign in](https://webide.org/login), open the dashboard, and choose **Create a class**.
   Enter a name and optional description. The creator becomes the class teacher.
2. In the class, choose **New assignment**. Open the assignment's **Starter files**
   tab and use the IDE's file explorer to add or edit source files, headers, and tests.
   Teacher starter-file edits save automatically.
3. Use **Edit details** to enter a title, instructions, and optional due date.
   Keep the assignment in **Draft** while preparing it. Run the starter code and tests
   yourself before making it available.
4. Toggle **Draft** to **Published**, or check **Published (visible to students)**
   in the edit dialog. Only published assignments appear in students' class view.
5. Use **Copy invite link** on the class page. Students sign in and follow that link,
   or enter the displayed code at `/join`.
6. Students open the assignment, work in their own copy, and submit. In the teacher's
   assignment view, open **Submissions** to inspect submitted work and available
   session replay. Late submissions are accepted and marked as late.

Keep an original copy of starter files. Changing them after students begin does
not replace existing student workspaces.

## Write small tests

The bundled C++ testing provider recognizes `STUDENT_TEST` and `EXPECT_EQUALS`:

```cpp
#include "nova_test.h"

int twice(int value) { return value * 2; }

STUDENT_TEST("twice handles zero") {
    EXPECT_EQUALS(twice(0), 0);
}
```

Put tests beside the implementation or in a separate `.cpp` file with the
appropriate declarations. Use the **Tests** panel to run them. The lesson sources
in [`src/lessons/content`](../src/lessons/content) provide working multi-file examples.

## Storage and session records

Compilation, execution, and debugging run on the learner's device. The first run
requires downloading the compiler and runtime assets. Clearing site storage can
remove anonymous lesson code and progress.

Signed-in classroom features use Firebase for class membership, assignment files,
submissions, and session events. Authenticated lessons may also record session
events. Tell students what your deployment records and configure access rules for
your course. The public linked-list showcase has no session-event sink.

## Embed in another platform

The workbench is a React component with host-controlled workspace identity,
initial files, saving callbacks, and runtime/plugin configuration. See the
[package guide](../packages/web-ide/README.md) and
[host contracts](../packages/web-ide/src/web-ide/contracts/host.ts). The full site is an example
consumer of those public interfaces. The package is available as source; do not
assume an npm package named `web-ide` is this project.
