# Teaching with Web IDE

[Web IDE](https://webide.org) lets students write, run, test, and debug C++ in
their browser. Use a public lesson for a short activity, or create a class
with your own starter code and assignments. The compiler runs on the student's
device; the first execution downloads the runtime assets.

## Start with the public lessons

The [lesson catalog](https://webide.org/learn) contains ten guided lessons for
students who know some Python. No account is needed. The listed times are
estimates; allow additional time for discussion and the first runtime download.

| Lesson | Estimated time |
| --- | --- |
| [1. Hello, C++](https://webide.org/learn/from-python-to-cpp) | 14 minutes |
| [2. Types and Variables](https://webide.org/learn/types-and-variables) | 12 minutes |
| [3. Functions and References](https://webide.org/learn/functions-and-copies) | 15 minutes |
| [4. Vectors and Loops](https://webide.org/learn/vectors-and-loops) | 15 minutes |
| [5. Pointers and Addresses](https://webide.org/learn/pointers) | 15 minutes |
| [6. Heap Allocation](https://webide.org/learn/new-and-delete) | 12 minutes |
| [7. Structs](https://webide.org/learn/structs) | 14 minutes |
| [8. Building Linked Lists](https://webide.org/learn/building-linked-lists) | 16 minutes |
| [9. Removing Linked-List Nodes](https://webide.org/learn/linked-list-edge-cases) | 16 minutes |
| [10. Reversing a Linked List](https://webide.org/learn/reverse-a-linked-list) | 18 minutes |

Share a lesson's URL in your course materials. Students read the instructions
beside the editor, complete the task checklist, and use **Next** to advance.
Some steps offer **Show hint**. **Reset lesson** restores the starter code and
clears that lesson's progress after confirmation. Code and progress are stored
in the current browser; they do not follow students to another device.

For a discussion activity, ask students to predict a variable or pointer value,
set a breakpoint, and compare their prediction with the **Variables** and memory
graph views. Have them explain the mismatch before editing the code. History
controls revisit recorded debugger snapshots; they do not rewind the running
program. The [standalone editor](https://webide.org/ide) is available for your
own examples.

## Create a class and assignment

1. [Sign in or create an account](https://webide.org/login). On the
   [dashboard](https://webide.org/dashboard), choose **Create class**, enter a
   name and optional description, and create it.
2. Choose **New assignment**. In **Starter files**, edit the files students
   should receive. Use **Edit details** for the title, instructions, and optional
   due date. Run and test the starter project before sharing it.
3. Enable **Published (visible to students)** and save. Draft assignments remain
   hidden from students. Students receive a copy of the starter files when they
   first open the assignment; later starter changes do not replace their work.
4. Use **Copy invite link** on the class page. Ask students to sign in first,
   then open the invite link, or choose **Join class** on their dashboard and
   enter the invite code.
5. Students open the assignment, work in the editor, and use **Submit** in the
   Assignment panel. Work saves automatically. Late submissions are accepted
   and flagged; students can continue editing after submitting.
6. Open the assignment's **Submissions** tab to review student files, submission
   status, and recorded activity through **Replay**. Use the ZIP download
   controls for individual work or **Download all (.zip)** for the roster.

## Use tests as debugging prompts

New C++ examples include `webide_test.h` and use `STUDENT_TEST`, `PROVIDED_TEST`,
`EXPECT`, or `EXPECT_EQUAL`. Web IDE 0.7 supports test discovery, **Run All**,
**Run Selected**, and **Debug Selected** in the Tests panel. Failure details
include source locations and comparison values. Each run retains the source it
executed, so results remain attributable when a student edits during execution.
See the [testing guide](https://github.com/justinvassantachart/web-ide/blob/web-ide-v0.7.0-source/docs/teaching.md#built-in-testing-behavior)
for supported checks and behavior. These editable tests and lesson completion
checks support learning; they are not a protected grading service.

## Storage and classroom setup

Anonymous lessons save locally and do not send lesson event records. Signed-in
lessons record editing, execution, debugging, and lesson actions in the site's
Firebase project. Classroom accounts, files, submissions, and recorded activity
also use Firebase. Explain the recording behavior when introducing the tool;
replay is a best-effort activity record, not a complete audit log.

To run your own deployment, follow the repository's
[local development](../README.md#local-development),
[Firebase setup](../README.md#firebase-setup-for-the-teaching-features), and
[deployment notes](../README.md#deployment-notes). The editor and lessons work
without Firebase; class features require your project's configuration and
Firestore rules. Preserve the supplied routing and browser security headers
when deploying to another host.

To adapt the curriculum, start with the [lesson authoring guide](../src/lessons/README.md#authoring-a-lesson).
To embed the workbench in a React application, use the
[component import guide](https://github.com/justinvassantachart/web-ide/blob/web-ide-v0.7.0-source/docs/import-ide-component.md).
