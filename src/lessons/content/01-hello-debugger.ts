import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

int main() {
    int guests = 7;
    int slicesPerGuest = 3;
    int slicesPerPizza = 8;

    int slicesNeeded = guests * slicesPerGuest;
    int pizzasToOrder = slicesNeeded / slicesPerPizza;

    std::cout << "Guests:        " << guests << "\\n";
    std::cout << "Slices needed: " << slicesNeeded << "\\n";
    std::cout << "Pizzas:        " << pizzasToOrder << "\\n";

    if (pizzasToOrder * slicesPerPizza >= slicesNeeded) {
        std::cout << "Everyone is fed!\\n";
    } else {
        std::cout << "Uh oh -- somebody goes hungry!\\n";
    }
    return 0;
}
`

export const helloDebugger: Lesson = {
    id: 'hello-debugger',
    slug: 'hello-debugger',
    title: 'Hello, Debugger',
    tagline: 'Breakpoints, stepping, and watching variables — the moves every other lesson builds on.',
    description:
        'A pizza-ordering program insists everything is fine while someone goes hungry. '
        + 'Learn to pause a running program, look inside it, and catch the exact line where the math goes wrong.',
    minutes: 10,
    tags: ['debugger basics'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'welcome',
            title: 'Welcome to the debugger',
            body:
                'A **debugger** lets you freeze a running program and look inside it: '
                + 'every variable, every function call, mid-flight. No more guessing what '
                + 'the code *probably* did — you watch it do it.\n\n'
                + 'Your workspace, left to right:\n'
                + '- The **editor**, showing `main.cpp` — a program that orders pizza for a party\n'
                + '- The **Run** and **Debug** buttons in the top toolbar\n'
                + '- The **terminal** (bottom right), where output appears\n\n'
                + 'The first time you press Run, the C++ compiler downloads into your browser — '
                + 'give it a moment. Press **Next** to start.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the program',
            body:
                'Click **Run** in the toolbar and watch the terminal.\n\n'
                + 'The program plans a pizza order: 7 guests, 3 slices each, 8 slices per pizza.',
            check: { kind: 'stdout', includes: 'somebody goes hungry', label: 'Run the program (watch the terminal)' },
            hint: 'The green Run button is in the top-right toolbar. If it is greyed out, the compiler is still downloading.',
            successNote: 'It ran — and somebody goes hungry. Time to find out why.',
        },
        {
            id: 'read-output',
            title: 'Something is off',
            body:
                'Look at the output. The program needs **21 slices** (7 guests × 3 slices) '
                + 'but ordered only **2 pizzas** — that\'s 16 slices. Someone goes hungry.\n\n'
                + 'You *could* re-read the code until the bug jumps out. Instead, you\'ll do '
                + 'what professionals do: stop the program right where the decision happens '
                + 'and look at the numbers.',
            check: { kind: 'manual' },
        },
        {
            id: 'set-breakpoint',
            title: 'Set your first breakpoint',
            body:
                'A **breakpoint** marks a line where the debugger should pause.\n\n'
                + 'Find this line in the editor:\n'
                + '```\nint pizzasToOrder = slicesNeeded / slicesPerPizza;\n```\n'
                + 'Click in the empty space just **left of its line number** — a red dot appears. '
                + 'That\'s the breakpoint. (Clicking the dot again removes it.)',
            check: { kind: 'breakpoint', anchor: 'slicesNeeded / slicesPerPizza' },
            hint: 'Hover just left of the line numbers and a faded red dot previews where the breakpoint will land. You can also put the cursor on the line and press F9.',
        },
        {
            id: 'start-debugging',
            title: 'Start debugging',
            body:
                'Now click **Debug** (the bug icon next to Run).\n\n'
                + 'The program starts, reaches your breakpoint, and **freezes** — the line '
                + 'is highlighted and hasn\'t executed yet. The program is alive, just paused, '
                + 'waiting for you.',
            check: { kind: 'paused', anchor: 'slicesNeeded / slicesPerPizza' },
            hint: 'If the program ran to the end without pausing, make sure the red dot is still there, then press Debug again.',
            successNote: 'Paused. The program is frozen mid-thought.',
        },
        {
            id: 'inspect',
            title: 'Look inside',
            body:
                'Open the **Variables** panel on the right. There\'s `main`\'s stack frame with '
                + 'every local variable and its *current* value:\n'
                + '- `guests` is 7\n'
                + '- `slicesNeeded` is 21\n'
                + '- `pizzasToOrder` is garbage — its line hasn\'t run yet\n\n'
                + 'So far the math is right. The suspect is the line you\'re paused on.',
            check: { kind: 'manual' },
        },
        {
            id: 'step-over',
            title: 'Step over the division',
            body:
                'A small toolbar floated in: those are the step controls. **Step Over** (`F10`) '
                + 'executes exactly one line and pauses again.\n\n'
                + 'Press it once and watch `pizzasToOrder` get its value.\n\n'
                + '21 ÷ 8 = 2.625... so what does it say?',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Press Step Over (F10)' },
                    { kind: 'variable', name: 'pizzasToOrder', equals: '2', label: 'See `pizzasToOrder` become 2' },
                ],
            },
            hint: 'The floating toolbar appears near the top of the editor while paused. Step Over is the arrow hopping over a dot.',
            successNote: '2, not 2.625. Integer division in C++ throws away the remainder — it always rounds DOWN.',
        },
        {
            id: 'continue',
            title: 'Let it finish',
            body:
                'You found the bug: dividing two `int`s **truncates**. 21/8 is 2, and the '
                + 'leftover 5 slices\' worth of guests go hungry.\n\n'
                + 'Press **Continue** (`F5`) to let the program run to the end.',
            check: { kind: 'program-exit', label: 'Continue (F5) until the program exits' },
        },
        {
            id: 'fix',
            title: 'Fix it',
            body:
                'Make the program round **up** when slices don\'t divide evenly. The classic '
                + 'integer trick:\n'
                + '```\nint pizzasToOrder =\n    (slicesNeeded + slicesPerPizza - 1) / slicesPerPizza;\n```\n'
                + 'Apply a fix (that one, or your own), then **Run** again. Keep the party at '
                + '7 guests — feed everyone by fixing the math, not the guest list!',
            check: {
                kind: 'all',
                of: [
                    { kind: 'stdout', includes: 'Slices needed: 21', label: 'Keep 7 guests × 3 slices (21 needed)' },
                    { kind: 'stdout', includes: 'Everyone is fed!', label: 'Run it: everyone is fed' },
                ],
            },
            hint: 'Adding (divisor − 1) before dividing bumps any remainder up to the next whole pizza. `(21 + 7) / 8` = 3.',
            successNote: 'Three pizzas. Everyone is fed. 🍕',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                'In one session you used the entire core debugging loop:\n'
                + '- **Breakpoint** — pause where the interesting thing happens\n'
                + '- **Inspect** — read real values instead of guessing\n'
                + '- **Step** — execute one line at a time and watch the change\n'
                + '- **Continue** — run free until the next breakpoint\n\n'
                + 'Next up: what happens when functions call functions — and how to read the '
                + '**call stack** like a story.',
            check: { kind: 'manual' },
        },
    ],
}
