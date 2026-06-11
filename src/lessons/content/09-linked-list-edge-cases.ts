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
    title: 'Linked Lists II: Edge-Case Surgery',
    tagline: 'Removing a node is surgery on live arrows. The AI handles the easy patient and loses the head.',
    description:
        'Unlinking a node means rewiring the arrow that leads into it — the famous prev/curr walk. The AI\'s '
        + 'removeValue aces the demo, passes its own test, and silently does NOTHING when asked to remove '
        + 'the head, because it moves a private copy of the head pointer. Take an edge-case census, write '
        + 'the test the AI skipped, watch the abandonment in the graph, and meet Node*& — a reference to a '
        + 'pointer.',
    minutes: 16,
    tags: ['linked lists', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'surgery',
            title: 'Removal is rewiring',
            body:
                'To remove `[3]` from this chain:\n'
                + '```\nhead -> [7|*] -> [3|*] -> [12|x]\n```\n'
                + 'you make the arrow that *enters* `[3]` skip over it:\n'
                + '```\nhead -> [7|*] ---------> [12|x]      then: delete the [3] node\n```\n'
                + 'So you need a pointer to the node **before** the victim. Hence the '
                + '**prev/curr walk** — read it in `removeValue`:\n'
                + '```\nwhile (curr != nullptr && curr->value != value) {\n'
                + '    prev = curr;\n    curr = curr->next;\n}\n```\n'
                + '`curr` hunts; `prev` trails one step behind. When `curr` lands on '
                + 'the victim, `prev->next = curr->next;` performs the bypass, and '
                + '`delete curr;` settles the heap ledger from lesson 6.',
            check: { kind: 'manual' },
        },
        {
            id: 'census',
            title: 'The edge-case census',
            body:
                'Linked-list surgery has a standard list of patients, and you should '
                + 'recite it before reviewing *any* list code — yours, a teammate\'s, '
                + 'or an AI\'s:\n'
                + '- remove a **middle** node — the comfy case\n'
                + '- remove the **tail** — does `curr->next` being null break the '
                + 'rewire?\n'
                + '- remove the **head** — there is **no prev**! Who rewires `head` '
                + 'itself?\n'
                + '- remove a **missing value** — must change nothing\n'
                + '- remove from the **empty list** — must survive\n\n'
                + 'The AI\'s note says "Handle every case" and "I tested removing a '
                + 'middle value." One of those sentences is load-bearing. Audit time.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the demo (the comfy case)',
            body:
                'Press **Run**. The demo removes 3 — a middle node — from '
                + '`7 -> 3 -> 12`.',
            check: { kind: 'stdout', includes: 'After:  7 -> 12 -> x', label: 'Run it — the middle removal works' },
            successNote: 'Flawless... on the one case the AI admits to testing.',
        },
        {
            id: 'provided-test',
            title: 'Its own test agrees',
            body:
                'The test at the bottom of `main.cpp` checks the same middle '
                + 'removal — length 2, then both survivors in order, reached with '
                + 'lesson 7\'s arrow: `list->next->value`. Press **Tests**: green.\n\n'
                + 'A green suite tells you the *covered* cases work. Glance back at '
                + 'the census: which patient has no test?',
            check: { kind: 'tests', minTotal: 1, allPass: true, label: 'Run Tests — the middle case passes' },
        },
        {
            id: 'audit',
            title: 'Read the head branch like a prosecutor',
            body:
                'Here\'s the AI\'s head case:\n'
                + '```\nif (prev == nullptr) {\n    head = curr->next;  // removing the head: advance past it\n    return;\n}\n```\n'
                + 'Looks plausible. Now read the **signature**:\n'
                + '```\nvoid removeValue(Node* head, int value)\n```\n'
                + '`head` is a parameter — passed **by value**. You have diagnosed '
                + 'this disease for an int (lesson 3), a pointer (lesson 5), and a '
                + 'struct (lesson 7). Final form: assigning to a *copy of the head '
                + 'pointer* re-aims the copy, the copy dies at `}`, and the caller\'s '
                + '`head` never hears about any of it.\n\n'
                + 'Prediction: removing the head will silently do **nothing**. '
                + 'Prove it with a test.',
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
            successNote: 'Length still 2, head still 7. The "handled" head case is a no-op, exactly as predicted.',
        },
        {
            id: 'reproduce',
            title: 'Make the demo hit the bug',
            body:
                'Now catch it red-handed. Make `main` remove the **head** instead of '
                + 'the middle — change the call to:\n'
                + '```\nremoveValue(head, 7);\n```\n'
                + 'and **Run**: the "After" line still shows all three nodes. The '
                + 'smallest reproduction, on screen.',
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
            title: 'Watch the abandonment',
            body:
                'Set a **breakpoint** on the head-branch line:\n'
                + '```\nhead = curr->next;\n```\n'
                + 'press **Debug**, and open the **Graph** tab. Paused there you can '
                + 'see it: `main`\'s `head` arrow AND `removeValue`\'s own `head` '
                + 'arrow — **two separate pointers** aiming at node `[7]`.\n\n'
                + 'Press **Step Over** (`F10`): the *local* `head` hops to `[3]`... '
                + 'and `main`\'s `head` doesn\'t move. The function then returns, its '
                + 'frame evaporates, and with it the only pointer that knew about the '
                + 'removal.',
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
                + 'you\'re in that branch, settle the ledger too — the AI never '
                + 'deleted the unlinked node:\n'
                + '```\nif (prev == nullptr) {\n    Node* victim = curr;\n'
                + '    head = curr->next;\n    delete victim;\n    return;\n}\n```\n'
                + 'Press **Tests**: both green. And notice — neither the call site '
                + 'nor your test changed. References are invisible where they\'re '
                + 'used; **the signature is the only witness**. That\'s why you read '
                + 'signatures first.',
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
            title: 'The demo, healed',
            body:
                'Press **Run**. Removing 7 — the head — now yields '
                + '`After:  3 -> 12 -> x`.',
            check: { kind: 'stdout', includes: 'After:  3 -> 12 -> x', label: 'Run it — the head is truly gone' },
        },
        {
            id: 'armor',
            title: 'Finish the census',
            body:
                'Two patients remain untested. Add both:\n'
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
                + 'Press **Tests** — four green. The census is fully armed: anyone '
                + 'who touches `removeValue` after you answers to all five cases.',
            check: { kind: 'tests', minTotal: 4, allPass: true, label: 'Four tests, all passing' },
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- Removal = **rewire the inbound arrow**, then delete the node\n'
                + '- The **prev/curr walk**: curr hunts, prev trails\n'
                + '- The **edge-case census**: middle, tail, head, missing, empty — '
                + 'recite it over any list code\n'
                + '- Pass-by-value\'s final form: a copied **head pointer** makes '
                + 'head-updates vanish; `Node*&` hands over the real one\n'
                + '- Tests pin every census case so the next editor can\'t regress '
                + 'them\n\n'
                + 'One lesson left: the capstone. The classic interview question, an '
                + 'AI solution that vaporizes two-thirds of the list, and you — with '
                + 'a full toolbox.',
            check: { kind: 'manual' },
        },
    ],
}
