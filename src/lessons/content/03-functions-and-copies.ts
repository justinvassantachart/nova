import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>
#include "nova_test.h"

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ function that swaps two ints, and use it
//  to print a game's final standings with the bigger score first."
//
//  Assistant: "swapScores exchanges the two values with the
//  classic three-step temp swap. main() swaps only if the scores
//  are out of order. I traced through the demo and the standings
//  print correctly."
// ----------------------------------------------------------------

void swapScores(int a, int b) {
    int temp = a;
    a = b;
    b = temp;
}

int main() {
    int alice = 2750;
    int bruno = 1200;

    // Bigger score first: swap only if out of order.
    if (alice < bruno) {
        swapScores(alice, bruno);
    }

    std::cout << "1st place: " << alice << "\\n";
    std::cout << "2nd place: " << bruno << "\\n";
    return 0;
}

// ---- Tests ---------------------------------------------------------
// Press the beaker (Tests) button in the toolbar to run these.
// STUDENT_TEST declares a test; EXPECT_EQUALS checks one fact.

STUDENT_TEST("swapScores really swaps") {
    int x = 3;
    int y = 9;
    swapScores(x, y);
    EXPECT_EQUALS(x, 9);
    EXPECT_EQUALS(y, 3);
}
`

export const functionsAndCopies: Lesson = {
    id: 'functions-and-copies',
    slug: 'functions-and-copies',
    title: 'Functions and References',
    tagline: 'Function arguments, pass-by-value, references, and unit tests.',
    description:
        'Learn how C++ function signatures declare types, how pass-by-value copies arguments, and how '
        + 'references allow a function to modify caller variables. Use a unit test and debugger to verify a swap function.',
    minutes: 15,
    tags: ['functions', 'references', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'signatures',
            title: 'C++ function signatures',
            body:
                'A Python function:\n'
                + '```\ndef area(w, h):\n    return w * h\n```\n'
                + 'The same function in C++:\n'
                + '```\ndouble area(double w, double h) {\n    return w * h;\n}\n```\n'
                + 'Three additions:\n'
                + '- a **return type** out front (`double`) — what comes back; `void` '
                + 'means "nothing comes back"\n'
                + '- a **type on every parameter**\n'
                + '- and one rule Python didn\'t have: a function must be **declared '
                + 'before the line that calls it** — the compiler reads top to bottom\n\n'
                + 'The first line — `double area(double w, double h)` — is the '
                + '**signature**. It states the function name, parameter types, and return type.',
            check: { kind: 'manual' },
        },
        {
            id: 'run-demo',
            title: 'Run the example program',
            body:
                'Read `swapScores` and `main`, then press **Run**.\n\n'
                + 'The standings print the larger score first, which is the expected output.',
            check: { kind: 'stdout', includes: '1st place: 2750', label: 'Run it — the standings look right' },
            successNote: 'The example output is correct, but the swap function has not been tested yet.',
        },
        {
            id: 'demo-lied',
            title: 'Check whether the function ran',
            body:
                'Look again at main:\n'
                + '```\nif (alice < bruno) {\n    swapScores(alice, bruno);\n}\n```\n'
                + 'Alice has 2750, Bruno has 1200 — the condition is **false**. '
                + '`swapScores` was *never called*. The output is right because the '
                + 'inputs happened to start in the right order.\n\n'
                + 'The example does not exercise the function. To check the '
                + 'function, you have to call the function and verify what it did — '
                + 'mechanically, repeatably. That\'s a **unit test**.',
            check: { kind: 'manual' },
        },
        {
            id: 'meet-tests',
            title: 'Read the unit test',
            body:
                'Scroll to the bottom of `main.cpp`:\n'
                + '```\nSTUDENT_TEST("swapScores really swaps") {\n'
                + '    int x = 3;\n    int y = 9;\n    swapScores(x, y);\n'
                + '    EXPECT_EQUALS(x, 9);\n    EXPECT_EQUALS(y, 3);\n}\n```\n'
                + '- `STUDENT_TEST("name") { ... }` declares a test\n'
                + '- `EXPECT_EQUALS(actual, expected)` checks one fact and records '
                + 'pass/fail\n\n'
                + 'The **Tests** button runs every '
                + 'test instead, reporting results in the Tests panel. The test calls `swapScores(3, 9)` '
                + 'and checks that `x` becomes 9.',
            check: { kind: 'manual' },
        },
        {
            id: 'run-tests',
            title: 'Run the test',
            body: 'Click **Tests** (the beaker) and watch the Tests panel.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run the tests — the swap test fails' },
            successNote: 'Expected 9, actual 3. The function did not modify the caller\'s variable.',
        },
        {
            id: 'reproduce',
            title: 'Reproduce the bug in main',
            body:
                'Make `main` exercise the bug. Swap the starting scores so '
                + 'the `if` fires:\n'
                + '```\nint alice = 1200;\n```\n'
                + 'and give Bruno the 2750. Then set a **breakpoint** on the first line '
                + 'inside `swapScores`:\n'
                + '```\nint temp = a;\n```',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'alice = 1200', label: 'Make alice = 1200 and bruno = 2750 so the swap runs' },
                    { kind: 'breakpoint', anchor: 'int temp = a;', label: 'Breakpoint inside swapScores' },
                ],
            },
            hint: 'Edit the two declarations in main, then click left of the "int temp = a;" line number.',
        },
        {
            id: 'two-frames',
            title: 'Inspect the stack frames',
            body:
                'Press **Debug**. You pause *inside* `swapScores`.\n\n'
                + 'Look at the Variables panel. There are **two stack frames** — `main` '
                + 'at the bottom with `alice` and `bruno`, and `swapScores` on top with '
                + '`a`, `b`, and `temp`. Each function call gets its own frame containing '
                + 'its local variables until the function returns.\n\n'
                + '`a` holds 1200 and `b` holds 2750. They are **copies** of `alice` and '
                + '`bruno`, so there are four separate variables.',
            check: { kind: 'paused', func: 'swapScores', label: 'Debug until you pause inside swapScores()' },
            hint: 'If the program ran to the end, check the breakpoint dot is still on "int temp = a;" and press Debug again.',
        },
        {
            id: 'watch-copies',
            title: 'Step through the copies',
            body:
                'Press **Step Over** (`F10`) twice and watch the swap work *perfectly* — '
                + 'on the copies: `temp` takes 1200, `a` takes 2750...\n\n'
                + 'The swap works on `a` and `b`. In `main`\'s frame below, `alice` and '
                + '`bruno` remain unchanged.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', count: 2, label: 'Step Over twice (F10)' },
                    { kind: 'variable', name: 'a', equals: '2750', func: 'swapScores', label: 'Watch a become 2750 — the copy swaps fine' },
                ],
            },
        },
        {
            id: 'step-out',
            title: 'Return to main',
            body:
                'Press **Step Out** (`⇧F11`) to finish `swapScores` and land back in '
                + '`main`.\n\n'
                + 'The `swapScores` frame is gone, along with its local variables `a`, `b`, '
                + 'and `temp`. `alice` is still 1200 and `bruno` is still 2750.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_out', label: 'Step Out (⇧F11) back to main' },
                    { kind: 'variable', name: 'alice', equals: '1200', label: 'alice is unchanged in main\'s frame' },
                ],
            },
            successNote: 'The function changed only its local copies, not the variables in main.',
        },
        {
            id: 'why',
            title: 'Pass by value and references',
            body:
                'C++ passes arguments **by value**: the parameter is a fresh copy, and '
                + 'assigning to it never touches the caller\'s variable.\n\n'
                + 'Python also passes references to objects by value. In '
                + '`def swap(a, b): a, b = b, a`, rebinding a parameter does not affect '
                + 'the caller. Mutating a list or dict can appear different because it changes '
                + 'the one shared object. C++ just makes the choice explicit and puts it '
                + 'in the signature:\n'
                + '- `int a` — give me a **copy**\n'
                + '- `int& a` — give me **the caller\'s actual box, under a new name**\n\n'
                + 'That `&` declares a **reference**. With `int& a`, the line `a = b;` '
                + 'modifies the caller\'s variable.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Pass arguments by reference',
            body:
                'Change the signature to take references:\n'
                + '```\nvoid swapScores(int& a, int& b) {\n```\n'
                + 'The body stays exactly as it is — the algorithm was never the problem. '
                + 'Then run **Tests**.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'swapScores\\(\\s*int\\s*&\\s*a', label: 'Take a and b by reference (int&)' },
                    { kind: 'tests', minTotal: 1, allPass: true, label: 'Re-run Tests: green' },
                ],
            },
            successNote: 'The reference parameters allow the function to modify the caller\'s variables.',
        },
        {
            id: 'ship-it',
            title: 'Verify the program',
            body:
                'Press **Run**. With alice = 1200 and bruno = 2750, the `if` fires, the '
                + 'swap runs, and Bruno\'s 2750 prints first.',
            check: { kind: 'stdout', includes: '1st place: 2750', label: 'Run it — 2750 leads via a real swap' },
        },
        {
            id: 'your-test',
            title: 'Add another test',
            body:
                'One test guards one fact. Add a second `STUDENT_TEST` at the bottom — '
                + 'say, swapping equal values:\n'
                + '```\nSTUDENT_TEST("swapping equal values changes nothing") {\n'
                + '    int p = 5;\n    int q = 5;\n    swapScores(p, q);\n'
                + '    EXPECT_EQUALS(p, 5);\n    EXPECT_EQUALS(q, 5);\n}\n```\n'
                + 'Run **Tests** and confirm both tests pass.',
            check: { kind: 'tests', minTotal: 2, allPass: true, label: 'Two tests, all passing' },
            hint: 'Paste the test after the first one, then click Tests again.',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- **Signatures**: return type + typed parameters = the contract\n'
                + '- **Stack frames**: every call gets private boxes that die at return\n'
                + '- **Pass-by-value**: arguments are copies in C++, and Python also passes '
                + 'object references by value\n'
                + '- **References** (`int&`): hand a function the real box\n'
                + '- Unit tests verify specific function behavior\n\n'
                + 'The next lesson covers `std::vector`, loop syntax, and boundary cases.',
            check: { kind: 'manual' },
        },
    ],
}
