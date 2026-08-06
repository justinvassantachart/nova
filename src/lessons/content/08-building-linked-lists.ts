import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Implement a linked list of ints in C++: add a value
//  at the front, print every value, and count the nodes."
//
//  Assistant: "Node carries a value and a pointer to the next
//  node. pushFront links a new node ahead of the current head,
//  printList walks the whole chain, and length counts by hopping
//  from node to node until it reaches the last one."
// ----------------------------------------------------------------

struct Node {
    int value;
    Node* next;
};

Node* pushFront(Node* head, int value) {
    Node* node = new Node{value, head};
    return node;
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
    Node* curr = head;
    while (curr->next != nullptr) {
        count++;
        curr = curr->next;
    }
    return count;
}

int main() {
    // Today's study playlist, by track number, newest first.
    Node* head = nullptr;
    head = pushFront(head, 14);
    head = pushFront(head, 8);
    head = pushFront(head, 23);

    printList(head);
    std::cout << "Length: " << length(head) << "\\n";
    return 0;
}
`

const TESTS_CPP = `#include "nova_test.h"

// Contracts for the code under test (defined in main.cpp). Tests
// never touch a Node's insides, so a bare "struct Node;" -- the
// type exists, layout elsewhere -- is all the compiler needs.
struct Node;
Node* pushFront(Node* head, int value);
int length(Node* head);

