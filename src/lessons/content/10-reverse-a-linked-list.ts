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
    title: 'Reversing a Linked List',
    tagline: 'Reversing a linked list and testing the result.',
    description:
        'Review an in-place linked-list reversal, run the tests, and use the memory graph to identify a lost '
        + 'link. Correct the algorithm by saving the next pointer before updating the current node.',
    minutes: 18,
    tags: ['linked lists', 'pointers', 'testing', 'AI-generated code'],
    files: { 'list.h': LIST_H, 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'capstone',
            title: 'Review the reversal function',
            body:
                'This lesson combines types, pass-by-value, vectors, loops, pointers, '
                + 'heap allocation, structs, and linked-list operations.\n\n'
                + 'The task is to **reverse the list in place**. The provided '
                + 'implementation includes a complexity analysis but contains a '
                + 'pointer-ordering error.\n\n'
                + 'Review it in this order: **read → test → debug → fix → add boundary tests.**',
            check: { kind: 'manual' },
        },
        {
            id: 'headers',
            title: 'Three project files',
            body:
                'This workspace uses three C++ files:\n'
                + '- `list.h` — the **header**: the Node struct and the four '
                + 'signatures. The shared contract.\n'
                + '- `main.cpp` — the implementations, plus the demo\n'
                + '- `tests.cpp` — the suite\n\n'
                + 'Both `.cpp` files start with `#include "list.h"` — *that\'s* how '
                + 'they agree on what a Node is and what `reverse` looks like, '
                + 'without repeating themselves. (It\'s the C++ answer to Python\'s '
                + '`import`.) The `#pragma once` at the top means "if several files '
                + 'include me, only count me once."\n\n'
                + 'The previous lesson used hand-written declarations. A header keeps '
                + 'those shared declarations in one place for a multi-file program.',
            check: { kind: 'manual' },
        },
        {
            id: 'read-predict',
            title: 'Read the algorithm and predict the result',
            body:
                'Read `reverse` slowly:\n'
                + '```\nwhile (curr != nullptr) {\n    curr->next = prev;   // flip this node\'s arrow backward\n'
                + '    prev = curr;         // prev advances\n    curr = curr->next;   // curr advances... where, exactly?\n}\n```\n'
                + 'The overall approach is correct: walk once, update each pointer to point '
                + 'backward, and `prev` becomes the new head.\n\n'
                + 'Now trace the **first iteration** on paper, with '
                + '`10 -> 20 -> 30`: after `curr->next = prev;`, node 10\'s arrow '
                + 'points at `nullptr`. Then `curr = curr->next;` sends curr to... '
                + 'node 10\'s next... which you *just flipped*.\n\n'
                + 'Predict the result before running the program, then compare the '
                + 'prediction with the test result.',
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
                + '(If the panel reports that the suite stopped early, an assertion '
                + 'crashed because `head->next` was `nullptr` and the test followed it. '
                + 'That also indicates that the reversal is incorrect.)',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests — the reversal fails' },
            successNote: 'The resulting length is 1 instead of 3, so the reversal lost access to two nodes.',
        },
        {
            id: 'stakeout',
            title: 'Inspect the first pointer update',
            body:
                'Set a **breakpoint** on the flip line:\n'
                + '```\ncurr->next = prev;\n```\n'
                + 'press **Debug**, and open the **Graph** tab.\n\n'
                + 'First pause: the full chain is alive — '
                + '`[10] -> [20] -> [30] -> x` — with `prev` at nothing, `curr` on '
                + '`[10]`. All three boxes are reachable at this point.',
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
            title: 'Step through the pointer updates',
            body:
                'Now **Step Over** (`F10`) three times and watch the graph:\n'
                + '1. `curr->next = prev;` — node 10 now points to `x`, so it no longer '
                + 'points to `[20]`.\n'
                + '2. `prev = curr;` — prev now points to `[10]`.\n'
                + '3. `curr = curr->next;` — curr follows 10\'s next... **which is '
                + 'now null**. The loop ends after one iteration.\n\n'
                + '`[20]` and `[30]` still exist on the heap, but no pointer from a '
                + 'stack frame reaches them. `head` becomes `prev`, which points only '
                + 'to node 10.',
            check: { kind: 'event', event: 'debug_step_over', count: 3, label: 'Step Over ×3 — watch curr fall off the flipped arrow' },
            successNote: 'The debugger confirms that updating curr->next removed the only path to the remaining nodes.',
        },
        {
            id: 'diagnose',
            title: 'Save the next pointer',
            body:
                'The loop uses `curr->next` for two purposes: it is both '
                + '**the link being reversed** and **the pointer to the next node**. '
                + 'Updating it first makes the next node inaccessible.\n\n'
                + 'The fix is to save the next pointer before changing it: '
                + '**save, update, advance**:\n'
                + '```\nwhile (curr != nullptr) {\n'
                + '    Node* next = curr->next;   // SAVE the next node\n'
                + '    curr->next = prev;         // REVERSE the link\n'
                + '    prev = curr;               // ADVANCE prev\n'
                + '    curr = next;               // ADVANCE to the saved node\n}\n```\n'
                + 'The additional pointer preserves access to the unprocessed part of '
                + 'the list while each link is reversed.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Apply the fix and run the tests',
            body:
                'Apply the fix in `reverse`, then press **Tests**.\n\n'
                + 'If you\'re curious first: with the breakpoint still set, **Debug** '
                + 'and step through one or two iterations. The graph shows links '
                + 'reversing while `next` preserves access to the remaining nodes.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: '=\\s*curr->next;[\\s\\S]*curr->next\\s*=\\s*prev;', label: 'Save curr->next BEFORE flipping the arrow' },
                    { kind: 'tests', minTotal: 1, allPass: true, label: 'Re-run Tests: green' },
                ],
            },
            hint: 'Add "Node* next = curr->next;" as the first line of the loop, and make the last line "curr = next;".',
            successNote: 'All three nodes remain reachable in reversed order.',
        },
        {
            id: 'run-demo',
            title: 'Run the corrected demo',
            body: 'Press **Run** — the demo prints the chain both ways.',
            check: { kind: 'stdout', includes: 'After:  30 -> 20 -> 10 -> x', label: 'Run it — 30 -> 20 -> 10' },
        },
        {
            id: 'armor',
            title: 'Add boundary tests',
            body:
                'Add tests for a single-node list and an empty list to `tests.cpp`:\n'
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
            title: 'Course complete',
            body:
                'This course covered:\n'
                + '- **C++ from Python**: compilation, types on variables, '
                + 'signatures, vectors, both loops\n'
                + '- **The value rule**: everything copies — ints, pointers, structs, '
                + 'even head pointers — unless a `&` says otherwise\n'
                + '- **Memory management**: `&`/`*`/`->`, `new`/`delete`, '
                + 'leaks, and dangling pointers\n'
                + '- **Linked lists**: build, traverse, remove nodes, and reverse links\n'
                + '- **The review process**: read → test → debug → fix → add tests — '
                + 'especially for code that arrives looking confident, AI-written or '
                + 'otherwise\n\n'
                + 'The editor at `/ide` includes the tools used in these lessons and '
                + 'can be used for additional C++ programs.',
            check: { kind: 'manual' },
        },
    ],
}
