import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// One node of a singly linked list: a value, and a pointer onward.
struct Node {
    int value;
    Node* next;
};

// Put a new value at the FRONT of the list; returns the new head.
Node* pushFront(Node* head, int value) {
    Node* node = new Node{value, head};
    return node;
}

// Add up every value in the list.
int sumList(Node* head) {
    int sum = 0;
    Node* current = head;
    while (current->next != nullptr) {
        sum += current->value;
        current = current->next;
    }
    return sum;
}

int main() {
    Node* head = nullptr;
    head = pushFront(head, 30);
    head = pushFront(head, 20);
    head = pushFront(head, 10);  // the list is now 10 -> 20 -> 30

    std::cout << "List: ";
    for (Node* p = head; p != nullptr; p = p->next) {
        std::cout << p->value << " ";
    }
    std::cout << "\\n";

    std::cout << "Sum:  " << sumList(head) << "\\n";  // expect 60
    return 0;
}
`

export const linkedListsLive: Lesson = {
    id: 'linked-lists-live',
    slug: 'linked-lists-live',
    title: 'Linked Lists, Live',
    tagline: 'Watch nodes appear on the heap and arrows snap between them — then catch a traversal bug.',
    description:
        'Linked lists finally make sense when you can see them. Build one node by node in the live memory '
        + 'graph, follow the next-pointers with your eyes, and hunt down a traversal loop that keeps '
        + 'losing the last node.',
    minutes: 15,
    tags: ['linked lists', 'pointers', 'memory graph'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'welcome',
            title: 'A list made of arrows',
            body:
                'An array is one solid block of memory. A **linked list** is the opposite: '
                + 'each value lives in its own little box (a `Node`) somewhere on the heap, '
                + 'and each box stores a pointer — `next` — to the box after it. The last '
                + 'box\'s `next` is `nullptr`: the end of the chain.\n\n'
                + 'Diagrams of this are fine. *Watching it actually happen* is better. '
                + 'This IDE has a live **memory graph** that draws every heap allocation '
                + 'and every pointer between them, updating as you step.\n\n'
                + 'The program builds the list 10 → 20 → 30 and sums it.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run it — and meet today\'s bug',
            body:
                'Click **Run**.\n\n'
                + 'The list prints `10 20 30`, so the list itself is fine. But the sum of '
                + '10 + 20 + 30 should be **60**...',
            check: { kind: 'stdout', includes: 'Sum:  30', label: 'Run it and read the sum' },
            successNote: 'Sum: 30. Half the list went missing somewhere. First, let\'s watch the list get built.',
        },
        {
            id: 'breakpoint-build',
            title: 'Pause mid-construction',
            body:
                'Set a breakpoint on the **third** push:\n'
                + '```\nhead = pushFront(head, 10);  // the list is now...\n```\n'
                + 'Then click **Debug**. The program pauses with two nodes already built '
                + 'and one to go.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'head = pushFront(head, 10);', label: 'Breakpoint on the third pushFront' },
                    { kind: 'paused', anchor: 'head = pushFront(head, 10);', label: 'Debug until you pause there' },
                ],
            },
        },
        {
            id: 'open-graph',
            title: 'Open the memory graph',
            body:
                'In the right panel, switch to the **Graph** tab.\n\n'
                + 'You should see two `Node` boxes on the heap — the 30 built first, then '
                + 'the 20 — with an arrow from the 20\'s `next` to the 30. `head` currently '
                + 'points at the 20.',
            check: { kind: 'right-tab', tab: 'graph' },
        },
        {
            id: 'step-build',
            title: 'Watch the third node arrive',
            body:
                'Press **Step Over** (`F10`) once to execute the `pushFront(head, 10)` line, '
                + 'eyes on the graph.\n\n'
                + 'A third box pops into existence holding 10, its arrow lands on the 20, '
                + 'and `head` jumps to point at it. That\'s the whole pushFront trick: the '
                + 'new node adopts the old head as its `next`.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over the pushFront call' },
                    { kind: 'heap', minAllocations: 3, label: 'Three nodes on the heap' },
                ],
            },
            successNote: '10 → 20 → 30, drawn live from real memory. No diagram — that\'s your actual heap.',
        },
        {
            id: 'read-graph',
            title: 'Read the chain',
            body:
                'Trace it with your eyes: `head` → box(10) → box(20) → box(30) → `nullptr`.\n\n'
                + 'Everything the program will ever know about this list is `head`. To '
                + 'visit the values it must hop the arrows one at a time — which is exactly '
                + 'what `sumList`\'s loop does. And somewhere in those hops, 30 points '
                + 'go missing.',
            check: { kind: 'manual' },
        },
        {
            id: 'hunt',
            title: 'Stake out the sum loop',
            body:
                'Set a second breakpoint inside `sumList`:\n'
                + '```\nsum += current->value;\n```\n'
                + 'Press **Continue** (`F5`) repeatedly and *count the stops*. At each stop '
                + 'check `current->value` in the Variables panel — which node is being '
                + 'added?\n\n'
                + 'Keep continuing until the program exits.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'sum += current->value;', label: 'Breakpoint on `sum += ...`' },
                    { kind: 'program-exit', label: 'Continue until the program exits' },
                ],
            },
            successNote: 'Two stops. The 10 and the 20 were added — the loop never visited the 30.',
        },
        {
            id: 'diagnosis',
            title: 'The condition that quits early',
            body:
                'Look at the loop\'s guard:\n'
                + '```\nwhile (current->next != nullptr)\n```\n'
                + 'It asks *"does this node have a successor?"* — but the **last** node\'s '
                + '`next` is `nullptr`, so the loop bails *before adding it*. The question '
                + 'it should ask is *"am I still on a node?"*:\n'
                + '```\nwhile (current != nullptr)\n```\n'
                + 'A one-word difference — `current` vs `current->next` — and the last '
                + 'element of every list silently disappears.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix the guard',
            body:
                'Change the condition in `sumList` to test `current` itself, then **Run** '
                + 'and confirm the sum.',
            check: {
                kind: 'all',
                of: [
                    {
                        kind: 'code',
                        matches: 'while \\((current != nullptr|nullptr != current|current)\\)',
                        label: 'Loop while `current != nullptr`',
                    },
                    { kind: 'stdout', includes: 'Sum:  60', label: 'Run it: sum is 60' },
                ],
            },
            successNote: '60. Every node counted.',
        },
        {
            id: 'recap',
            title: 'Bonus insight: the crash you also fixed',
            body:
                'One more thing — the original loop didn\'t just skip the last node. Call '
                + '`sumList(nullptr)` (an empty list) and `current->next` dereferences a '
                + 'null pointer: a crash. Your fixed guard handles the empty list for free.\n\n'
                + 'Two takeaways:\n'
                + '- Loop conditions on linked structures should test **the node**, not its successor\n'
                + '- The memory graph turns pointer code from imagination into observation\n\n'
                + 'Next: an AI assistant tries to **reverse** this exact kind of list. '
                + 'Its pointer dance is almost perfect. Almost.',
            check: { kind: 'manual' },
        },
    ],
}
