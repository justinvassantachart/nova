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
    title: 'Vectors, Loops & the Edges',
    tagline: 'Python lists become std::vector, loops grow a third clause, and an AI maximum-finder forgets one element.',
    description:
        'Meet std::vector — the Python list with a declared element type — and both C++ loop styles. Then '
        + 'audit an AI "standard maximum algorithm" that passes its demo and its own test, yet quietly '
        + 'ignores the last element of every vector. Boundary tests flush it out; the debugger convicts it.',
    minutes: 15,
    tags: ['vectors', 'loops', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'vectors',
            title: 'A list with a declared shape',
            body:
                'Python\'s workhorse collection translates almost one-to-one:\n'
                + '```\nscores = [72, 95, 88]              # Python\nstd::vector<int> scores = {72, 95, 88};\n```\n'
                + 'The `<int>` in angle brackets declares the **element type** — read '
                + '`std::vector<int>` as "a vector *of* ints". (One type to rule the '
                + 'whole list: no mixing 72 and "banana".) It needs `#include <vector>`.\n\n'
                + 'The greatest hits, translated:\n'
                + '- `len(scores)` → `scores.size()`\n'
                + '- `scores.append(x)` → `scores.push_back(x)`\n'
                + '- `scores[i]` → `scores[i]` — same, indexed from 0\n\n'
                + 'One sharp edge: Python throws `IndexError` for a bad index. C++ '
                + '**doesn\'t check** — `scores[999]` reads whatever bytes live there. '
                + 'Garbage, crashes, chaos: staying in bounds is *your* job now.',
            check: { kind: 'manual' },
        },
        {
            id: 'two-loops',
            title: 'The two loops',
            body:
                'C++ has Python\'s for-each, almost verbatim:\n'
                + '```\nfor (int score : scores) { ... }   // for score in scores:\n```\n'
                + 'And when you need the *index*, the classic three-clause `for`:\n'
                + '```\nfor (size_t i = 0; i < scores.size(); i++) { ... }\n```\n'
                + 'Read the three clauses as: **start** (`i = 0`), **keep going while** '
                + '(`i < scores.size()`), **after each lap** (`i++`, shorthand for '
                + '`i = i + 1`). It\'s `for i in range(len(scores))` with the machinery '
                + 'exposed.\n\n'
                + '`size_t` is the unsigned (no-negatives) integer type that `.size()` '
                + 'returns — use it for indexes and the compiler stays quiet.\n\n'
                + 'Now read `main.cpp`: the AI used both loop styles. Check its '
                + 'three-clause condition carefully... or don\'t — that\'s what the rest '
                + 'of this lesson is for.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the demo',
            body:
                'Press **Run**.\n\n'
                + 'Scores 72, 95, 88, 64 — highest 95. Correct! The AI calls it "the '
                + 'standard maximum algorithm, the same one in every textbook." Ship it?',
            check: { kind: 'stdout', includes: 'Highest: 95', label: 'Run it — highest is 95' },
            successNote: 'The demo passes. By now that phrase should make you reach for the test suite.',
        },
        {
            id: 'tests-file',
            title: 'Tests get their own file',
            body:
                'Open the `tests.cpp` tab. Last lesson the tests lived at the bottom of '
                + 'main.cpp; real projects give them their own file. One new line makes '
                + 'that work:\n'
                + '```\nint highestScore(const std::vector<int>& scores);\n```\n'
                + 'A signature with a `;` instead of a body is a **declaration** — it '
                + 'tells the compiler "this function exists; the body lives elsewhere." '
                + 'That\'s the contract that lets tests.cpp call into main.cpp.\n\n'
                + 'And read that parameter type, using last lesson\'s vocabulary: '
                + '`const std::vector<int>&` — by **reference** (`&`, no copying a '
                + 'thousand scores) and `const` (a promise: the function may look, not '
                + 'touch).',
            check: { kind: 'manual' },
        },
        {
            id: 'run-provided',
            title: 'Run the provided test',
            body:
                'Press **Tests** (the beaker).\n\n'
                + 'The provided test passes — green. So the function is correct?\n\n'
                + 'No. A passing test proves exactly **the fact it checks**, nothing '
                + 'more. This test put the maximum in the *middle* of the vector. Hold '
                + 'that thought.',
            check: { kind: 'tests', minTotal: 1, allPass: true, label: 'Run Tests — the provided test is green' },
        },
        {
            id: 'edge-thinking',
            title: 'Think in boundaries',
            body:
                'Where do scanning bugs hide? Almost never in the middle. They hide at '
                + 'the **edges**:\n'
                + '- the **first** element\n'
                + '- the **last** element\n'
                + '- a **single-element** vector\n'
                + '- (and the empty vector — a special beast we\'ll note later)\n\n'
                + 'A reviewer\'s reflex you should steal: *test the boundaries first*, '
                + 'because that\'s where `<` vs `<=` and `- 1` mistakes live. The '
                + 'provided test covers the comfy middle. Nobody has asked about the '
                + 'last element yet.',
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
            successNote: 'Expected 99, actual 80. The "textbook algorithm" never met the last element.',
        },
        {
            id: 'debug',
            title: 'Stake out the loop',
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
            title: 'Watch i — and watch it stop short',
            body:
                'Keep your eyes on `i` in the Variables panel and press **Continue** '
                + '(`F5`) to lap the loop, pausing at each comparison: `i` goes 0... '
                + '1... 2... and then the program **runs to the end**. The pause at '
                + '`i == 3` — index of the last element — never comes.\n\n'
                + 'The condition reads `i < scores.size() - 1`, i.e. `i < 3`. The loop '
                + 'retires one element early, every time, on every vector.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_continue', count: 2, label: 'Continue through the loop\'s pauses' },
                    { kind: 'variable', name: 'i', equals: '2', label: 'See i reach 2 — and never 3' },
                ],
            },
            hint: 'Each Continue jumps to the next pause at your breakpoint. Count the pauses: 0, 1, 2... gone.',
        },
        {
            id: 'diagnose',
            title: 'Why would an AI write “- 1”?',
            body:
                'Because `i < size() - 1` *is* correct — in loops that compare element '
                + '`i` with element `i + 1` (think "is this list sorted?"). The pattern '
                + 'is everywhere in training data. The AI reached for a shape that '
                + '*looks* like the maximum loop and is one character wrong for it.\n\n'
                + 'That\'s the deep lesson about AI code: it produces the **most '
                + 'plausible** code, and plausible ≠ correct. Your defense is mechanical: '
                + 'boundary tests, then the debugger.\n\n'
                + 'Footnote for later: on an *empty* vector, `scores.size() - 1` '
                + 'underflows (unsigned 0 − 1 = enormous), and `scores[0]` in the first '
                + 'line is already out of bounds. Edges upon edges — vectors reward '
                + 'paranoia.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix the condition; let the suite judge',
            body:
                'Scan the **whole** vector:\n'
                + '```\nfor (size_t i = 0; i < scores.size(); i++) {\n```\n'
                + 'Then run **Tests** — both should go green. Notice you don\'t re-argue '
                + 'the old case: the max-in-the-middle test still standing guard is what '
                + 'makes the fix safe.',
            check: { kind: 'tests', minTotal: 2, allPass: true, label: 'Re-run Tests: all green' },
            successNote: 'Both green — the middle still works AND the end is finally invited.',
        },
        {
            id: 'lock-it',
            title: 'Lock in the lonely case',
            body:
                'One more boundary from the census: the **single-element** vector.\n'
                + '```\nSTUDENT_TEST("a one-element vector is its own maximum") {\n'
                + '    EXPECT_EQUALS(highestScore({42}), 42);\n}\n```\n'
                + 'Run **Tests**. Three facts, three guards, forever.',
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
                + '- **Boundary thinking**: first, last, single, empty — test the edges '
                + 'first\n'
                + '- Plausible-looking AI loops deserve a `- 1` audit\n\n'
                + 'Next: the layer under everything — **pointers**. Python hid the '
                + 'addresses from you; C++ hands them over, and the memory graph lets '
                + 'you *watch*.',
            check: { kind: 'manual' },
        },
    ],
}
