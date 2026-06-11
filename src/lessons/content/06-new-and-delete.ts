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
    title: 'The Heap: new & delete',
    tagline: 'Python\'s garbage collector retired. Watch an AI program leak four boxes while printing flawless output.',
    description:
        'Stack variables die at their closing brace; heap boxes live until YOU delete them — and Python\'s '
        + 'garbage collector isn\'t coming. Learn new and delete, then stake out an AI score tracker whose '
        + 'output is perfect while the memory graph fills with orphaned boxes no test could ever see.',
    minutes: 12,
    tags: ['heap', 'memory graph', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'lifetimes',
            title: 'Who decides when a box dies?',
            body:
                'Every variable you\'ve made so far lives on the **stack**: born at its '
                + 'declaration, dead at its closing `}`. Automatic, free, and the reason '
                + 'lesson 3\'s copies vanished when the function returned.\n\n'
                + 'In Python, objects lived as long as *something referenced them* — a '
                + '**garbage collector** swept up the rest while you weren\'t looking.\n\n'
                + 'C++\'s second region, the **heap**, takes the training wheels off:\n'
                + '- **you** allocate a box (`new`)\n'
                + '- the box ignores every closing brace and **outlives the function '
                + 'that made it**\n'
                + '- **you** end its life (`delete`) — there is no collector\n\n'
                + 'Why want this? Data whose lifetime *shouldn\'t* follow the call stack '
                + '— like the nodes of a linked list that must survive long after '
                + '`pushFront` returns. The heap is where next lesson\'s structures '
                + 'live; today you earn the keys.',
            check: { kind: 'manual' },
        },
        {
            id: 'syntax',
            title: 'new, delete, and the one rule',
            body:
                '```\nint* p = new int(42);   // allocate a heap box holding 42; p aims at it\n'
                + '*p += 1;                // use it like any pointee\ndelete p;               // free the BOX (p itself still exists)\n```\n'
                + '- `new int(42)` carves out a heap box and hands back its **address** '
                + '— which is why pointers had to come first\n'
                + '- `delete p` frees **the box p points at**, not the pointer variable\n'
                + '- `delete nullptr` is defined to do nothing — a safe no-op you can '
                + 'rely on\n'
                + '- after `delete p`, the arrow **dangles**: following it is undefined '
                + 'behavior\n\n'
                + 'The one rule of ownership: **every `new` is matched by exactly one '
                + '`delete`.** Zero deletes = a leak. Two = corruption. This ledger is '
                + 'now your job.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the score tracker',
            body:
                'Read `main.cpp` — each round allocates a fresh score box; the AI says '
                + '"memory stays tidy." Press **Run**.\n\n'
                + 'Five rounds print, the final score is 500, there\'s even a `delete` '
                + 'at the end. Output: flawless.',
            check: { kind: 'stdout', includes: 'Final score: 500', label: 'Run it — the output is perfect' },
            successNote: 'Perfect output. Which proves exactly nothing about memory — leaks are invisible in stdout.',
        },
        {
            id: 'stakeout',
            title: 'Stake out the allocation',
            body:
                'Here\'s the problem with leaks: no output shows them, and no '
                + '`EXPECT_EQUALS` can see them — tests check *answers*, and the answers '
                + 'are all correct. This is a job for the **memory graph**.\n\n'
                + 'Set a **breakpoint** on the allocation line:\n'
                + '```\ncurrent = makeScoreBox(round * 100);\n```\n'
                + 'press **Debug**, and open the **Graph** tab. First pause, round 1: '
                + 'stack frame on the left, and a **Heap** column — empty, for now.',
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
            title: 'Watch the orphans pile up',
            body:
                'Press **Continue** (`F5`) three times — each lap allocates one box and '
                + 'returns to your breakpoint. Watch the heap column:\n'
                + '- after lap one: a box holding 100, `current`\'s arrow on it\n'
                + '- after lap two: a box holding 200 with the arrow — and the **100 box '
                + 'still there, with no arrow at all**\n'
                + '- after lap three: three boxes, two of them unreachable\n\n'
                + 'Every round re-aims `current` at a new box and **abandons the old '
                + 'one**. Nothing points at the orphans; nothing can ever delete them.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_continue', count: 3, label: 'Continue three times (one lap per round)' },
                    { kind: 'heap', minAllocations: 3, label: 'See 3+ boxes in the heap column' },
                ],
            },
            successNote: 'Boxes with no inbound arrow: in Python, collector food. In C++, a permanent leak.',
        },
        {
            id: 'diagnose',
            title: 'The leak, diagnosed',
            body:
                'An unreachable object in Python gets garbage-collected. The same '
                + 'object in C++ just... sits there, rent-free, until the process dies. '
                + 'Five rounds leak four boxes; a server doing this per-request leaks '
                + 'until it falls over. And remember — the program\'s *answers* were '
                + 'perfect. Leaks don\'t fail tests; they fail 3 a.m. pager duty.\n\n'
                + 'The AI did write a `delete` — one, at the end, for the final box. '
                + 'The ledger says: five `new`s, one `delete`. Four unpaid debts.\n\n'
                + 'The fix follows the rule: before re-aiming `current` at a new box, '
                + '**delete the one it\'s holding**.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Pay the debt before taking a new box',
            body:
                'Add one line *inside the loop*, just **before** the allocation:\n'
                + '```\ndelete current;\ncurrent = makeScoreBox(round * 100);\n```\n'
                + 'Round 1 deletes `nullptr` — which you now know is a safe no-op '
                + '(that\'s why `current` starts as `nullptr` rather than garbage). '
                + 'Every later round frees the previous box first. Five news, five '
                + 'deletes: ledger balanced.',
            check: { kind: 'code', matches: 'delete current;[\\s\\S]*delete current;', label: 'Delete the old box inside the loop (keep the final delete too)' },
            hint: 'The new delete goes inside the for-loop, before makeScoreBox. The original delete after the loop stays — it frees the LAST box.',
            successNote: 'Every new now has its delete. The ledger balances.',
        },
        {
            id: 'verify',
            title: 'Verify with the graph',
            body:
                'Prove it: press **Debug** again (the breakpoint is still there) and '
                + '**Continue** through a few rounds watching the heap column.\n\n'
                + 'Now it\'s one box at a time — the old one vanishes the instant the '
                + 'debt is paid, then the new one appears. Let it run to the end: the '
                + 'output is *identical* to the leaky version. Only the graph knows the '
                + 'difference — remember that next time output "proves" a program '
                + 'correct.',
            check: { kind: 'stdout', includes: 'Final score: 500', label: 'Run to the end — same output, tidy memory' },
            hint: 'Continue (F5) until the program exits, or remove the breakpoint and Run.',
        },
        {
            id: 'dangling',
            title: 'The opposite sin: deleting too soon',
            body:
                'Leaks are forgetting to delete. The mirror-image bug is deleting **too '
                + 'early** and using the box anyway:\n'
                + '```\ndelete current;\nstd::cout << *current;   // dangling: the box is gone\n```\n'
                + 'That might print garbage, might print the old value, might crash — '
                + 'undefined behavior, the worst kind of bug *because* it\'s '
                + 'inconsistent.\n\n'
                + 'The discipline that prevents both sins is the same ledger: every box '
                + 'has exactly one owner, the owner deletes it exactly once, and nobody '
                + 'touches it after. (Grown-up C++ automates this ledger with '
                + 'destructors and smart pointers — `std::vector` was secretly doing '
                + 'heap bookkeeping for you all along. Appreciate it now?)',
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
                + '- **Every new: exactly one delete** — the ownership ledger\n'
                + '- Leaks are invisible to output *and* to tests; the **memory graph** '
                + 'is your leak detector\n'
                + '- Dangling pointers are the mirror-image sin\n\n'
                + 'You now hold every ingredient of a linked list: structs are next, '
                + 'then the chain itself.',
            check: { kind: 'manual' },
        },
    ],
}
