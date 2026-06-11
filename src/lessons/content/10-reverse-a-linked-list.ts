import type { Lesson } from '../types'

const LIST_H = `#pragma once

// Shared contract for the linked list. Both main.cpp and tests.cpp
// include this header, so they always agree on the Node layout and
// the function signatures.

struct Node {
    int value;
    Node* next;
};

Node* pushFront(Node* head, int value);
int length(Node* head);
void printList(Node* head);
void reverse(Node*& head);
`

const MAIN_CPP = `#include <iostream>
#include "list.h"

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Reverse my linked list in place, in C++."
//
//  Assistant: "reverse walks the chain once, turning each next
//  pointer around as it goes; prev trails one node behind so
//  every link flips cleanly. After the walk, prev is the new
//  head. This is the standard in-place reversal -- O(n) time,
//  O(1) space."
// ----------------------------------------------------------------

Node* pushFront(Node* head, int value) {
    return new Node{value, head};
}

int length(Node* head) {
    int count = 0;
    for (Node* curr = head; curr != nullptr; curr = curr->next) {
        count++;
    }
    return count;
}

void printList(Node* head) {
    for (Node* curr = head; curr != nullptr; curr = curr->next) {
        std::cout << curr->value << " -> ";
    }
    std::cout << "x\\n";
}

void reverse(Node*& head) {
    Node* prev = nullptr;
    Node* curr = head;
    while (curr != nullptr) {
        curr->next = prev;
        prev = curr;
        curr = curr->next;
    }
    head = prev;
}

int main() {
    Node* head = nullptr;
    head = pushFront(head, 30);
    head = pushFront(head, 20);
    head = pushFront(head, 10);

    std::cout << "Before: ";
    printList(head);

    reverse(head);

    std::cout << "After:  ";
    printList(head);
    return 0;
}
`

const TESTS_CPP = `#include "nova_test.h"
#include "list.h"

STUDENT_TEST("reversing 10 -> 20 -> 30 yields 30 -> 20 -> 10") {
    Node* head = nullptr;
    head = pushFront(head, 30);
    head = pushFront(head, 20);
    head = pushFront(head, 10);

    reverse(head);

    EXPECT_EQUALS(length(head), 3);
    EXPECT_EQUALS(head->value, 30);
    EXPECT_EQUALS(head->next->value, 20);
    EXPECT_EQUALS(head->next->next->value, 10);
}
`

