import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// Computes n! (n factorial) by calling itself with a smaller n.
long factorial(int n) {
    if (n <= 1) {
        return 1;  // base case: the recursion stops here
    }
    long rest = factorial(n - 1);
    return n * rest;
}

int main() {
    int n = 5;
    std::cout << "Computing " << n << "!\\n";
    long result = factorial(n);
    std::cout << n << "! = " << result << "\\n";
    return 0;
}
`

export const functionsAndTheStack: Lesson = {
    id: 'functions-and-the-stack',
    slug: 'functions-and-the-stack',
    title: 'Functions & the Call Stack',
    tagline: 'Step into a recursive function and watch the call stack stack up — five frames deep.',
    description:
        'A factorial function calls itself five levels deep. Use Step Into, Step Out, and the call stack '
        + 'to see how every call gets its own private variables — and how they unwind in reverse.',
    minutes: 12,
    tags: ['debugger basics', 'call stack', 'recursion'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'welcome',
            title: 'Calls within calls',
            body:
                'When a function is called, the program drops a bookmark — *where to come '
                + 'back to* — plus a fresh set of local variables. That bundle is a **stack '
                + 'frame**, and frames pile up on the **call stack**.\n\n'
                + 'Recursion makes this vivid: `factorial(5)` calls `factorial(4)` calls '
                + '`factorial(3)`... each call is a *separate frame* with its **own** `n`.\n\n'
                + 'You\'re going to freeze the program at the bottom of that pile and look up.',
            check: { kind: 'manual' },
        },
        {
            id: 'breakpoint',
            title: 'Break before the plunge',
            body:
                'Set a breakpoint on the line in `main` where the recursion kicks off:\n'
                + '```\nlong result = factorial(n);\n```\n'
                + 'Click left of its line number until the red dot appears.',
            check: { kind: 'breakpoint', anchor: 'long result = factorial(n);' },
        },
        {
            id: 'debug',
            title: 'Pause at the edge',
            body:
                'Click **Debug**. The program pauses right before `factorial(5)` runs.\n\n'
                + 'Check the **Variables** panel: one frame, `main`, with `n = 5` and `result` '
                + 'not yet set.',
            check: { kind: 'paused', anchor: 'long result = factorial(n);' },
        },
        {
            id: 'step-into',
            title: 'Step INTO the call',
            body:
                'Last lesson you used Step Over, which treats a function call as one hop. '
                + 'This time press **Step Into** (`F11`) — it follows the call *inside*.\n\n'
                + 'You should land on the first line of `factorial`. The Variables panel now '
                + 'shows **two** frames: `factorial` on top of `main`.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_into', label: 'Press Step Into (F11)' },
                    { kind: 'paused', func: 'factorial', label: 'Land inside factorial()' },
                ],
            },
            hint: 'Step Into is the downward arrow in the floating debug toolbar, or F11 on the keyboard.',
        },
        {
            id: 'ride-down',
            title: 'Ride to the bottom',
            body:
                'You could press F11 all the way down, but there\'s a faster way: set a '
                + 'breakpoint on the **base case** —\n'
                + '```\nreturn 1;  // base case\n```\n'
                + '— then press **Continue** (`F5`). The debugger free-runs through every '
                + 'recursive call and stops only when `n` finally reaches 1.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'return 1;', label: 'Breakpoint on the `return 1;` line' },
                    { kind: 'paused', anchor: 'return 1;', label: 'Continue (F5) until you stop there' },
                ],
            },
            successNote: 'You are now five calls deep.',
        },
        {
            id: 'read-stack',
            title: 'Read the stack like a story',
            body:
                'Look at the **call stack** in the Variables panel — `factorial` appears '
                + '**five times**, with `main` waiting at the bottom:\n'
                + '- The *top* frame is where execution is right now (`n = 1`)\n'
                + '- Each frame below is a call still waiting for its answer\n\n'
                + 'Click through the frames and watch `n` change: 1, 2, 3, 4, 5. Five separate '
                + '`n`s, alive at the same time — that\'s the whole secret of recursion.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'call-stack', func: 'factorial', minCount: 5, label: 'Five factorial() frames on the stack' },
                    { kind: 'variable', name: 'n', equals: '1', label: 'The active frame\'s `n` is 1' },
                ],
            },
            hint: 'If you accidentally continued past the pause, just press Debug again — your breakpoints are still set.',
        },
        {
            id: 'step-out',
            title: 'Step OUT and watch it unwind',
            body:
                '**Step Out** (`⇧F11`) is the opposite of Step Into: finish the *current* '
                + 'function and pop back to its caller.\n\n'
                + 'Press it once — `factorial(1)` returns its 1 and you\'re back in '
                + '`factorial(2)`. Then press **Step Over** (`F10`) once so the assignment '
                + 'completes, and watch `rest` become 1.\n\n'
                + 'The stack is unwinding: each frame turns `n × rest` into the answer for '
                + 'the frame below.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_out', label: 'Press Step Out (⇧F11)' },
                    { kind: 'variable', name: 'rest', equals: '1', func: 'factorial', label: 'See `rest` become 1 in factorial(2)' },
                ],
            },
        },
        {
            id: 'finish',
            title: 'Unwind to the answer',
            body:
                'Remove the breakpoints if you like (click the red dots), or just press '
                + '**Continue** (`F5`) repeatedly* until the program finishes.\n\n'
                + 'Every remaining frame multiplies and returns: 1 → 2 → 6 → 24 → **120**.\n\n'
                + '*The base-case breakpoint only triggers once — recursion already passed it.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'program-exit', label: 'Run to the end' },
                    { kind: 'stdout', includes: '5! = 120', label: 'See 5! = 120 in the terminal' },
                ],
            },
        },
        {
            id: 'recap',
            title: 'Stack mastery',
            body:
                'You now own four kinds of motion:\n'
                + '- **Step Over** (`F10`) — next line, calls included\n'
                + '- **Step Into** (`F11`) — follow the call inside\n'
                + '- **Step Out** (`⇧F11`) — finish this function, pop back up\n'
                + '- **Continue** (`F5`) — free-run to the next breakpoint\n\n'
                + 'One more trick worth knowing: the two extra buttons in the floating toolbar '
                + 'are **replay** — they step *backwards* through states you\'ve already '
                + 'visited. Try them sometime.\n\n'
                + 'Next lesson, the training wheels come off: you\'ll debug code written by '
                + 'an **AI assistant**.',
            check: { kind: 'manual' },
        },
    ],
}
