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
    title: 'Pointers: Addresses Made Visible',
    tagline: 'Python hid the arrows. C++ hands them to you — and an AI bonus function moves an arrow instead of a score.',
    description:
        'Every Python name was secretly a reference; C++ promotes the address to a value you can store, '
        + 'pass, and follow. Learn & and *, watch pointers as live arrows in the memory graph, and debug an '
        + 'AI function that meant to add 50 points and instead pointed 50 ints into the wilderness.',
    minutes: 15,
    tags: ['pointers', 'memory graph', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'python-hid-this',
            title: 'The arrows were always there',
            body:
                'In Python, `b = a` never copied a list — it made another name for the '
                + 'same object. Every variable was secretly an arrow, and `id(x)` let '
                + 'you peek at where it pointed. You\'ve been using references your whole '
                + 'programming life; Python just refused to let you *hold* one.\n\n'
                + 'C++ hands you the arrow as a first-class value — a **pointer**:\n'
                + '```\nint alice = 120;\nint* p = &alice;\n```\n'
                + '- `&alice` — "the **address of** alice" (where her box lives in '
                + 'memory)\n'
                + '- `int* p` — "p is a pointer to an int": a box that holds an '
                + '*address*\n'
                + '- `*p` — "the thing p points at": follow the arrow\n\n'
                + 'Storable, copyable, passable — an address is just a value, like 120.',
            check: { kind: 'manual' },
        },
        {
            id: 'two-ops',
            title: 'Follow the arrow to read — or to write',
            body:
                '`*p` works on both sides of `=`:\n'
                + '```\nint x = *p;      // READ through the arrow\n*p = 200;        // WRITE through the arrow -- alice becomes 200\n```\n'
                + 'That second line is the superpower: anyone holding `&alice` can '
                + 'change alice from anywhere in the program.\n\n'
                + 'And the special value: `nullptr` — "this pointer aims at nothing", '
                + 'C++\'s `None` for pointers. Following a null arrow (`*p` when p is '
                + 'nullptr) crashes the program. Rule one of pointers: **know where it '
                + 'points before you follow it.**',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the AI\'s bonus program',
            body:
                'Read `main.cpp` — the AI picks a leader by pointer and awards a bonus '
                + 'through it. Press **Run**.\n\n'
                + 'Alice leads with 120... and after her +50 bonus she has... 120. '
                + 'Hm. The AI insists the bonus "lands on the winning player\'s actual '
                + 'score variable." You know what comes next.',
            check: { kind: 'stdout', includes: 'Leader\'s score after bonus: 120', label: 'Run it — the bonus changed nothing' },
        },
        {
            id: 'run-tests',
            title: 'Put a number on the lie',
            body:
                'Open `tests.cpp`: the test hands `awardBonus` the address of a score '
                + 'of 100 and demands 150. Press **Tests**.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests — expected 150, actual 100' },
            successNote: 'awardBonus received a perfectly good address and improved nothing.',
        },
        {
            id: 'graph-intro',
            title: 'Open the memory graph',
            body:
                'This lesson gets a new instrument. Set a **breakpoint** on the call:\n'
                + '```\nawardBonus(leader);\n```\n'
                + 'press **Debug**, and when it pauses, open the **Graph** tab in the '
                + 'right panel.\n\n'
                + 'There\'s `main`\'s frame: `alice` 120, `bruno` 95 — and `leader`, '
                + 'drawn as an actual **arrow** pointing at alice\'s box. That\'s not a '
                + 'metaphor; it\'s your program\'s memory, live. (The `if` didn\'t fire — '
                + 'bruno\'s 95 doesn\'t beat 120 — so the arrow stayed on alice.)',
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
            title: 'Step INTO the call',
            body:
                'Press **Step Into** (`F11`) — the debugger dives *into* `awardBonus` '
                + 'instead of hopping over it.\n\n'
                + 'A new frame appears with `scorePtr` — a **second arrow to the same '
                + 'box**. Recognize the move? Arguments are copies (lesson 3) — and '
                + 'copying a pointer copies the *arrow*, not the box it aims at. Two '
                + 'arrows, one alice.',
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
            title: 'Watch the arrow fly away',
            body:
                'The line about to run is the AI\'s entire bonus logic:\n'
                + '```\nscorePtr += 50;\n```\n'
                + 'Press **Step Over** (`F10`) and watch the graph.\n\n'
                + 'The arrow doesn\'t add anything to alice — it **detaches and flies 50 '
                + 'int-slots away**, pointing into the wilderness. Adding to a *pointer* '
                + 'moves the address (that\'s called pointer arithmetic, and it has real '
                + 'uses — this is not one of them).',
            check: { kind: 'event', event: 'debug_step_over', label: 'Step Over the += line and watch the graph' },
            successNote: 'The score never changed; the arrow did. One missing character: *',
        },
        {
            id: 'diagnose',
            title: 'p vs *p — say what you mean',
            body:
                'Two spellings, two meanings:\n'
                + '```\nscorePtr += 50;     // move the ARROW 50 slots\n*scorePtr += 50;    // add 50 to the BOX it points at\n```\n'
                + 'The AI wrote a sentence about the arrow when it meant a sentence '
                + 'about the box. Both compile; only one is the program you asked for. '
                + 'C++ trusts you with addresses — the `*` is how you say which level '
                + 'you\'re talking about.\n\n'
                + 'Note also what *didn\'t* break: main\'s `leader` still points at '
                + 'alice, because `scorePtr` was a copy. The damage stayed inside the '
                + 'function — this time.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Add the star, prove the fix',
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
            successNote: '100 → 150. The bonus finally lands in the box, not on the arrow.',
        },
        {
            id: 'verify-main',
            title: 'Verify the whole story',
            body:
                'Press **Run** and read all three lines: Alice 170, Bruno 95, leader\'s '
                + 'score 170 — the bonus went through the pointer into alice\'s actual '
                + 'box, which is exactly what "through the pointer" was supposed to '
                + 'mean.',
            check: { kind: 'stdout', includes: 'Leader\'s score after bonus: 170', label: 'Run it — 120 + 50 = 170' },
        },
        {
            id: 'null-guard',
            title: 'Guard the null arrow',
            body:
                'One more professional touch. What if someone calls '
                + '`awardBonus(nullptr)`? `*scorePtr` would follow an arrow to nowhere — '
                + 'crash. Make the function shrug instead:\n'
                + '```\nif (scorePtr == nullptr) {\n    return;\n}\n```\n'
                + 'first thing in `awardBonus`. Then add the tripwire to `tests.cpp`:\n'
                + '```\nSTUDENT_TEST("a null pointer is safely ignored") {\n'
                + '    awardBonus(nullptr);\n    EXPECT(true);\n}\n```\n'
                + '(`EXPECT(true)` just records that we made it here alive — without the '
                + 'guard, the crash would have taken the whole suite down.) Run '
                + '**Tests**: all green.',
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
                + '- `nullptr` is the arrow to nowhere; guard before you follow\n'
                + '- Pointers are values: copied like ints, so a function gets a copy of '
                + 'the *arrow*\n'
                + '- `p += n` moves the arrow; `*p += n` changes the box — one `*` '
                + 'apart\n'
                + '- The **Graph tab** draws your pointers live\n\n'
                + 'Next: so far every box died automatically at its closing brace. Time '
                + 'to make boxes that *outlive* their function — `new`, `delete`, and '
                + 'the heap — where linked lists will live.',
            check: { kind: 'manual' },
        },
    ],
}
