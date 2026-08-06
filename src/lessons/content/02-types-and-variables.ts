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
    title: 'Types and Variables',
    tagline: 'C++ variable types and the behavior of integer division.',
    description:
        'Learn how C++ variable declarations work, review common types, and correct a pizza calculation '
        + 'that uses integer division instead of rounding up.',
    minutes: 12,
    tags: ['C++ basics', 'types', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'type-on-the-variable',
            title: 'Declare a variable type',
            body:
                'In Python this is legal:\n'
                + '```\nx = 7\nx = "seven"\n```\n'
                + 'The *value* has a type; the name `x` will point at anything. C++ moves '
                + 'the type onto the **variable itself**:\n'
                + '```\nint x = 7;\n```\n'
                + 'This declares `x` as an `int` and gives it the initial value 7. Its type '
                + 'does not change, so `x = "seven"` will not compile.\n\n'
                + 'The compiler checks each use of `x` against its declared type before the '
                + 'program runs.',
            check: { kind: 'manual' },
        },
        {
            id: 'type-table',
            title: 'Common C++ types',
            body:
                'These five types are common in introductory C++:\n'
                + '- `int` — whole numbers: `int guests = 7;`\n'
                + '- `double` — decimal numbers: `double price = 4.50;`\n'
                + '- `bool` — `true` / `false` (lowercase, unlike Python!)\n'
                + '- `char` — one character, in **single** quotes: `char grade = \'A\';`\n'
                + '- `std::string` — text, in **double** quotes: '
                + '`std::string name = "Ada";` (needs `#include <string>`)\n\n'
                + 'These are four different values and types in C++: `3` (int), `3.0` '
                + '(double), `\'3\'` (char), and `"3"` (string).',
            check: { kind: 'manual' },
        },
        {
            id: 'guardrail',
            title: 'Cause a type error',
            body:
                'Add this line right after the `guests` '
                + 'declaration:\n'
                + '```\nguests = "seven";\n```\n'
                + 'Press **Run** and read the error. A string cannot be assigned to a '
                + 'variable declared as `int`.\n\n'
                + 'Now **delete the line** — you\'ll need a working program in a moment.',
            check: { kind: 'event', event: 'compile_error', label: 'Try assigning "seven" to an int — read the error' },
            hint: 'Add the line, Run, read the message, then remove the line again.',
            successNote: 'The compiler reports the type mismatch before running the program.',
        },
        {
            id: 'run',
            title: 'Run the pizza planner',
            body:
                'Remove the invalid assignment if it is still present, then **Run** the '
                + 'pizza planner and read the terminal.\n\n'
                + '7 guests × 3 slices = 21 slices needed.',
            check: { kind: 'stdout', includes: 'somebody goes hungry', label: 'Run it — somebody goes hungry' },
            successNote: 'The program orders only two pizzas, which provide 16 slices.',
        },
        {
            id: 'read-output',
            title: 'Inspect the result',
            body:
                'The output: 21 slices needed, but **2 pizzas** ordered — that\'s 16 '
                + 'slices. Five slices short.\n\n'
                + '21 ÷ 8 = 2.625, and you can\'t order 0.625 of a pizza, so the right '
                + 'order is **3**. The value 2.625 became 2 on this line:\n'
                + '```\nint pizzasToOrder = slicesNeeded / slicesPerPizza;\n```\n'
                + 'The next steps use the debugger to inspect this calculation.',
            check: { kind: 'manual' },
        },
        {
            id: 'breakpoint-debug',
            title: 'Pause at the division',
            body:
                'Set a **breakpoint** on the division line (click left of its line '
                + 'number), then press **Debug**.\n\n'
                + 'The program freezes with the division *about to happen*. Check the '
                + 'Variables panel: `slicesNeeded` is 21 and `slicesPerPizza` is 8. The '
                + 'inputs have the expected values.',
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
            title: 'Observe integer division',
            body:
                'Press **Step Over** (`F10`) once and watch `pizzasToOrder` get its '
                + 'value.\n\n'
                + 'Although 21 ÷ 8 is 2.625, `pizzasToOrder` receives an integer value.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over the division (F10)' },
                    { kind: 'variable', name: 'pizzasToOrder', equals: '2', label: 'See pizzasToOrder become 2' },
                ],
            },
            successNote: 'The fractional part is discarded, so the result is 2.',
        },
        {
            id: 'diagnose',
            title: 'Integer division',
            body:
                'When **both** sides of `/` are `int`s, C++ does *integer division*: it '
                + 'keeps the whole part and **discards the remainder**. `21 / 8` is `2`. '
                + 'No rounding, no warning.\n\n'
                + 'In Python terms: C++\'s `/` on two ints behaves like Python\'s `//`. '
                + 'Python\'s true-division (`21 / 8 == 2.625`) only happens in C++ when at '
                + 'least one side is a `double` — `21.0 / 8` is `2.625`.\n\n'
                + 'The types of the operands determine this behavior, not the type of '
                + 'the variable that receives the result.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Round up the pizza count',
            body:
                'The number of pizzas must **round up**. Add one less than the divisor before '
                + 'dividing:\n'
                + '```\nint pizzasToOrder =\n    (slicesNeeded + slicesPerPizza - 1) / slicesPerPizza;\n```\n'
                + '`(21 + 7) / 8 = 3`. Exact multiples stay exact: `(24 + 7) / 8 = 3`.\n\n'
                + 'Apply the fix, keep the value at 7 guests, and '
                + '**Run**.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'stdout', includes: 'Slices needed: 21', label: 'Keep 7 guests × 3 slices (21 needed)' },
                    { kind: 'stdout', includes: 'Everyone is fed!', label: 'Run it: everyone is fed' },
                ],
            },
            hint: 'Fix the division without changing the number of guests. Stop the debugger first if it is still paused.',
            successNote: 'The program now orders three pizzas.',
        },
        {
            id: 'predict',
            title: 'Test an exact multiple',
            body:
                'With your fix in place, set `guests = 8;` — '
                + 'that\'s 24 slices, exactly 3 pizzas, zero leftover.\n\n'
                + 'Predict the output, then run the program and compare the result.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'stdout', includes: 'Guests: 8', label: 'Set guests = 8 and run' },
                    { kind: 'stdout', includes: 'Everyone is fed!', label: 'Exactly 3 pizzas still feeds everyone' },
                ],
            },
            successNote: 'For 24 slices, the calculation still orders exactly three pizzas.',
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
                + 'The next lesson covers function arguments, copies, and references.',
            check: { kind: 'manual' },
        },
    ],
}