export const reverseALinkedList: Lesson = {
    id: 'reverse-a-linked-list',
    slug: 'reverse-a-linked-list',
    title: 'Capstone: Reverse the Chain',
    tagline: 'The classic interview question, an AI solution that vaporizes the list mid-flip — and you, fully armed.',
    description:
        'The graduation exercise. An AI delivers the famous in-place reversal with a confident O(n)/O(1) '
        + 'sales pitch — and loses two-thirds of the list on the first flip. Run the tests before trusting '
        + 'anything, watch the chain snap live in the memory graph, restore the three-pointer dance, and '
        + 'armor it for whoever comes after you.',
    minutes: 18,
    tags: ['linked lists', 'capstone', 'testing', 'AI-generated code'],
    files: { 'list.h': LIST_H, 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'capstone',
            title: 'The graduation exercise',
            body:
                'Nine lessons ago you\'d never compiled a line of C++. Since then: '
                + 'types, functions and their copies, vectors and loop edges, '
                + 'pointers, the heap, structs, building chains, and edge-case '
                + 'surgery.\n\n'
                + 'The capstone is the most famous linked-list question in the world: '
                + '**reverse the list in place**. An AI has already "solved" it — '
                + 'read its pitch in `main.cpp`, complete with a complexity analysis.\n\n'
                + 'Your job is a full professional review, in the order professionals '
                + 'do it: **read → test → debug → fix → armor.** No step skipped, '
                + 'nothing taken on faith.',
            check: { kind: 'manual' },
        },
        {
            id: 'headers',
            title: 'Three files — a real project shape',
            body:
                'This workspace finally looks like real C++:\n'
                + '- `list.h` — the **header**: the Node struct and the four '
                + 'signatures. The shared contract.\n'
                + '- `main.cpp` — the implementations, plus the demo\n'
                + '- `tests.cpp` — the suite\n\n'
                + 'Both `.cpp` files start with `#include "list.h"` — *that\'s* how '
                + 'they agree on what a Node is and what `reverse` looks like, '
                + 'without repeating themselves. (It\'s the C++ answer to Python\'s '
                + '`import`.) The `#pragma once` at the top means "if several files '
                + 'include me, only count me once."\n\n'
                + 'Last lesson the contract lived in hand-written declarations; a '
                + 'header is that idea, industrialized. From here on, every '
                + 'multi-file program you meet will be shaped like this one.',
            check: { kind: 'manual' },
        },
        {
            id: 'read-predict',
            title: 'Read the algorithm. Predict.',
            body:
                'Read `reverse` slowly:\n'
                + '```\nwhile (curr != nullptr) {\n    curr->next = prev;   // flip this node\'s arrow backward\n'
                + '    prev = curr;         // prev advances\n    curr = curr->next;   // curr advances... where, exactly?\n}\n```\n'
                + 'The idea is genuinely right: walk once, flip each arrow to point '
                + 'backward, `prev` becomes the new head. The pitch is word-perfect.\n\n'
                + 'Now trace the **first iteration** on paper, with '
                + '`10 -> 20 -> 30`: after `curr->next = prev;`, node 10\'s arrow '
                + 'points at `nullptr`. Then `curr = curr->next;` sends curr to... '
                + 'node 10\'s next... which you *just flipped*.\n\n'
                + 'Make your prediction and hold it. Reviewers who predict before '
                + 'running learn twice as much from what happens next.',
            check: { kind: 'manual' },
        },
        {
            id: 'tests-first',
            title: 'Tests before trust',
            body:
                'This time you don\'t even run the demo first — the suite is the '
                + 'fastest question you can ask. `tests.cpp` builds '
                + '`10 -> 20 -> 30`, reverses, and demands all three values in '
                + 'reversed order.\n\n'
                + 'Press **Tests**.\n\n'
                + '(If the panel reports the suite stopped early: an assertion '
                + '*crashed* — `head->next` was `nullptr` and the test followed it. '
                + 'A crash mid-test is itself a verdict: the wreck is worse than a '
                + 'wrong number.)',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests — the reversal fails' },
            successNote: 'Length 1, not 3. The list didn\'t reverse — it nearly ceased to exist.',
        },
        {
            id: 'stakeout',
            title: 'Stake out the flip',
            body:
                'Set a **breakpoint** on the flip line:\n'
                + '```\ncurr->next = prev;\n```\n'
                + 'press **Debug**, and open the **Graph** tab.\n\n'
                + 'First pause: the full chain is alive — '
                + '`[10] -> [20] -> [30] -> x` — with `prev` at nothing, `curr` on '
                + '`[10]`. Three boxes, all reachable. Remember this picture; it\'s '
                + 'the last time you\'ll see it intact.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'curr->next = prev;', label: 'Breakpoint on the flip line' },
                    { kind: 'paused', anchor: 'curr->next = prev;', label: 'Debug until you pause there' },
                    { kind: 'right-tab', tab: 'graph', label: 'Open the Graph tab' },
                ],
            },
        },
        {
            id: 'the-snap',
            title: 'Watch the chain snap',
            body:
                'Now **Step Over** (`F10`) three times, watching the graph like a '
                + 'hawk:\n'
                + '1. `curr->next = prev;` — node 10\'s arrow flips to `x`. Fine for '
                + 'node 10... but the bridge to `[20]` just ceased to exist.\n'
                + '2. `prev = curr;` — prev steps onto `[10]`. Still fine.\n'
                + '3. `curr = curr->next;` — curr follows 10\'s next... **which is '
                + 'now null**. curr falls off the world. The loop is over.\n\n'
                + 'Look at the wreckage: `[20]` and `[30]` still exist on the heap — '
                + 'no arrow from any stack frame reaches them. Orphaned, mid-surgery '
                + '(lesson 6 would call it a leak; lesson 9 would call it abandoned '
                + 'patients). `head` becomes `prev` = node 10 alone.',
            check: { kind: 'event', event: 'debug_step_over', count: 3, label: 'Step Over ×3 — watch curr fall off the flipped arrow' },
            successNote: 'Your paper prediction, confirmed in pixels: the flip destroyed the only path forward.',
        },
        {
            id: 'diagnose',
            title: 'The three-pointer dance',
            body:
                'The AI\'s loop has two jobs for one arrow: `curr->next` is both '
                + '**the link being flipped** and **the road ahead**. Flip first and '
                + 'the road is gone.\n\n'
                + 'The fix is to save the road before demolishing it — the famous '
                + '**save, flip, advance**:\n'
                + '```\nwhile (curr != nullptr) {\n'
                + '    Node* next = curr->next;   // SAVE the road ahead\n'
                + '    curr->next = prev;         // FLIP the arrow\n'
                + '    prev = curr;               // ADVANCE prev\n'
                + '    curr = next;               // ADVANCE across the saved road\n}\n```\n'
                + 'One extra pointer, dancing one step ahead of the demolition. '
                + 'That\'s the entire secret of in-place reversal.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Restore the dance; let the suite judge',
            body:
                'Apply the fix in `reverse`, then press **Tests**.\n\n'
                + 'If you\'re curious first: with the breakpoint still set, **Debug** '
                + 'and step through a lap or two — the graph shows arrows flipping '
                + 'one by one while the chain *stays whole*, the two halves trading '
                + 'nodes across the dance.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: '=\\s*curr->next;[\\s\\S]*curr->next\\s*=\\s*prev;', label: 'Save curr->next BEFORE flipping the arrow' },
                    { kind: 'tests', minTotal: 1, allPass: true, label: 'Re-run Tests: green' },
                ],
            },
            hint: 'Add "Node* next = curr->next;" as the first line of the loop, and make the last line "curr = next;".',
            successNote: 'Three nodes in, three nodes out, order reversed. The dance holds.',
        },
        {
            id: 'run-demo',
            title: 'See it with your own eyes',
            body: 'Press **Run** — the demo prints the chain both ways.',
            check: { kind: 'stdout', includes: 'After:  30 -> 20 -> 10 -> x', label: 'Run it — 30 -> 20 -> 10' },
        },
        {
            id: 'armor',
            title: 'Armor it for the next person',
            body:
                'Capstone discipline: a fix isn\'t finished until the boundaries are '
                + 'pinned. Add the census\'s two classics to `tests.cpp`:\n'
                + '```\nSTUDENT_TEST("reversing a single node keeps it") {\n'
                + '    Node* head = pushFront(nullptr, 42);\n'
                + '    reverse(head);\n'
                + '    EXPECT_EQUALS(length(head), 1);\n'
                + '    EXPECT_EQUALS(head->value, 42);\n}\n\n'
                + 'STUDENT_TEST("reversing the empty list is safe") {\n'
                + '    Node* head = nullptr;\n'
                + '    reverse(head);\n'
                + '    EXPECT_EQUALS(length(head), 0);\n}\n```\n'
                + 'Press **Tests** — three green.',
            check: { kind: 'tests', minTotal: 3, allPass: true, label: 'Three tests, all passing' },
        },
        {
            id: 'graduation',
            title: 'You\'ve completed the course 🎓',
            body:
                'Look at what\'s in your toolbox now:\n'
                + '- **C++ from Python**: compilation, types on variables, '
                + 'signatures, vectors, both loops\n'
                + '- **The value rule**: everything copies — ints, pointers, structs, '
                + 'even head pointers — unless a `&` says otherwise\n'
                + '- **Memory, owned**: `&`/`*`/`->`, `new`/`delete`, the ledger, '
                + 'leaks and dangling arrows\n'
                + '- **Linked lists**: build, traverse, edge-case surgery, and the '
                + 'reversal dance\n'
                + '- **The review loop**: read → test → debug → fix → armor — '
                + 'especially for code that arrives looking confident, AI-written or '
                + 'otherwise\n\n'
                + 'That last skill is the one that compounds: the demos lied, the '
                + 'comments lied, the complexity analysis was impeccable and '
                + 'irrelevant — **the tests and the debugger never lied**.\n\n'
                + 'The standalone IDE at `/ide` has everything you used here. Go '
                + 'build something — and break it on purpose first.',
            check: { kind: 'manual' },
        },
    ],
}
