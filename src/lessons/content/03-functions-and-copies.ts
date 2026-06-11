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
    title: 'Functions & the Copy Machine',
    tagline: 'C++ copies your arguments. An AI swap function, a demo that lied, and your first unit test.',
    description:
        'Function signatures in C++ carry types — and a secret: every argument is a copy. An AI-written '
        + 'swap function "passes" its demo without ever running, a two-line test exposes it, and the call '
        + 'stack shows you the copies with your own eyes. Fix it with references and prove it with tests.',
    minutes: 15,
    tags: ['functions', 'references', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'signatures',
            title: 'Signatures: def, with types',
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
                + '**signature**: the function\'s public contract. Learn to read '
                + 'signatures the way you read a title before a book; this lesson turns '
                + 'on one.',
            check: { kind: 'manual' },
        },
        {
            id: 'run-demo',
            title: 'Run the AI\'s demo',
            body:
                'Read `swapScores` and `main`, then press **Run**.\n\n'
                + 'The standings print bigger-score-first, exactly as ordered. The AI '
                + '"traced through the demo" and the demo agrees. Would you ship it?',
            check: { kind: 'stdout', includes: '1st place: 2750', label: 'Run it — the standings look right' },
            successNote: 'Looks perfect. Keep that feeling — it\'s about to be instructive.',
        },
        {
            id: 'demo-lied',
            title: 'The demo never ran the code',
            body:
                'Look again at main:\n'
                + '```\nif (alice < bruno) {\n    swapScores(alice, bruno);\n}\n```\n'
                + 'Alice has 2750, Bruno has 1200 — the condition is **false**. '
                + '`swapScores` was *never called*. The output is right because the '
                + 'inputs happened to start in the right order.\n\n'
                + 'This is the oldest trap in code review, and AI code walks you into it '
                + 'constantly: **a passing demo only proves the demo.** To check the '
                + 'function, you have to call the function and verify what it did — '
                + 'mechanically, repeatably. That\'s a **unit test**.',
            check: { kind: 'manual' },
        },
        {
            id: 'meet-tests',
            title: 'Meet your test framework',
            body:
                'Scroll to the bottom of `main.cpp`:\n'
                + '```\nSTUDENT_TEST("swapScores really swaps") {\n'
                + '    int x = 3;\n    int y = 9;\n    swapScores(x, y);\n'
                + '    EXPECT_EQUALS(x, 9);\n    EXPECT_EQUALS(y, 3);\n}\n```\n'
                + '- `STUDENT_TEST("name") { ... }` declares a test\n'
                + '- `EXPECT_EQUALS(actual, expected)` checks one fact and records '
                + 'pass/fail\n\n'
                + 'The **Tests** button (the beaker) sets `main()` aside and runs every '
                + 'test instead, reporting results in the Tests panel. No eyeballing, no '
                + '"looks right" — the test calls `swapScores(3, 9)` and *demands* x '
                + 'becomes 9.',
            check: { kind: 'manual' },
        },
        {
            id: 'run-tests',
            title: 'Run the test',
            body: 'Click **Tests** (the beaker) and watch the Tests panel.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run the tests — the swap test fails' },
            successNote: 'Expected 9, actual 3. The function did nothing. The demo said nothing. The test talked.',
        },
        {
            id: 'reproduce',
            title: 'Make main reproduce it',
            body:
                'Time for the debugger. First, make `main` actually exercise the bug — '
                + 'the smallest reproduction you can build. Swap the starting scores so '
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
            title: 'Two frames, four boxes',
            body:
                'Press **Debug**. You pause *inside* `swapScores`.\n\n'
                + 'Look at the Variables panel: there are **two stack frames** — `main` '
                + 'at the bottom with `alice` and `bruno`, and `swapScores` on top with '
                + '`a`, `b`, and `temp`. Each function call gets its own frame: a private '
                + 'workspace of boxes that lives until the function returns.\n\n'
                + 'And here\'s the headline: `a` holds 1200 and `b` holds 2750 — **copies** '
                + 'of alice and bruno. Four separate boxes. C++ photocopied your '
                + 'arguments at the call.',
            check: { kind: 'paused', func: 'swapScores', label: 'Debug until you pause inside swapScores()' },
            hint: 'If the program ran to the end, check the breakpoint dot is still on "int temp = a;" and press Debug again.',
        },
        {
            id: 'watch-copies',
            title: 'Watch the copies swap',
            body:
                'Press **Step Over** (`F10`) twice and watch the swap work *perfectly* — '
                + 'on the copies: `temp` takes 1200, `a` takes 2750...\n\n'
                + 'The algorithm is flawless. Keep one eye on `main`\'s frame below: '
                + '`alice` and `bruno` haven\'t moved.',
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
            title: 'Return to the scene',
            body:
                'Press **Step Out** (`⇧F11`) to finish `swapScores` and land back in '
                + '`main`.\n\n'
                + 'The `swapScores` frame is **gone** — and its boxes (`a`, `b`, `temp`) '
                + 'died with it. All that beautiful swapping evaporated. `alice` is still '
                + '1200, `bruno` still 2750.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_out', label: 'Step Out (⇧F11) back to main' },
                    { kind: 'variable', name: 'alice', equals: '1200', label: 'alice is unchanged in main\'s frame' },
                ],
            },
            successNote: 'The function swapped its own copies, then threw them away. Nothing reached main.',
        },
        {
            id: 'why',
            title: 'Pass-by-value — and the Python you forgot',
            body:
                'C++ passes arguments **by value**: the parameter is a fresh copy, and '
                + 'assigning to it never touches the caller\'s variable.\n\n'
                + 'Surprise: Python does this too. `def swap(a, b): a, b = b, a` is the '
                + 'same disappointment — rebinding a parameter never affects the caller. '
                + 'Python only *felt* different because mutating a list or dict changed '
                + 'the one shared object. C++ just makes the choice explicit and puts it '
                + 'in the signature:\n'
                + '- `int a` — give me a **copy**\n'
                + '- `int& a` — give me **the caller\'s actual box, under a new name**\n\n'
                + 'That `&` is a **reference**. With `int& a`, the line `a = b;` writes '
                + 'straight into the caller\'s variable.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix the signature, trust the test',
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
            successNote: 'Same call site, same body — one & changed the contract, and the test proves it.',
        },
        {
            id: 'ship-it',
            title: 'Now the standings earn their order',
            body:
                'Press **Run**. With alice = 1200 and bruno = 2750, the `if` fires, the '
                + 'swap *actually works*, and Bruno\'s 2750 prints first — the right '
                + 'output for the right reason this time.',
            check: { kind: 'stdout', includes: '1st place: 2750', label: 'Run it — 2750 leads via a real swap' },
        },
        {
            id: 'your-test',
            title: 'Extend the suite',
            body:
                'One test guards one fact. Add a second `STUDENT_TEST` at the bottom — '
                + 'say, swapping equal values:\n'
                + '```\nSTUDENT_TEST("swapping equal values changes nothing") {\n'
                + '    int p = 5;\n    int q = 5;\n    swapScores(p, q);\n'
                + '    EXPECT_EQUALS(p, 5);\n    EXPECT_EQUALS(q, 5);\n}\n```\n'
                + 'Run **Tests** — both green. Every test you add is a tripwire that '
                + 'outlives today.',
            check: { kind: 'tests', minTotal: 2, allPass: true, label: 'Two tests, all passing' },
            hint: 'Paste the test after the first one, then click Tests again.',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- **Signatures**: return type + typed parameters = the contract\n'
                + '- **Stack frames**: every call gets private boxes that die at return\n'
                + '- **Pass-by-value**: arguments are copies — in C++ *and*, secretly, in '
                + 'Python\n'
                + '- **References** (`int&`): hand a function the real box\n'
                + '- **Demos prove nothing; tests prove the fact they check**\n\n'
                + 'Next: collections. Python lists become `std::vector`, loops get a '
                + 'third clause, and an AI "standard maximum algorithm" forgets exactly '
                + 'one element.',
            check: { kind: 'manual' },
        },
    ],
}
