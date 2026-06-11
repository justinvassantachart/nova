import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ program that plans pizzas for a party:
//  7 guests, 3 slices per guest, 8 slices per pizza. Make sure
//  we order enough pizza for everyone."
//
//  Assistant: "I compute the slices needed, divide by slices per
//  pizza to get the order, and verify the order covers everyone.
//  The math guarantees nobody goes hungry."
// ----------------------------------------------------------------

int main() {
    int guests = 7;
    int slicesPerGuest = 3;
    int slicesPerPizza = 8;

    int slicesNeeded = guests * slicesPerGuest;
    int pizzasToOrder = slicesNeeded / slicesPerPizza;
    int slicesAvailable = pizzasToOrder * slicesPerPizza;

    std::cout << "Guests: " << guests << "\\n";
    std::cout << "Slices needed: " << slicesNeeded << "\\n";
    std::cout << "Pizzas to order: " << pizzasToOrder << "\\n";

    if (slicesAvailable >= slicesNeeded) {
        std::cout << "Everyone is fed!\\n";
    } else {
        std::cout << "Only " << slicesAvailable
                  << " slices -- somebody goes hungry.\\n";
    }
    return 0;
}
`

export const typesAndVariables: Lesson = {
    id: 'types-and-variables',
    slug: 'types-and-variables',
    title: 'Types & Variables',
    tagline: 'In Python the value had a type. In C++ the variable does — and division reads the types, not your mind.',
    description:
        'C++ makes you declare what every variable holds, and in exchange the compiler guards your code '
        + 'like a bouncer. Learn the core types, then debug an AI pizza planner whose flawless-looking '
        + 'division quietly starves a party — because integers don\'t do fractions.',
    minutes: 12,
    tags: ['C++ basics', 'types', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'type-on-the-variable',
            title: 'Where the type lives',
            body:
                'In Python this is legal:\n'
                + '```\nx = 7\nx = "seven"\n```\n'
                + 'The *value* has a type; the name `x` will point at anything. C++ moves '
                + 'the type onto the **variable itself**:\n'
                + '```\nint x = 7;\n```\n'
                + 'Read it as: "`x` is a box shaped for an `int`, starting at 7." The box '
                + 'keeps that shape forever — `x = "seven"` won\'t compile.\n\n'
                + 'What you get for the ceremony: the compiler checks every single use of '
                + '`x` before the program runs, and the program never wastes time asking '
                + '"what type is this?" while running. Declare once, checked everywhere.',
            check: { kind: 'manual' },
        },
        {
            id: 'type-table',
            title: 'The starter set of types',
            body:
                'Five types cover most beginner C++:\n'
                + '- `int` — whole numbers: `int guests = 7;`\n'
                + '- `double` — decimal numbers: `double price = 4.50;`\n'
                + '- `bool` — `true` / `false` (lowercase, unlike Python!)\n'
                + '- `char` — one character, in **single** quotes: `char grade = \'A\';`\n'
                + '- `std::string` — text, in **double** quotes: '
                + '`std::string name = "Nova";` (needs `#include <string>`)\n\n'
                + 'Mind the literals — these are four *different* things to C++: `3` '
                + '(int), `3.0` (double), `\'3\'` (char), `"3"` (string). Python blurred '
                + 'those lines; C++ never does.',
            check: { kind: 'manual' },
        },
        {
            id: 'guardrail',
            title: 'Feel the guardrail',
            body:
                'Prove the compiler is watching. Add this line right after the `guests` '
                + 'declaration:\n'
                + '```\nguests = "seven";\n```\n'
                + 'Press **Run** and read the error: it refuses to put a string into an '
                + '`int`-shaped box. Python would have happily rebound the name and let '
                + 'the crash happen later, somewhere far from the mistake.\n\n'
                + 'Now **delete the line** — you\'ll need a working program in a moment.',
            check: { kind: 'event', event: 'compile_error', label: 'Try assigning "seven" to an int — read the error' },
            hint: 'Add the line, Run, read the message, then remove the line again.',
            successNote: 'The compiler caught it at the exact line of the mistake — before the program existed.',
        },
        {
            id: 'run',
            title: 'Run the pizza planner',
            body:
                'Remove your experiment (if you haven\'t), then **Run** the AI\'s party '
                + 'planner and read the terminal.\n\n'
                + '7 guests × 3 slices = 21 slices needed. The AI promised "the math '
                + 'guarantees nobody goes hungry."',
            check: { kind: 'stdout', includes: 'somebody goes hungry', label: 'Run it — somebody goes hungry' },
            successNote: 'The math "guaranteed" it. The terminal disagrees.',
        },
        {
            id: 'read-output',
            title: 'Numbers don\'t lie',
            body:
                'The output: 21 slices needed, but **2 pizzas** ordered — that\'s 16 '
                + 'slices. Five slices short.\n\n'
                + '21 ÷ 8 = 2.625, and you can\'t order 0.625 of a pizza, so the right '
                + 'order is **3**. Somewhere, 2.625 became 2. The suspect line:\n'
                + '```\nint pizzasToOrder = slicesNeeded / slicesPerPizza;\n```\n'
                + 'Let\'s catch it in the act instead of theorizing.',
            check: { kind: 'manual' },
        },
        {
            id: 'breakpoint-debug',
            title: 'Pause at the division',
            body:
                'Set a **breakpoint** on the division line (click left of its line '
                + 'number), then press **Debug**.\n\n'
                + 'The program freezes with the division *about to happen*. Check the '
                + 'Variables panel: `slicesNeeded` is 21, `slicesPerPizza` is 8 — the '
                + 'inputs are perfect. Whatever goes wrong, goes wrong on this line.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'slicesNeeded / slicesPerPizza', label: 'Breakpoint on the division line' },
                    { kind: 'paused', anchor: 'slicesNeeded / slicesPerPizza', label: 'Debug until you pause there' },
                ],
            },
            hint: 'Click just left of the line number for the red dot, then the Debug button (bug icon).',
        },
        {
            id: 'step-over',
            title: 'Watch 2.625 become 2',
            body:
                'Press **Step Over** (`F10`) once and watch `pizzasToOrder` get its '
                + 'value.\n\n'
                + '21 ÷ 8 = 2.625... so what landed in the box?',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over the division (F10)' },
                    { kind: 'variable', name: 'pizzasToOrder', equals: '2', label: 'See pizzasToOrder become 2' },
                ],
            },
            successNote: '2, not 2.625 — and not even 3. The fraction was thrown away, not rounded.',
        },
        {
            id: 'diagnose',
            title: 'Integer division: the rule',
            body:
                'When **both** sides of `/` are `int`s, C++ does *integer division*: it '
                + 'keeps the whole part and **discards the remainder**. `21 / 8` is `2`. '
                + 'No rounding, no warning.\n\n'
                + 'In Python terms: C++\'s `/` on two ints behaves like Python\'s `//`. '
                + 'Python\'s true-division (`21 / 8 == 2.625`) only happens in C++ when at '
                + 'least one side is a `double` — `21.0 / 8` is `2.625`.\n\n'
                + 'Notice what decided the behavior: **the types of the operands**, not '
                + 'the values, not the variable receiving the result. Types aren\'t '
                + 'paperwork; they choose what the math *means*.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix it — order enough pizza',
            body:
                'We don\'t want 2.625 pizzas; we want to **round up**. The classic '
                + 'integer trick — add "one pizza\'s worth minus one slice" before '
                + 'dividing:\n'
                + '```\nint pizzasToOrder =\n    (slicesNeeded + slicesPerPizza - 1) / slicesPerPizza;\n```\n'
                + '`(21 + 7) / 8 = 3`. Exact multiples stay exact: `(24 + 7) / 8 = 3`.\n\n'
                + 'Apply the fix (that one, or your own), keep the party at 7 guests, and '
                + '**Run**.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'stdout', includes: 'Slices needed: 21', label: 'Keep 7 guests × 3 slices (21 needed)' },
                    { kind: 'stdout', includes: 'Everyone is fed!', label: 'Run it: everyone is fed' },
                ],
            },
            hint: 'Feed everyone by fixing the division, not by shrinking the party. Stop the debugger first if it is still paused.',
            successNote: 'Three pizzas. Everyone is fed. 🍕',
        },
        {
            id: 'predict',
            title: 'Predict, then verify',
            body:
                'A quick scientist\'s rep: with your fix in place, set `guests = 8;` — '
                + 'that\'s 24 slices, exactly 3 pizzas, zero leftover.\n\n'
                + '**Predict the two output lines first**, then Run and check yourself. '
                + 'This habit — predict, run, compare — is debugging\'s beating heart, '
                + 'and you\'ll use it in every lesson from here on.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'stdout', includes: 'Guests: 8', label: 'Set guests = 8 and run' },
                    { kind: 'stdout', includes: 'Everyone is fed!', label: 'Exactly 3 pizzas still feeds everyone' },
                ],
            },
            successNote: 'Prediction confirmed. (24 + 7) / 8 = 3 — the ceiling trick doesn\'t over-order.',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- Types live on **variables**, declared once, checked by the compiler '
                + 'everywhere\n'
                + '- The starter five: `int`, `double`, `bool`, `char`, `std::string` — '
                + 'and the four faces of "3"\n'
                + '- `int / int` **truncates** — C++\'s `/` is Python\'s `//` when both '
                + 'sides are whole\n'
                + '- The ceiling trick: `(a + b - 1) / b`\n'
                + '- Predict → run → compare\n\n'
                + 'Next: functions — where C++ quietly *copies* your arguments, and an AI '
                + 'swap function that swears it swapped.',
            check: { kind: 'manual' },
        },
    ],
}
