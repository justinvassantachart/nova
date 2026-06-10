import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

struct Node {
    int value;
    Node* next;
};

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ function that reverses a singly linked
//  list in place and returns the new head."
//
//  Assistant: "I walk the list once, flipping each node's next
//  pointer as I go, then hand back the new head. O(n) time,
//  O(1) extra space."
// ----------------------------------------------------------------
Node* reverseList(Node* head) {
    Node* prev = nullptr;
    Node* current = head;
    while (current != nullptr) {
        Node* next = current->next;  // save the rest of the list
        current->next = prev;        // flip this node's arrow
        prev = current;              // prev walks forward
        current = next;              // current walks forward
    }
    return head;  // return the new head of the list
}

void printList(const char* label, Node* head) {
    std::cout << label;
    for (Node* p = head; p != nullptr; p = p->next) {
        std::cout << p->value << " ";
    }
    std::cout << "\\n";
}

int main() {
    Node* head = new Node{1, nullptr};
    head->next = new Node{2, nullptr};
    head->next->next = new Node{3, nullptr};
    head->next->next->next = new Node{4, nullptr};

    printList("Before: ", head);
    head = reverseList(head);
    printList("After:  ", head);  // expect: 4 3 2 1
    return 0;
}
`

export const aiBugHuntReversal: Lesson = {
    id: 'ai-bug-hunt-reversal',
    slug: 'ai-bug-hunt-reversal',
    title: 'AI Bug Hunt: The Vanishing List',
    tagline: 'An AI reverses a linked list and three nodes disappear. The memory graph knows the truth.',
    description:
        'The AI\'s list-reversal is a textbook pointer dance with a confident O(n) explanation — and after '
        + 'running it, a four-node list prints as one. Watch the arrows flip live in the memory graph and '
        + 'catch the one line where the code stops matching its own comments.',
    minutes: 15,
    tags: ['AI-generated code', 'linked lists', 'pointers'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'briefing',
            title: 'The classic interview question',
            body:
                'Reversing a linked list **in place** is the classic pointer exercise: walk '
                + 'the list, flip every `next` arrow to point *backwards*, return the far '
                + 'end as the new head.\n\n'
                + 'Your AI assistant produced `reverseList`, complete with line-by-line '
                + 'comments and a complexity analysis. Read it in the editor — the comments '
                + 'narrate a perfect algorithm.\n\n'
                + 'You ran lesson 3\'s playbook once already, so you know the drill: '
                + 'explanations are not evidence.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run it',
            body:
                'Click **Run**. The list 1 → 2 → 3 → 4 goes in. What comes out?',
            check: { kind: 'stdout', matches: 'After:\\s+1\\s*$', label: 'Run it and read the After line' },
            successNote: '`After:  1`. Not reversed — decimated. Three nodes are just... gone.',
        },
        {
            id: 'theory',
            title: 'Gone, or just lost?',
            body:
                'Two very different failures could print that line:\n'
                + '- The nodes were **destroyed or corrupted** (memory bug)\n'
                + '- The nodes are fine but **nothing points at them** anymore (bookkeeping bug)\n\n'
                + 'Print statements can\'t tell these apart — `printList` only walks what '
                + '`head` can reach. The **memory graph** can: it shows every allocation '
                + 'that exists, reachable or not.',
            check: { kind: 'manual' },
        },
        {
            id: 'stakeout',
            title: 'Stake out the flip',
            body:
                'Set a breakpoint on the line that flips an arrow:\n'
                + '```\ncurrent->next = prev;\n```\n'
                + 'Click **Debug**, and when it pauses switch to the **Graph** tab.\n\n'
                + 'Feast your eyes: all four nodes, chained 1 → 2 → 3 → 4, with `current` '
                + 'parked on node 1 and `prev` empty.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'current->next = prev;', label: 'Breakpoint on the arrow-flip line' },
                    { kind: 'paused', func: 'reverseList', label: 'Debug until you pause inside reverseList()' },
                    { kind: 'right-tab', tab: 'graph', label: 'Open the Graph tab' },
                ],
            },
        },
        {
            id: 'watch-flips',
            title: 'Watch the arrows flip',
            body:
                'Before you continue: add a **second breakpoint** on\n'
                + '```\nreturn head;\n```\n'
                + 'so the function can\'t slip past you when the loop ends.\n\n'
                + 'Now press **Continue** (`F5`) a few times, watching the graph at each '
                + 'stop. One arrow flips per pass: first node 1\'s arrow turns around, then '
                + 'node 2\'s, then node 3\'s... For a moment the list is two chains facing '
                + 'opposite directions — that\'s the algorithm mid-stride, exactly as designed.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'return head;', label: 'Second breakpoint on `return head;`' },
                    { kind: 'event', event: 'debug_continue', count: 2, label: 'Continue through at least two flips' },
                ],
            },
        },
        {
            id: 'loop-done',
            title: 'The loop finishes — and the list IS reversed',
            body:
                'Keep pressing **Continue** until you land on the `return head;` line.\n\n'
                + 'Now read the graph carefully: 4 → 3 → 2 → 1. Every arrow flipped. **The '
                + 'algorithm worked perfectly.** All four nodes exist, fully chained, '
                + 'reversed exactly as promised.\n\n'
                + 'So why did the program print one element?',
            check: { kind: 'paused', anchor: 'return head;', label: 'Continue until you stop on `return head;`' },
            hint: 'If the program ran to completion, press Debug again — both breakpoints are still set, so Continue will carry you back here.',
        },
        {
            id: 'the-lie',
            title: 'Find the lie',
            body:
                'You\'re paused on the answer. Look at the Variables panel:\n'
                + '- `head` still points at node **1** — and node 1\'s `next` is now '
                + '`nullptr`, because flipping made it the **tail**\n'
                + '- `prev` points at node **4** — the far end the loop just finished '
                + 'walking to. *That* is the new head\n\n'
                + 'Now read the line you\'re paused on, comment and all:\n'
                + '```\nreturn head;  // return the new head of the list\n```\n'
                + 'The comment says "new head". The code returns the **old** one. '
                + '`printList` then faithfully walks from the old head — which, as the new '
                + 'tail, has nowhere to go. One element printed; three perfectly healthy '
                + 'nodes stranded behind a pointer nobody returned.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix the hand-off',
            body:
                'One word: return `prev`, not `head`. Then **Run** and watch the full '
                + 'reversal print.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'return prev;', label: 'Return `prev` from reverseList' },
                    { kind: 'stdout', matches: 'After:\\s+4 3 2 1', label: 'Run it: After: 4 3 2 1' },
                ],
            },
            successNote: '4 3 2 1. The algorithm was never broken — only the hand-off was.',
        },
        {
            id: 'recap',
            title: 'Comments are not contracts',
            body:
                'Today\'s specimen is the most dangerous kind of AI bug: **the algorithm '
                + 'was flawless and the narration was confident — the failure hid in the '
                + 'last line**, where the code stopped matching its own comments.\n\n'
                + 'What to keep:\n'
                + '- Read the code, not the comments — generated comments describe *intent*, '
                + 'not behavior\n'
                + '- When data "disappears", check whether it\'s destroyed or merely '
                + '**unreachable** — the memory graph sees what print statements can\'t\n'
                + '- Functions that *return* state deserve a breakpoint on the `return`\n\n'
                + 'Final lesson: you\'ll stop verifying by eyeball entirely and let a '
                + '**test suite** catch the AI red-handed.',
            check: { kind: 'manual' },
        },
    ],
}
