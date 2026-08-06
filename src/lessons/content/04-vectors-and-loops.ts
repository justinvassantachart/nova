import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>
#include <vector>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ function that returns the highest score
//  in a vector of quiz scores."
//
//  Assistant: "highestScore scans the whole vector, tracking the
//  best value seen so far -- the standard maximum algorithm,
//  the same one in every textbook."
// ----------------------------------------------------------------

int highestScore(const std::vector<int>& scores) {
    int best = scores[0];
    for (size_t i = 0; i < scores.size() - 1; i++) {
        if (scores[i] > best) {
            best = scores[i];
        }
    }
    return best;
}

int main() {
    std::vector<int> quizScores = {72, 95, 88, 64};

    std::cout << "Scores: ";
    for (int score : quizScores) {
        std::cout << score << " ";
    }
    std::cout << "\\n";

    std::cout << "Highest: " << highestScore(quizScores) << "\\n";
    return 0;
}
`

const TESTS_CPP = `#include <vector>
#include "nova_test.h"

// The function under test lives in main.cpp. This declaration is
// its signature -- the contract that lets the tests call it.
int highestScore(const std::vector<int>& scores);

STUDENT_TEST("finds a maximum in the middle") {
    EXPECT_EQUALS(highestScore({72, 95, 88, 64}), 95);
}
`

export const vectorsAndLoops: Lesson = {
    id: 'vectors-and-loops',
    slug: 'vectors-and-loops',
    title: 'Vectors and Loops',
    tagline: 'std::vector, C++ loop syntax, and off-by-one errors.',
    description:
        'Learn how to store values in `std::vector`, use range-based and indexed loops, and test boundary '
        + 'cases. Use the debugger to find a loop that skips the final element.',
    minutes: 15,
    tags: ['vectors', 'loops', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'vectors',
            title: 'std::vector basics',
            body:
                'A Python list can be represented by a C++ vector:\n'
                + '```\nscores = [72, 95, 88]              # Python\nstd::vector<int> scores = {72, 95, 88};\n```\n'
                + 'The `<int>` in angle brackets declares the **element type** — read '
                + '`std::vector<int>` as "a vector *of* ints". Every element has the same '
                + 'type. It needs `#include <vector>`.\n\n'
                + 'Common operations:\n'
                + '- `len(scores)` → `scores.size()`\n'
                + '- `scores.append(x)` → `scores.push_back(x)`\n'
                + '- `scores[i]` → `scores[i]` — same, indexed from 0\n\n'
                + 'Python throws `IndexError` for a bad index. The `[]` operator in C++ '
                + '**doesn\'t check** — `scores[999]` reads whatever bytes live there. '
                + 'Code that uses `[]` must keep indexes within the vector bounds.',
            check: { kind: 'manual' },
        },
        {
            id: 'two-loops',
            title: 'Two forms of for loop',
            body:
                'C++ has Python\'s for-each, almost verbatim:\n'
                + '```\nfor (int score : scores) { ... }   // for score in scores:\n```\n'
                + 'And when you need the *index*, the classic three-clause `for`:\n'
                + '```\nfor (size_t i = 0; i < scores.size(); i++) { ... }\n```\n'
                + 'Read the three clauses as: **start** (`i = 0`), **keep going while** '
                + '(`i < scores.size()`), **after each iteration** (`i++`, shorthand for '
                + '`i = i + 1`). It\'s `for i in range(len(scores))` with the machinery '
                + 'exposed.\n\n'
                + '`size_t` is the unsigned (no-negatives) integer type that `.size()` '
                + 'returns and is commonly used for indexes.\n\n'
                + 'Read `main.cpp` and note that it uses both loop styles.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the demo',
            body:
                'Press **Run**.\n\n'
                + 'The scores are 72, 95, 88, and 64. The program reports 95 as the highest.',
            check: { kind: 'stdout', includes: 'Highest: 95', label: 'Run it — highest is 95' },
            successNote: 'The example produces the expected result for this input.',
        },
        {
            id: 'tests-file',
            title: 'Tests get their own file',
            body:
                'Open the `tests.cpp` tab. Last lesson the tests lived at the bottom of '
                + 'main.cpp; real projects give them their own file. One new line makes '
                + 'that work:\n'
                + '```\nint highestScore(const std::vector<int>& scores);\n```\n'
                + 'A signature with a `;` instead of a body is a **declaration**. It '
                + 'tells the compiler "this function exists; the body lives elsewhere." '
                + 'That\'s the contract that lets tests.cpp call into main.cpp.\n\n'
                + 'And read that parameter type, using last lesson\'s vocabulary: '
                + '`const std::vector<int>&` passes the vector by **reference** (`&`) and '
                + 'uses `const` to prevent the function from modifying it.',
            check: { kind: 'manual' },
        },
        {
            id: 'run-provided',
            title: 'Run the provided test',
            body:
                'Press **Tests** (the beaker).\n\n'
                + 'The provided test passes. A passing test verifies the specific input '
                + 'and expectation it contains. This test puts the maximum in the middle '
                + 'of the vector.',
            check: { kind: 'tests', minTotal: 1, allPass: true, label: 'Run Tests — the provided test is green' },
        },
        {
            id: 'edge-thinking',
            title: 'Test boundary cases',
            body:
                'Loop tests should include boundary positions:\n'
                + '- the **first** element\n'
                + '- the **last** element\n'
                + '- a **single-element** vector\n'
                + '- an **empty** vector\n\n'
                + 'These cases help detect errors involving `<`, `<=`, and `- 1`. The '
                + 'provided test covers only a maximum in the middle.',
            check: { kind: 'manual' },
        },
        {
            id: 'edge-test',
            title: 'Write the boundary test',
            body:
                'Add a test to `tests.cpp` where the maximum sits **last**:\n'
                + '```\nSTUDENT_TEST("finds a maximum at the END") {\n'
                + '    EXPECT_EQUALS(highestScore({70, 80, 99}), 99);\n}\n```\n'
                + 'Run **Tests**.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', file: 'tests.cpp', matches: '99', label: 'Add a max-at-the-end test in tests.cpp' },
                    { kind: 'tests', minTotal: 2, minFailed: 1, label: 'Run Tests — the new test fails' },
                ],
            },
            hint: 'Paste the test below the first one in tests.cpp, then press the beaker again.',
            successNote: 'Expected 99, actual 80. The loop did not inspect the last element.',
        },
        {
            id: 'debug',
            title: 'Pause in the loop',
            body:
                'The test says *what* (the last element is ignored); the debugger shows '
                + '*why*. Set a **breakpoint** on the comparison inside the loop:\n'
                + '```\nif (scores[i] > best) {\n```\n'
                + 'and press **Debug**. (Debug runs `main`, whose vector {72, 95, 88, 64} '
                + 'has 4 elements — indexes 0 through 3.)',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'if (scores[i] > best)', label: 'Breakpoint on the if inside the loop' },
                    { kind: 'paused', func: 'highestScore', label: 'Pause inside highestScore()' },
                ],
            },
        },
        {
            id: 'watch-i',
            title: 'Observe the loop index',
            body:
                'Keep your eyes on `i` in the Variables panel and press **Continue** '
                + '(`F5`) to continue the loop, pausing at each comparison: `i` goes 0... '
                + '1... 2... and then the program **runs to the end**. The pause at '
                + '`i == 3` — index of the last element — never comes.\n\n'
                + 'The condition reads `i < scores.size() - 1`, i.e. `i < 3`. The loop '
                + 'stops before inspecting the last element.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_continue', count: 2, label: 'Continue through the loop\'s pauses' },
                    { kind: 'variable', name: 'i', equals: '2', label: 'See i reach 2 — and never 3' },
                ],
            },
            hint: 'Each Continue advances to the next pause at your breakpoint. The observed index values are 0, 1, and 2.',
        },
        {
            id: 'diagnose',
            title: 'Why the loop stops early',
            body:
                'Because `i < size() - 1` *is* correct — in loops that compare element '
                + '`i` with element `i + 1`, such as checking whether a list is sorted. '
                + 'This maximum function does not access `i + 1`, so subtracting one is '
                + 'incorrect. Boundary tests and the debugger identify the difference.\n\n'
                + 'On an *empty* vector, `scores.size() - 1` '
                + 'underflows (unsigned 0 − 1 = enormous), and `scores[0]` in the first '
                + 'line is already out of bounds. Handling an empty vector would require '
                + 'an additional design decision.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix the loop condition',
            body:
                'Scan the **whole** vector:\n'
                + '```\nfor (size_t i = 0; i < scores.size(); i++) {\n```\n'
                + 'Then run **Tests**. The existing middle-maximum test verifies that the '
                + 'original case still works.',
            check: { kind: 'tests', minTotal: 2, allPass: true, label: 'Re-run Tests: all green' },
            successNote: 'Both the middle-maximum and last-maximum tests pass.',
        },
        {
            id: 'lock-it',
            title: 'Test a single-element vector',
            body:
                'Add a test for a **single-element** vector.\n'
                + '```\nSTUDENT_TEST("a one-element vector is its own maximum") {\n'
                + '    EXPECT_EQUALS(highestScore({42}), 42);\n}\n```\n'
                + 'Run **Tests** and confirm all three cases pass.',
            check: { kind: 'tests', minTotal: 3, allPass: true, label: 'Three tests, all passing' },
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- `std::vector<int>` — a Python list with a declared element type; '
                + '`.size()`, `.push_back()`, `[i]`, **no bounds checking**\n'
                + '- Both loops: range-for (`for (int s : v)`) and the three-clause '
                + '`for` with `size_t`\n'
                + '- **Boundary cases**: first, last, single, and empty\n'
                + '- How a `- 1` condition can skip the final element\n\n'
                + 'The next lesson covers pointer values, dereferencing, and the memory graph.',
            check: { kind: 'manual' },
        },
    ],
}
