import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ function that returns a student's average
//  grade, given total points earned and the number of assignments."
//
//  Assistant: "Straightforward division -- the return type is
//  double so fractional averages are preserved. Demo in main()."
// ----------------------------------------------------------------
double averageGrade(int totalPoints, int numAssignments) {
    return totalPoints / numAssignments;
}

int main() {
    std::cout << "180 points / 2 assignments -> "
              << averageGrade(180, 2) << "\\n";
    std::cout << "179 points / 2 assignments -> "
              << averageGrade(179, 2) << "\\n";
    return 0;
}
`

const TESTS_CPP = `#include "nova_test.h"

// The function under test lives in main.cpp.
double averageGrade(int totalPoints, int numAssignments);

STUDENT_TEST("whole-number averages are exact") {
    EXPECT_EQUALS(averageGrade(180, 2), 90.0);
}

STUDENT_TEST("fractional averages are not silently rounded") {
    EXPECT_EQUALS(averageGrade(179, 2), 89.5);
}
`

export const aiBugHuntTests: Lesson = {
    id: 'ai-bug-hunt-tests',
    slug: 'ai-bug-hunt-tests',
    title: 'AI Bug Hunt: Trust, but Verify',
    tagline: 'Stop eyeballing output — let a test suite catch the AI\'s bug, then prove the fix.',
    description:
        'The AI swears its grade-averaging function "preserves fractional averages." A two-test suite says '
        + 'otherwise. Run the tests, debug the failure to its root cause, fix it, and write a test of your '
        + 'own — the complete review loop for AI-generated code.',
    minutes: 12,
    tags: ['AI-generated code', 'testing', 'integer division'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'briefing',
            title: 'Your last bug hunt — with backup',
            body:
                'In the previous hunts you verified AI code by running it and reading the '
                + 'terminal. That works once. It doesn\'t scale, and it doesn\'t *stay* '
                + 'verified after the next edit. **Tests do.**\n\n'
                + 'This workspace has two files — see the tabs above the editor:\n'
                + '- `main.cpp` — the AI\'s `averageGrade` function, which it claims '
                + 'preserves fractional averages\n'
                + '- `tests.cpp` — a tiny test suite. `STUDENT_TEST("name") { ... }` '
                + 'declares a test; `EXPECT_EQUALS(actual, expected)` checks one fact\n\n'
                + 'Open both and read them — fifteen lines total.',
            check: { kind: 'manual' },
        },
        {
            id: 'run-tests',
            title: 'Run the suite',
            body:
                'Click **Tests** in the toolbar (the beaker). The IDE compiles your code '
                + 'together with the test file and runs every `STUDENT_TEST`, reporting '
                + 'results in the Tests panel.',
            check: { kind: 'tests', minTotal: 2, minFailed: 1, label: 'Run the tests — one of them fails' },
            successNote: 'One green, one red. The AI\'s claim just met its first counterexample.',
        },
        {
            id: 'read-failure',
            title: 'Read the failure like a detective',
            body:
                'Click the failing test in the Tests panel. It tells you everything:\n'
                + '- **Expected:** 89.5\n'
                + '- **Actual:** 89\n\n'
                + 'So `averageGrade(179, 2)` returned 89 — the `.5` vanished. And notice '
                + 'what the *passing* test tells you: `averageGrade(180, 2)` is exactly '
                + 'right. The bug only bites when the division has a remainder.\n\n'
                + 'A failing test plus a passing test is a pair of coordinates. They '
                + 'triangulate the bug.',
            check: { kind: 'manual' },
        },
        {
            id: 'breakpoint',
            title: 'Debug to the root cause',
            body:
                'The test told you *what* is wrong; the debugger shows *why*. Set a '
                + 'breakpoint on the function\'s only line:\n'
                + '```\nreturn totalPoints / numAssignments;\n```\n'
                + 'Then click **Debug**. (Debug runs `main()`, which calls the same '
                + 'function with the same inputs as the tests — 180 first, then 179.)',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'return totalPoints / numAssignments;', label: 'Breakpoint on the return line' },
                    { kind: 'paused', func: 'averageGrade', label: 'Debug until you pause inside averageGrade()' },
                ],
            },
        },
        {
            id: 'second-call',
            title: 'Catch the failing call',
            body:
                'The first pause is the healthy call (`totalPoints` = 180). Press '
                + '**Continue** (`F5`) once to reach the second call — the one the test '
                + 'flagged.\n\n'
                + 'Check the Variables panel: `totalPoints` = 179, `numAssignments` = 2. '
                + 'Both are `int`s. Before you step further, predict: what is `179 / 2` '
                + 'when **both operands are integers**?',
            check: { kind: 'variable', name: 'totalPoints', equals: '179', label: 'Pause at the call with totalPoints = 179' },
            hint: 'Continue (F5) once from the first pause. If you went past it, press Debug again.',
        },
        {
            id: 'diagnosis',
            title: 'The truncation happens before the return',
            body:
                'You saw this monster in lesson 1: **integer ÷ integer truncates**. '
                + '`179 / 2` is computed as `int` → **89** — and only *then* converted to '
                + '`double` by the return type. The `.5` was destroyed before the '
                + '`double` ever saw it.\n\n'
                + 'This is why the AI\'s explanation was so convincing: *"the return type '
                + 'is double so fractional averages are preserved"* — a true-sounding '
                + 'statement about the **signature**, refuted by the **expression**. '
                + 'Type signatures are promises; arithmetic doesn\'t read them.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix it and let the tests judge',
            body:
                'Convert *before* dividing:\n'
                + '```\nreturn static_cast<double>(totalPoints) / numAssignments;\n```\n'
                + 'Then run **Tests** again. This time you don\'t eyeball anything — '
                + 'the suite renders the verdict.',
            check: {
                kind: 'all',
                of: [
                    {
                        kind: 'code',
                        matches: 'static_cast<double>|\\(double\\)|double\\(|1\\.0\\s*\\*|\\*\\s*1\\.0',
                        label: 'Make the division floating-point',
                    },
                    { kind: 'tests', minTotal: 2, allPass: true, label: 'Re-run Tests: all green' },
                ],
            },
            successNote: 'Two for two. The fix is not just made — it\'s proven, and it stays proven on every future run.',
        },
        {
            id: 'write-your-own',
            title: 'Write your own test',
            body:
                'Reviewers don\'t just run the suite — they extend it. Add a third test to '
                + '`tests.cpp` covering a case nobody checked yet, quarter-point averages:\n'
                + '```\nSTUDENT_TEST("quarter points survive") {\n'
                + '    EXPECT_EQUALS(averageGrade(90, 4), 22.5);\n'
                + '}\n```\n'
                + 'Run **Tests** and watch all three pass.',
            check: { kind: 'tests', minTotal: 3, allPass: true, label: 'Three tests, all passing' },
            hint: 'Paste the test at the bottom of tests.cpp, then click Tests again.',
        },
        {
            id: 'graduation',
            title: 'You\'ve completed the series 🎓',
            body:
                'Across six lessons you built the complete toolkit for living with code '
                + 'you didn\'t write — whether it came from a teammate, your past self, or '
                + 'an AI:\n'
                + '- **Breakpoints, stepping, variables** — observe instead of guessing\n'
                + '- **Call stacks** — read execution as a story of frames\n'
                + '- **The memory graph** — see pointers and heap structure live\n'
                + '- **Ground truth + boundaries** — where generated code breaks first\n'
                + '- **Comments ≠ behavior** — the code is the only witness\n'
                + '- **Tests** — verification that outlives the verifier\n\n'
                + 'The playground is yours: the standalone IDE at `/ide` has everything '
                + 'you used here. Go break something on purpose.',
            check: { kind: 'manual' },
        },
    ],
}
