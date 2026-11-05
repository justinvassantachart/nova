import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Simulate five rounds of a game in C++. Each round,
//  allocate a fresh score box on the heap for that round's score
//  and print it. Keep memory tidy."
//
//  Assistant: "makeScoreBox allocates each round's score with
//  new, and main deletes the box when the game ends -- memory
//  stays tidy, exactly as requested."
// ----------------------------------------------------------------

int* makeScoreBox(int score) {
    return new int(score);
}

int main() {
    int* current = nullptr;

    for (int round = 1; round <= 5; round++) {
        current = makeScoreBox(round * 100);
        std::cout << "Round " << round << " score: " << *current << "\\n";
    }

    std::cout << "Final score: " << *current << "\\n";
    delete current;
    return 0;
}
`

export const newAndDelete: Lesson = {
    id: 'new-and-delete',
    slug: 'new-and-delete',
    title: 'Heap Allocation',
    tagline: 'Heap allocation, new, delete, and memory leaks.',
    description:
        'Learn the difference between stack and heap lifetimes, use new and delete, and inspect a memory '
        + 'leak that does not affect the program\'s output.',
    minutes: 12,
    tags: ['heap', 'memory graph', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'lifetimes',
            title: 'Stack and heap lifetimes',
            body:
                'Every variable you\'ve made so far lives on the **stack**: born at its '
                + 'declaration, dead at its closing `}`. Automatic, free, and the reason '
                + 'lesson 3\'s copies vanished when the function returned.\n\n'
                + 'In Python, objects lived as long as *something referenced them* — a '
                + '**garbage collector** swept up the rest while you weren\'t looking.\n\n'
                + 'C++ also provides the **heap**, where allocation and cleanup are explicit:\n'
                + '- **you** allocate a box (`new`)\n'
                + '- the box ignores every closing brace and **outlives the function '
                + 'that made it**\n'
                + '- **you** end its life (`delete`) — there is no collector\n\n'
                + 'Why want this? Data whose lifetime *shouldn\'t* follow the call stack '
                + '— like the nodes of a linked list that must survive long after '
                + '`pushFront` returns. The heap is where next lesson\'s structures '
                + 'live. This lesson introduces that lifetime model.',
            check: { kind: 'manual' },
        },
        {
            id: 'syntax',
            title: 'new, delete, and the one rule',
            body:
                '```\nint* p = new int(42);   // allocate a heap box holding 42; p aims at it\n'
                + '*p += 1;                // use it like any pointee\ndelete p;               // free the BOX (p itself still exists)\n```\n'
                + '- `new int(42)` allocates a heap box and returns its **address** '
                + '— which is why pointers had to come first\n'
                + '- `delete p` frees **the box p points at**, not the pointer variable\n'
                + '- `delete nullptr` is defined to do nothing — a safe no-op you can '
                + 'rely on\n'
                + '- after `delete p`, the pointer **dangles**: following it is undefined '
                + 'behavior\n\n'
                + 'The one rule of ownership: **every `new` is matched by exactly one '
                + '`delete`.** Zero deletes cause a leak; deleting the same allocation '
                + 'twice can corrupt memory.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the score tracker',
            body:
                'Read `main.cpp` — each round allocates a fresh score box; the AI says '
                + '"memory stays tidy." Press **Run**.\n\n'
                + 'Five rounds print, the final score is 500, and there is a `delete` '
                + 'at the end. The output alone does not reveal the leak.',
            check: { kind: 'stdout', includes: 'Final score: 500', label: 'Run it — the output is perfect' },
            successNote: 'The output is correct, but stdout does not show whether memory was released.',
        },
        {
            id: 'stakeout',
            title: 'Inspect the allocation',
            body:
                'The output checks the scores, but it does not tell us whether each '
                + 'allocation was released. Use the **memory graph** to follow '
                + '`current`, then review the `new` and `delete` calls to reason '
                + 'about ownership. The graph shows readable referenced objects; '
                + 'it cannot inventory unreachable allocations or prove liveness.\n\n'
                + 'Set a **breakpoint** on the allocation line:\n'
                + '```\ncurrent = makeScoreBox(round * 100);\n```\n'
                + 'press **Debug**, and open the **Graph** tab. First pause, round 1: '
                + '`current` is null in the stack frame, so there is no referenced '
                + 'score box yet.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'current = makeScoreBox(round * 100);', label: 'Breakpoint on the allocation line' },
                    { kind: 'paused', anchor: 'current = makeScoreBox(round * 100);', label: 'Pause there (round 1)' },
                    { kind: 'right-tab', tab: 'graph', label: 'Open the Graph tab' },
                ],
            },
        },
        {
            id: 'watch-leak',
            title: 'Inspect repeated allocations',
            body:
                'Press **Continue** (`F5`) three times — each lap allocates one box and '
                + 'returns to your breakpoint. Watch `current`\'s target:\n'
                + '- after lap one: a box holding 100, `current`\'s arrow on it\n'
                + '- after lap two: a box holding 200\n'
                + '- after lap three: a box holding 300\n\n'
                + 'Earlier boxes disappear from this view when they are no longer '
                + 'referenced. Their disappearance does **not** mean they were freed. '
                + 'Every round re-aims `current` at a new box and loses access to the '
                + 'previous one without calling `delete`. That code is the evidence '
                + 'of a leak: the program can no longer delete the earlier allocations.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_continue', count: 3, label: 'Continue three times (one lap per round)' },
                    { kind: 'heap', minAllocations: 1, label: 'Inspect the current referenced score box' },
                ],
            },
            successNote: 'Reassigning current without delete loses access to the earlier allocations.',
        },
        {
            id: 'diagnose',
            title: 'The leak, diagnosed',
            body:
                'An unreachable object in Python can be garbage-collected. The same '
                + 'object in this C++ program remains allocated until the process exits. '
                + 'Five rounds leak four boxes. In a long-running program, repeated '
                + 'leaks can eventually exhaust available memory. The program\'s '
                + 'output can still be correct while this happens.\n\n'
                + 'The AI did write a `delete` — one, at the end, for the final box. '
                + 'There are five `new` calls and one `delete`, leaving four allocations unreleased.\n\n'
                + 'The fix follows the rule: before re-aiming `current` at a new box, '
                + '**delete the one it\'s holding**.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Delete the previous allocation',
            body:
                'Add one line *inside the loop*, just **before** the allocation:\n'
                + '```\ndelete current;\ncurrent = makeScoreBox(round * 100);\n```\n'
                + 'Round 1 deletes `nullptr` — which you now know is a safe no-op '
                + '(that\'s why `current` starts as `nullptr` rather than garbage). '
                + 'Every later round frees the previous box first. The five '
                + 'allocations now have five matching deletes.',
            check: { kind: 'code', matches: 'delete current;[\\s\\S]*delete current;', label: 'Delete the old box inside the loop (keep the final delete too)' },
            hint: 'The new delete goes inside the for-loop, before makeScoreBox. The original delete after the loop stays — it frees the LAST box.',
            successNote: 'Each allocation now has one matching delete.',
        },
        {
            id: 'verify',
            title: 'Review the cleanup and run again',
            body:
                'Review the loop: `delete current` now runs before each new '
                + 'allocation, and the final `delete` releases the last box.\n\n'
                + 'Press **Debug** again and **Continue** through a few rounds. '
                + 'The graph shows one referenced score box in both versions; '
                + 'it cannot prove that an old allocation was released. Let it run '
                + 'to the end: the output is *identical* to the leaky version. '
                + 'Matching the `new` and `delete` calls explains the cleanup.',
            check: { kind: 'stdout', includes: 'Final score: 500', label: 'Run to the end after reviewing the cleanup' },
            hint: 'Continue (F5) until the program exits, or remove the breakpoint and Run.',
        },
        {
            id: 'dangling',
            title: 'Deleting too soon',
            body:
                'A leak comes from failing to delete an allocation. Another bug is deleting **too '
                + 'early** and using the box anyway:\n'
                + '```\ndelete current;\nstd::cout << *current;   // dangling: the box is gone\n```\n'
                + 'That might print garbage, might print the old value, might crash — '
                + 'undefined behavior, so results can vary between runs. A readable '
                + 'debugger value is not proof that an object is still alive.\n\n'
                + 'The ownership rule prevents both problems: every box '
                + 'has exactly one owner, the owner deletes it exactly once, and nobody '
                + 'touches it after. Modern C++ commonly automates ownership with '
                + 'destructors and smart pointers. `std::vector` also manages its own '
                + 'heap storage.',
            check: { kind: 'manual' },
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- **Stack** boxes die at `}`; **heap** boxes live until deleted — no '
                + 'garbage collector\n'
                + '- `new int(42)` returns an address; `delete p` frees the box; '
                + '`delete nullptr` is safely nothing\n'
                + '- **Every new: exactly one delete** — the ownership rule\n'
                + '- The **memory graph** follows readable references; it does not '
                + 'prove liveness or show unreachable allocations. Review `new` and '
                + '`delete` to reason about leaks\n'
                + '- Using a pointer after deletion is undefined behavior\n\n'
                + 'The next lesson introduces structs, which will later be combined '
                + 'with pointers and heap allocation to build a linked list.',
            check: { kind: 'manual' },
        },
    ],
}
