import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>
#include "nova_test.h"

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Add removeValue(head, value) to my int linked list:
//  unlink the first node holding value. Handle every case."
//
//  Assistant: "removeValue walks the list with two pointers,
//  prev and curr. When curr holds the value, prev is rewired
//  around it and the node is deleted; if the value is missing,
//  nothing changes; if the head matches, head advances past it.
//  I tested removing a middle value and the list came out
//  exactly right."
// ----------------------------------------------------------------

struct Node {
    int value;
    Node* next;
};

Node* pushFront(Node* head, int value) {
    return new Node{value, head};
}

void printList(Node* head) {
    Node* curr = head;
    while (curr != nullptr) {
        std::cout << curr->value << " -> ";
        curr = curr->next;
    }
    std::cout << "x\\n";
}

int length(Node* head) {
    int count = 0;
    Node* walk = head;
    while (walk != nullptr) {
        count++;
        walk = walk->next;
    }
    return count;
}

void removeValue(Node* head, int value) {
    Node* prev = nullptr;
    Node* curr = head;
    while (curr != nullptr && curr->value != value) {
        prev = curr;
        curr = curr->next;
    }
    if (curr == nullptr) {
        return;  // value not in the list
    }
    if (prev == nullptr) {
        head = curr->next;  // removing the head: advance past it
        return;
    }
    prev->next = curr->next;
    delete curr;
}

int main() {
    // Wait times (minutes) at the campus espresso bar.
    Node* head = nullptr;
    head = pushFront(head, 12);
    head = pushFront(head, 3);
    head = pushFront(head, 7);

    std::cout << "Before: ";
    printList(head);

    removeValue(head, 3);  // the 3-minute lull is over
    std::cout << "After:  ";
    printList(head);
    return 0;
}

// ---- Tests ---------------------------------------------------------
// Press the beaker (Tests) button to run these.