STUDENT_TEST("three pushes make a list of three") {
    Node* head = nullptr;
    head = pushFront(head, 14);
    head = pushFront(head, 8);
    head = pushFront(head, 23);
    EXPECT_EQUALS(length(head), 3);
}
`

export const buildingLinkedLists: Lesson = {
    id: 'building-linked-lists',
    slug: 'building-linked-lists',
    title: 'Building Linked Lists',
    tagline: 'Building and traversing a linked list.',
    description:
        'Build a linked list from heap-allocated nodes, inspect it in the memory graph, and use the standard '
        + 'traversal loop. Then correct an off-by-one error in the length function and add boundary tests.',
    minutes: 16,
    tags: ['linked lists', 'memory graph', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'why-lists',
            title: 'Why use linked nodes?',
            body:
                'A vector stores its elements in a contiguous sequence. Inserting at the '
                + '**front** requires moving the existing elements; Python\'s '
                + '`list.insert(0, x)` has the same cost.\n\n'
                + 'A **linked list** stores each value in a separate heap allocation '
                + 'called a **node**. Each node holds a value and a pointer to the next '
                + 'node:\n'
                + '```\nhead -> [23|*] -> [8|*] -> [14|x]\n```\n'
                + '`head` is a pointer to the first node; the last node\'s arrow is '
                + '`nullptr` (drawn as `x`). Inserting at the front requires one new '
                + 'node and one pointer update.\n\n'
                + 'A linked list does not provide direct indexed access. Reaching a '
                + 'later node requires traversing from the head.',
            check: { kind: 'manual' },
        },
        {
            id: 'the-node',
            title: 'The self-referential struct',
            body:
                'Here is the whole data structure:\n'
                + '```\nstruct Node {\n    int value;\n    Node* next;\n};\n```\n'
                + 'This struct contains a pointer **to its own type** and combines '
                + 'several concepts from earlier lessons:\n'
                + '- a **struct** bundles the fields (lesson 7)\n'
                + '- `Node*` is a **pointer**, an arrow to another node (lesson 5)\n'
                + '- nodes live on the **heap** via `new`, so they outlive every '
                + 'function (lesson 6)\n'
                + '- `nullptr` marks the end of the chain\n\n'
                + '`pushFront` allocates and initializes a node in one line:\n'
                + '```\nNode* node = new Node{value, head};\n```\n'
                + 'brace-init fills the fields in order — `value`, then '
                + '`next = ` *the old head*. `main` then updates the head pointer with '
                + '`head = pushFront(head, 23);`.',
            check: { kind: 'manual' },
        },
        {
            id: 'build-live',
            title: 'Inspect the first node',
            body:
                'Set a **breakpoint** on the '
                + 'second push:\n'
                + '```\nhead = pushFront(head, 8);\n```\n'
                + 'press **Debug**, and open the **Graph** tab.\n\n'
                + 'One heap box exists — `[14]`, with `head`\'s arrow on it and an `x` '
                + 'where its `next` aims at nothing.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'head = pushFront(head, 8);', label: 'Breakpoint on the second pushFront' },
                    { kind: 'paused', anchor: 'head = pushFront(head, 8);', label: 'Debug until you pause there' },
                    { kind: 'right-tab', tab: 'graph', label: 'Open the Graph tab' },
                ],
            },
        },
        {
            id: 'watch-grow',
            title: 'Inspect additional nodes',
            body:
                'Press **Step Over** (`F10`) and watch the graph: a second box '
                + 'appears — `[8]` — its arrow landing on `[14]`, and `head` hops to '
                + 'the new node. Step again past the third push: `[23] -> [8] -> [14]`.\n\n'
                + 'The graph shows the list as nodes connected by their `next` pointers.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over the pushes' },
                    { kind: 'heap', minAllocations: 2, label: 'See the chain reach 2+ nodes' },
                ],
            },
            successNote: 'The Graph tab now shows the nodes and the pointers between them.',
        },
        {
            id: 'traversal',
            title: 'The traversal loop',
            body:
                'Read `printList`:\n'
                + '```\nNode* curr = head;\nwhile (curr != nullptr) {\n'
                + '    std::cout << curr->value << " -> ";\n    curr = curr->next;\n}\n```\n'
                + 'This is the standard pattern: start a cursor at the head, process the '
                + 'current node, hop the arrow, stop at `nullptr`. Python\'s '
                + '`for x in lst` was doing exactly this for you, invisibly.\n\n'
                + 'The guard `while (curr != nullptr)` means "**while there is a '
                + 'node**".\n\n'
                + 'Press **Continue** (`F5`) and let the program finish. Compare the '
                + 'printed nodes with the reported length.',
            check: { kind: 'stdout', includes: 'Length: 2', label: 'Run to the end — three nodes print, Length says 2' },
            successNote: 'Three nodes were printed, but length reported 2.',
        },
        {
            id: 'tests',
            title: 'Test the claim',
            body:
                'Open `tests.cpp` — note the trick at the top: the tests never look '
                + 'inside a node, so a bare `struct Node;` declaration ("this type '
                + 'exists, layout elsewhere") plus the two function signatures is '
                + 'enough to compile against. Contracts, not internals.\n\n'
                + 'The test builds the same three-node list and demands '
                + '`length(head) == 3`. Press **Tests**.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests — expected 3, actual 2' },
        },
        {
            id: 'compare',
            title: 'Two loops, one character of difference',
            body:
                'Put the two loops side by side — `printList` walks **all three** '
                + 'nodes; `length` claims two:\n'
                + '```\nwhile (curr != nullptr)        // printList: "while there is a node"\n'
                + 'while (curr->next != nullptr)  // length:    "while there is a NEXT node"\n```\n'
                + 'The counter asks "does this node have a successor?" — so it '
                + 'counts every node *except the last*. The comment says '
                + '"hopping until it reaches the last one." It reaches the last node '
                + 'and forgets to count it.\n\n'
                + 'Comparing this loop with the working traversal in `printList` '
                + 'makes the difference clear.\n\n'
                + 'Also consider `length(nullptr)` for an empty list. Evaluating '
                + '`curr->next` when `curr` is `nullptr` is invalid. The same guard '
                + 'causes both the miscount and an empty-list crash.',
            check: { kind: 'manual' },
        },
        {
            id: 'confirm',
            title: 'Inspect the loop count',
            body:
                'Move your **breakpoint** to the counting '
                + 'line:\n'
                + '```\ncount++;\n```\n'
                + 'and press **Debug**. It pauses with `count` 0 (node 23), '
                + '**Continue** — pauses again, `count` 1 (node 8). **Step Over** to '
                + 'watch `count` become 2... then **Continue** once more: no third '
                + 'pause. The program ends. Node 14 was visited by the loop\'s *guard*, '
                + 'judged to have no successor, and never counted.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'paused', func: 'length', label: 'Pause inside length()' },
                    { kind: 'variable', name: 'count', equals: '2', func: 'length', label: 'Watch count top out at 2' },
                ],
            },
            hint: 'Remove the old breakpoint (click its red dot), add one on count++, then Debug. Use Continue between pauses and Step Over to execute the increment.',
        },
        {
            id: 'fix',
            title: 'Test the node, not its successor',
            body:
                'Make `length` use the real traversal guard:\n'
                + '```\nwhile (curr != nullptr) {\n```\n'
                + 'Then press **Tests** — green. (And notice the empty-list crash '
                + 'is fixed by the same edit: checking `curr` itself makes '
                + 'walking from `nullptr` safe.)',
            check: { kind: 'tests', minTotal: 1, allPass: true, label: 'Re-run Tests: green' },
            successNote: 'The loop now visits all three nodes.',
        },
        {
            id: 'armor',
            title: 'Test boundary cases',
            body:
                'Lock in both boundaries with two more tests in `tests.cpp`:\n'
                + '```\nSTUDENT_TEST("a single node has length 1") {\n'
                + '    EXPECT_EQUALS(length(pushFront(nullptr, 42)), 1);\n}\n\n'
                + 'STUDENT_TEST("the empty list has length 0") {\n'
                + '    EXPECT_EQUALS(length(nullptr), 0);\n}\n```\n'
                + 'Run **Tests** — three green. The empty-list test would have '
                + 'crashed before the fix and now prevents that case from regressing.',
            check: { kind: 'tests', minTotal: 3, allPass: true, label: 'Three tests, all passing' },
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- A linked list is heap boxes chained by arrows: '
                + '`struct Node { int value; Node* next; };`\n'
                + '- `new Node{value, head}` builds *and wires* a node in one '
                + 'expression\n'
                + '- The traversal pattern: cursor at head, hop `curr = curr->next`, '
                + 'guard `while (curr != nullptr)`\n'
                + '- "Is there a node?" vs "is there a next?" — one character, two '
                + 'bugs\n'
                + '- Forward-declared contracts (`struct Node;`) let tests compile '
                + 'against signatures alone\n\n'
                + 'Next: remove nodes by updating the links around them and handle '
                + 'the relevant boundary cases.',
            check: { kind: 'manual' },
        },
    ],
}
