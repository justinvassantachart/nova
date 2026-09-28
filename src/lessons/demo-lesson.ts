import type { Lesson } from './types'

const MAIN_CPP = `#include <cstdio>

struct Node {
    int value;
    Node* next;
};

// This loop has a bug: the last node never contributes to the sum.
int sum(Node* head) {
    int total = 0;
    Node* current = head;
    while (current->next != nullptr) {
        total += current->value;
        current = current->next;
    }
    return total;
}

Node* makeList() {
    return new Node{10, new Node{20, new Node{30, nullptr}}};
}

void deleteList(Node* head) {
    while (head != nullptr) {
        Node* next = head->next;
        delete head;
        head = next;
    }
}

int main() {
    Node* head = makeList();
    int result = sum(head);
    std::printf("Sum: %d (expected 60)\\n", result);
    deleteList(head);
    return 0;
}
`

const TESTS_CPP = `#include "webide_test.h"

struct Node;
Node* makeList();
int sum(Node* head);
void deleteList(Node* head);

STUDENT_TEST("the sum includes every node") {
    Node* head = makeList();
    int result = sum(head);
    deleteList(head);
    EXPECT_EQUAL(result, 60);
}
`

// Separate from the ten-lesson curriculum: this short tour has its own
// workspace/progress namespace.
export const demoLesson: Lesson = {
    id: 'web-ide-guided-demo',
    slug: 'guided-demo',
    title: 'Find the missing node',
    tagline: 'A failing test, a linked list, and one small fix.',
    description: 'Use a test, the debugger, and the memory graph to find a linked-list traversal bug.',
    minutes: 4,
    tags: ['linked lists', 'memory graph', 'testing', 'debugger basics'],
    files: { 'main.cpp': MAIN_CPP, 'tests.cpp': TESTS_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'test',
            title: 'Start with a failing test',
            body:
                'This is a live C++ workspace. The program builds a list containing **10 → 20 → 30**, '
                + 'but its `sum` function misses a node.\n\n'
                + 'Click **Tests** in the top toolbar. The test in `tests.cpp` expects 60; '
                + 'the program returns 30.\n\n'
                + 'Compilation and execution happen in your browser. The first run downloads '
                + 'the tools and can take a little longer. No account is required.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests and see expected 60, actual 30' },
            hint: 'Wait until the engine is ready, then use the Tests button at the top of the IDE.',
            successNote: 'The test caught the bug. Next, inspect the running program.',
        },
        {
            id: 'inspect',
            title: 'See the list in memory',
            body:
                'Open `main.cpp`. Click just left of the line number beside:\n'
                + '```\ntotal += current->value;\n```\n'
                + 'The red dot is a **breakpoint**. Click **Debug**, then open the **Graph** tab '
                + 'on the right.\n\n'
                + 'Execution pauses before the highlighted line runs. Follow the pointers from '
                + '`head` and `current` through the three heap nodes. You can drag the graph and zoom.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'paused', anchor: 'total += current->value;', label: 'Pause at the addition in sum()' },
                    { kind: 'right-tab', tab: 'graph', label: 'Open the Graph tab' },
                    { kind: 'heap', minAllocations: 3, label: 'Inspect all three heap nodes' },
                ],
            },
            hint: 'Click the gutter beside the addition line, then Debug. A breakpoint pauses before executing its line.',
            successNote: 'The graph shows actual stack and heap state from this execution.',
        },
        {
            id: 'step',
            title: 'Watch a value change',
            body:
                'Click **Step Over** in the floating debugger toolbar (or press `F10`). '
                + 'The highlighted addition executes and `total` becomes **10**.\n\n'
                + 'Use the **Variables** tab or the stack frame in the graph to inspect `total`. '
                + 'The next highlighted line will move `current` to the second node.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over the addition' },
                    { kind: 'variable', name: 'total', equals: '10', func: 'sum', label: 'Inspect total = 10' },
                ],
            },
            hint: 'Step Over is the curved-arrow button in the floating toolbar. If you went too far, stop and Debug again.',
            successNote: 'You can inspect each change while the program is paused.',
        },
        {
            id: 'history',
            title: 'Look back one step',
            body:
                'Click **Step back in history** in the debugger toolbar. The earlier snapshot '
                + 'shows `total` before the addition. Then click **Step forward in history** '
                + 'to return to the live pause.\n\n'
                + 'History replays recorded snapshots of variables and memory. It does not '
                + 're-execute your program or undo terminal output.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_back', label: 'Inspect the previous snapshot' },
                    { kind: 'event', event: 'debug_step_forward', label: 'Return to the live pause' },
                ],
            },
            hint: 'The two history arrows sit between the stepping controls and Restart. Hover to see their labels.',
            successNote: 'You have compared two recorded states without running the program again.',
        },
        {
            id: 'fix',
            title: 'Include the last node',
            body:
                'Read the loop condition: `current->next != nullptr` asks whether there is '
                + 'a **next** node. When `current` reaches 30, that condition is false and '
                + 'the loop stops too early.\n\n'
                + 'Click **Stop**, then change the condition to test the current node:\n'
                + '```\nwhile (current != nullptr) {\n```\n'
                + 'Click **Tests** again. The same test should now pass.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'while\\s*\\(\\s*current\\s*!=\\s*nullptr\\s*\\)', label: 'Update the traversal condition' },
                    { kind: 'tests', minTotal: 1, allPass: true, label: 'Run Tests and get a passing result' },
                ],
            },
            hint: 'Remove ->next from the condition in sum(). Keep the current = current->next; line inside the loop.',
            successNote: 'All three values are included: 10 + 20 + 30 = 60.',
        },
        {
            id: 'finish',
            title: 'Keep exploring',
            body:
                'You used a failing test, a breakpoint, the memory graph, and recorded history '
                + 'to diagnose and fix a real C++ program.\n\n'
                + 'Keep editing this workspace, or explore the ten self-paced lessons. '
                + 'They progress from C++ basics through pointers, dynamic memory, and linked lists. '
                + 'Your demo edits and lesson progress are saved in this browser.',
            check: { kind: 'manual' },
        },
    ],
}
