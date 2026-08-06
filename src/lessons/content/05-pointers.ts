import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Track the leader of a two-player game with a pointer,
//  and award the leader a 50-point bonus through that pointer."
//
//  Assistant: "leader points at whichever score is higher, and
//  awardBonus adds 50 through the pointer, so the bonus lands on
//  the winning player's actual score variable."
// ----------------------------------------------------------------

void awardBonus(int* scorePtr) {
    scorePtr += 50;
}

int main() {
    int alice = 120;
    int bruno = 95;

    int* leader = &alice;
    if (bruno > alice) {
        leader = &bruno;
    }

    awardBonus(leader);

    std::cout << "Alice: " << alice << "\\n";
    std::cout << "Bruno: " << bruno << "\\n";
    std::cout << "Leader's score after bonus: " << *leader << "\\n";
    return 0;
}
`

const TESTS_CPP = `#include "nova_test.h"

// Defined in main.cpp.
void awardBonus(int* scorePtr);

STUDENT_TEST("awardBonus adds 50 through the pointer") {
    int score = 100;
    awardBonus(&score);
    EXPECT_EQUALS(score, 150);
}
`

export const pointersLesson: Lesson = {
    id: 'pointers',
    slug: 'pointers',
    title: 'Pointers and Addresses',
    tagline: 'Pointer values, dereferencing, and inspecting memory.',
    description:
        'Learn how C++ stores memory addresses in pointers, how `&` and `*` work, and how to inspect '
        + 'pointer values in the memory graph. Correct a function that changes an address instead of a score.',
    minutes: 15,
    tags: ['pointers', 'memory graph', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'python-hid-this',
            title: 'Pointer basics',
            body:
                'In Python, `b = a` never copied a list — it made another name for the '
                + 'same object. `id(x)` can show an object\'s identity. C++ lets a program '
                + 'store a memory address directly in a **pointer**:\n'
                + '```\nint alice = 120;\nint* p = &alice;\n```\n'
                + '- `&alice` — "the **address of** alice" (where her box lives in '
                + 'memory)\n'
                + '- `int* p` — `p` is a pointer to an int and stores an address\n'
                + '- `*p` — read or modify the int at that address\n\n'
                + 'An address is a value that can be stored, copied, and passed to a function.',
            check: { kind: 'manual' },
        },
        {
            id: 'two-ops',
            title: 'Dereference to read or write',
            body:
                '`*p` works on both sides of `=`:\n'
                + '```\nint x = *p;      // READ through the arrow\n*p = 200;        // WRITE through the arrow -- alice becomes 200\n```\n'
                + 'The second line changes `alice` through its address.\n\n'
                + 'And the special value: `nullptr` — "this pointer aims at nothing", '
                + 'C++\'s `None` for pointers. Following a null arrow (`*p` when p is '
                + 'nullptr) causes invalid memory access. Check that a pointer is valid '
                + 'before dereferencing it.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the bonus program',
            body:
                'Read `main.cpp`. The program picks a leader by pointer and awards a bonus '
                + 'through it. Press **Run**.\n\n'
                + 'Alice starts with 120. After the function attempts to add a 50-point '
                + 'bonus, her score is still 120.',
            check: { kind: 'stdout', includes: 'Leader\'s score after bonus: 120', label: 'Run it — the bonus changed nothing' },
        },
        {
            id: 'run-tests',
            title: 'Run the provided test',
            body:
                'Open `tests.cpp`: the test hands `awardBonus` the address of a score '
                + 'of 100 and demands 150. Press **Tests**.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests — expected 150, actual 100' },
            successNote: 'awardBonus receives a valid address but does not change the score.',
        },
        {
            id: 'graph-intro',
            title: 'Inspect the memory graph',
            body:
                'Set a **breakpoint** on the call:\n'
                + '```\nawardBonus(leader);\n```\n'
                + 'press **Debug**, and when it pauses, open the **Graph** tab in the '
                + 'right panel.\n\n'
                + 'The `main` frame shows `alice` at 120, `bruno` at 95, and `leader` '
                + 'pointing to `alice`. The `if` condition is false because 95 is not greater '
                + 'than 120, so `leader` retains `alice`\'s address.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'awardBonus(leader);', label: 'Breakpoint on the awardBonus call' },
                    { kind: 'paused', anchor: 'awardBonus(leader);', label: 'Debug until you pause there' },
                    { kind: 'right-tab', tab: 'graph', label: 'Open the Graph tab' },
                ],
            },
            hint: 'The right panel has tabs: Variables, Graph, ... Click Graph while paused.',
        },
        {
            id: 'step-into',
            title: 'Step into awardBonus',
            body:
                'Press **Step Into** (`F11`) to pause inside `awardBonus`.\n\n'
                + 'A new frame appears with `scorePtr`, which holds the same address as '
                + '`leader`. Arguments are copies, so copying a pointer copies its address. '
                + 'Both pointers refer to `alice`.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_into', label: 'Step Into (F11) awardBonus' },
                    { kind: 'paused', func: 'awardBonus', label: 'Pause inside awardBonus()' },
                ],
            },
        },
        {
            id: 'watch-the-arrow',
            title: 'Observe pointer arithmetic',
            body:
                'The line about to run is the AI\'s entire bonus logic:\n'
                + '```\nscorePtr += 50;\n```\n'
                + 'Press **Step Over** (`F10`) and watch the graph.\n\n'
                + 'The operation does not change `alice`. It advances the pointer by 50 '
                + '`int` positions. This is pointer arithmetic, but it is not the intended '
                + 'operation for this function.',
            check: { kind: 'event', event: 'debug_step_over', label: 'Step Over the += line and watch the graph' },
            successNote: 'The pointer value changed, but the score did not. The expression needs `*`.',
        },
        {
            id: 'diagnose',
            title: 'Pointer value and pointed-to value',
            body:
                'Two spellings, two meanings:\n'
                + '```\nscorePtr += 50;     // move the ARROW 50 slots\n*scorePtr += 50;    // add 50 to the BOX it points at\n```\n'
                + 'Both expressions compile, but they modify different values. The `*` '
                + 'selects the value stored at the pointer\'s address.\n\n'
                + 'The `leader` pointer in `main` still points to `alice` because `scorePtr` '
                + 'is a copy. Changing the copied pointer does not change `leader`.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Dereference the pointer',
            body:
                'Fix the line:\n'
                + '```\n*scorePtr += 50;\n```\n'
                + 'and run **Tests**.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: '\\*scorePtr\\s*\\+=\\s*50', label: 'Dereference: *scorePtr += 50;' },
                    { kind: 'tests', minTotal: 1, allPass: true, label: 'Re-run Tests: green' },
                ],
            },
            successNote: 'The function changes the score from 100 to 150.',
        },
        {
            id: 'verify-main',
            title: 'Run the corrected program',
            body:
                'Press **Run** and read all three lines: Alice 170, Bruno 95, leader\'s '
                + 'score 170. Dereferencing the pointer updates `alice`\'s value.',
            check: { kind: 'stdout', includes: 'Leader\'s score after bonus: 170', label: 'Run it — 120 + 50 = 170' },
        },
        {
            id: 'null-guard',
            title: 'Handle nullptr',
            body:
                'If someone calls `awardBonus(nullptr)`, dereferencing `scorePtr` causes '
                + 'invalid memory access. Return without changing anything in this case:\n'
                + '```\nif (scorePtr == nullptr) {\n    return;\n}\n```\n'
                + 'Place this at the start of `awardBonus`. Then add a test to `tests.cpp`:\n'
                + '```\nSTUDENT_TEST("a null pointer is safely ignored") {\n'
                + '    awardBonus(nullptr);\n    EXPECT(true);\n}\n```\n'
                + '`EXPECT(true)` records that the call returned without terminating the '
                + 'test process. Run **Tests** and confirm both tests pass.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'scorePtr\\s*[!=]=\\s*nullptr|nullptr\\s*[!=]=\\s*scorePtr|!\\s*scorePtr', label: 'Add a nullptr guard in awardBonus' },
                    { kind: 'tests', minTotal: 2, allPass: true, label: 'Two tests, all passing' },
                ],
            },
            hint: 'Put the if-return at the top of awardBonus, then paste the test into tests.cpp and run the beaker.',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- `&x` takes an address; `int* p` stores one; `*p` follows it — to '
                + 'read **or write**\n'
                + '- `nullptr` represents no valid address; check it before dereferencing\n'
                + '- Pointers are values: copied like ints, so a function gets a copy of '
                + 'the address\n'
                + '- `p += n` changes the address; `*p += n` changes the pointed-to value\n'
                + '- The **Graph tab** displays pointer relationships\n\n'
                + 'The next lesson covers `new`, `delete`, and heap allocation.',
            check: { kind: 'manual' },
        },
    ],
}