STUDENT_TEST("removes a middle value") {
    Node* list = nullptr;
    list = pushFront(list, 12);
    list = pushFront(list, 3);
    list = pushFront(list, 7);
    removeValue(list, 3);
    EXPECT_EQUALS(length(list), 2);
    EXPECT_EQUALS(list->value, 7);
    EXPECT_EQUALS(list->next->value, 12);
}
`

export const linkedListEdgeCases: Lesson = {
    id: 'linked-list-edge-cases',
    slug: 'linked-list-edge-cases',
    title: 'Removing Linked-List Nodes',
    tagline: 'Removing linked-list nodes and handling boundary cases.',
    description:
        'Remove a node by updating the pointer that leads to it. Test middle, tail, head, missing-value, and '
        + 'empty-list cases, then use Node*& so the function can update the caller\'s head pointer.',
    minutes: 16,
    tags: ['linked lists', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'surgery',
            title: 'Remove a node by updating links',
            body:
                'To remove `[3]` from this chain:\n'
                + '```\nhead -> [7|*] -> [3|*] -> [12|x]\n```\n'
                + 'you make the arrow that *enters* `[3]` skip over it:\n'
                + '```\nhead -> [7|*] ---------> [12|x]      then: delete the [3] node\n```\n'
                + 'This requires a pointer to the node **before** the one being removed. '
                + 'Read the **prev/curr traversal** in `removeValue`:\n'
                + '```\nwhile (curr != nullptr && curr->value != value) {\n'
                + '    prev = curr;\n    curr = curr->next;\n}\n```\n'
                + '`curr` searches while `prev` stays one step behind. When `curr` '
                + 'reaches the target, `prev->next = curr->next;` bypasses it, and '
                + '`delete curr;` releases its allocation.',
            check: { kind: 'manual' },
        },
        {
            id: 'census',
            title: 'List the boundary cases',
            body:
                'Linked-list removal has a standard set of cases to review:\n'
                + '- remove a **middle** node\n'
                + '- remove the **tail** — does `curr->next` being null break the '
                + 'rewire?\n'
                + '- remove the **head** — there is **no prev**, so the function must update `head` '
                + 'itself?\n'
                + '- remove a **missing value** — must change nothing\n'
                + '- remove from the **empty list** — must survive\n\n'
                + 'The provided note says "Handle every case" but mentions testing '
                + 'only a middle value. Review the other cases as well.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the middle-node case',
            body:
                'Press **Run**. The demo removes 3 — a middle node — from '
                + '`7 -> 3 -> 12`.',
            check: { kind: 'stdout', includes: 'After:  7 -> 12 -> x', label: 'Run it — the middle removal works' },
            successNote: 'The provided middle-node case works.',
        },
        {
            id: 'provided-test',
            title: 'Run the provided test',
            body:
                'The test at the bottom of `main.cpp` checks the same middle '
                + 'removal — length 2, then both survivors in order, reached with '
                + 'lesson 7\'s arrow: `list->next->value`. Press **Tests**: green.\n\n'
                + 'A passing suite confirms only the covered cases. Compare the test '
                + 'with the boundary cases listed above.',
            check: { kind: 'tests', minTotal: 1, allPass: true, label: 'Run Tests — the middle case passes' },
        },
        {
            id: 'audit',
            title: 'Inspect the head-removal branch',
            body:
                'Here\'s the AI\'s head case:\n'
                + '```\nif (prev == nullptr) {\n    head = curr->next;  // removing the head: advance past it\n    return;\n}\n```\n'
                + 'Looks plausible. Now read the **signature**:\n'
                + '```\nvoid removeValue(Node* head, int value)\n```\n'
                + '`head` is a parameter passed **by value**. As with the earlier int, '
                + 'pointer, and struct examples, assigning to a *copy of the head '
                + 'pointer* changes only that local copy. The caller\'s `head` remains '
                + 'unchanged when the function returns.\n\n'
                + 'Prediction: removing the head will silently do **nothing**. '
                + 'Verify that prediction with a test.',
            check: { kind: 'manual' },
        },
        {
            id: 'head-test',
            title: 'Write the test the AI skipped',
            body:
                'Add the head-removal case to the tests:\n'
                + '```\nSTUDENT_TEST("removes the head") {\n'
                + '    Node* list = nullptr;\n'
                + '    list = pushFront(list, 12);\n'
                + '    list = pushFront(list, 7);\n'
                + '    removeValue(list, 7);\n'
                + '    EXPECT_EQUALS(length(list), 1);\n'
                + '    EXPECT_EQUALS(list->value, 12);\n}\n```\n'
                + 'Press **Tests**.',
            check: { kind: 'tests', minTotal: 2, minFailed: 1, label: 'Run Tests — the head case fails' },
            successNote: 'The length is still 2 and the head is still 7, confirming that the caller was not updated.',
        },
        {
            id: 'reproduce',
            title: 'Make the demo hit the bug',
            body:
                'Make `main` remove the **head** instead of '
                + 'the middle — change the call to:\n'
                + '```\nremoveValue(head, 7);\n```\n'
                + 'and **Run**. The "After" line still shows all three nodes.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'removeValue\\(head, 7\\)', label: 'Change main to remove the head (7)' },
                    { kind: 'stdout', includes: 'After:  7 -> 3 -> 12 -> x', label: 'Run it — the list is untouched' },
                ],
            },
        },
        {
            id: 'watch',
            title: 'Inspect the copied head pointer',
            body:
                'Set a **breakpoint** on the head-branch line:\n'
                + '```\nhead = curr->next;\n```\n'
                + 'press **Debug**, and open the **Graph** tab. Paused there you can '
                + 'see it: `main`\'s `head` arrow AND `removeValue`\'s own `head` '
                + 'arrow — **two separate pointers** aiming at node `[7]`.\n\n'
                + 'Press **Step Over** (`F10`): the *local* `head` hops to `[3]`... '
                + 'and `main`\'s `head` does not move. When the function returns, its '
                + 'local pointer is discarded.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'head = curr->next;', label: 'Breakpoint on the head-branch line' },
                    { kind: 'paused', func: 'removeValue', label: 'Pause inside removeValue()' },
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over — only the LOCAL head moves' },
                ],
            },
            hint: 'The breakpoint goes on the line inside "if (prev == nullptr)". Debug pauses there because main now removes the head.',
        },
        {
            id: 'fix',
            title: 'Node*& — a reference to a pointer',
            body:
                'The function needs the caller\'s **actual head pointer**, not a copy '
                + 'of it. You know the spelling by now — one `&`:\n'
                + '```\nvoid removeValue(Node*& head, int value) {\n```\n'
                + 'Read `Node*&` inside-out: "a **reference to** a pointer-to-Node." '
                + 'Now `head = curr->next;` re-aims the *caller\'s* head. While '
                + 'editing that branch, also release the unlinked node, which the original '
                + 'code never deleted:\n'
                + '```\nif (prev == nullptr) {\n    Node* victim = curr;\n'
                + '    head = curr->next;\n    delete victim;\n    return;\n}\n```\n'
                + 'Press **Tests**: both green. And notice — neither the call site '
                + 'nor your test changed. Reference syntax appears in the function '
                + 'signature rather than at each call site.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'removeValue\\(Node\\*&', label: 'Take head as Node*& (reference to pointer)' },
                    { kind: 'code', matches: 'delete (curr|victim);[\\s\\S]*delete (curr|victim);', label: 'Delete the unlinked head node too' },
                    { kind: 'tests', minTotal: 2, allPass: true, label: 'Re-run Tests: all green' },
                ],
            },
            hint: 'Change the signature (add & after Node*), fix the head branch to delete the node, then run the beaker.',
            successNote: 'Same call syntax, new contract — and the head case finally works.',
        },
        {
            id: 'verify-demo',
            title: 'Run the corrected demo',
            body:
                'Press **Run**. Removing 7 — the head — now yields '
                + '`After:  3 -> 12 -> x`.',
            check: { kind: 'stdout', includes: 'After:  3 -> 12 -> x', label: 'Run it — the head is truly gone' },
        },
        {
            id: 'armor',
            title: 'Add the remaining boundary tests',
            body:
                'Two cases remain untested. Add both:\n'
                + '```\nSTUDENT_TEST("a missing value changes nothing") {\n'
                + '    Node* list = nullptr;\n'
                + '    list = pushFront(list, 12);\n'
                + '    list = pushFront(list, 7);\n'
                + '    removeValue(list, 99);\n'
                + '    EXPECT_EQUALS(length(list), 2);\n}\n\n'
                + 'STUDENT_TEST("removing from the empty list is safe") {\n'
                + '    Node* list = nullptr;\n'
                + '    removeValue(list, 5);\n'
                + '    EXPECT_EQUALS(length(list), 0);\n}\n```\n'
                + 'Press **Tests**. The four tests now cover the middle, head, '
                + 'missing-value, and empty-list cases.',
            check: { kind: 'tests', minTotal: 4, allPass: true, label: 'Four tests, all passing' },
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- Removal = **rewire the inbound arrow**, then delete the node\n'
                + '- The **prev/curr traversal**: curr searches while prev follows\n'
                + '- Review middle, tail, head, missing, and empty-list cases\n'
                + '- Pass-by-value\'s final form: a copied **head pointer** makes '
                + 'head-updates vanish; `Node*&` hands over the real one\n'
                + '- Tests cover the boundary cases so later changes can be checked\n\n'
                + 'The final lesson applies these pointer and testing skills to '
                + 'reversing a linked list.',
            check: { kind: 'manual' },
        },
    ],
}
