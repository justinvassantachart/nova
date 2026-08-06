import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ program that prints a receipt for a cafe
//  order: two lattes and one muffin, plus a 10% tip on the
//  subtotal."
//
//  Assistant: "Here is a clean, well-commented receipt program.
//  I compute the subtotal, the tip, and the total, then print
//  all three. I double-checked the subtotal myself: two lattes
//  and a muffin."
// ----------------------------------------------------------------

int main() {
    std::cout << "===== Debug Cafe =====\\n";

    double lattePrice = 4.50;
    double muffinPrice = 3.25;

    double subtotal = lattePrice + muffinPrice;
    double tip = subtotal * 0.10;
    double total = subtotal + tip;

    // Oops -- the order has TWO lattes. Recompute the subtotal.
    subtotal = 2 * lattePrice + muffinPrice;

    std::cout << "Subtotal: $" << subtotal << "\\n";
    std::cout << "Tip: $" << tip << "\\n";
    std::cout << "Total: $" << total << "\\n";
    return 0;
}
`

export const fromPythonToCpp: Lesson = {
    id: 'from-python-to-cpp',
    slug: 'from-python-to-cpp',
    title: 'Hello, C++',
    tagline: 'An introduction to C++ program structure, compilation, and basic debugging.',
    description:
        'Learn the structure of a C++ program, compile and run it, and use a breakpoint to find an '
        + 'incorrect calculation in a receipt program.',
    minutes: 14,
    tags: ['C++ basics', 'AI-generated code', 'debugger basics'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'welcome',
            title: 'From Python to C++',
            body:
                'If you have written Python, you already know variables, `if` statements, loops, and '
                + 'functions. C++ uses the same concepts with some different rules:\n'
                + '- Python **runs** your file top to bottom. C++ **compiles** it first: a '
                + 'program called the compiler translates your whole file into machine code '
                + 'before anything runs.\n'
                + '- Python finds many mistakes *while running*. The C++ compiler catches '
                + 'them *before* the program ever starts.\n'
                + '- Python guesses what kind of data a variable holds. C++ makes you say '
                + 'it. (That\'s the next lesson.)\n\n'
                + 'The **editor** on the left shows `main.cpp`, a cafe receipt '
                + 'program written by an AI assistant. The **Run** and **Debug** buttons '
                + 'are in the top-right toolbar, and the **terminal** at the bottom right shows '
                + 'output. Press **Next** to review the file.',
            check: { kind: 'manual' },
        },
        {
            id: 'anatomy',
            title: 'The structure of main.cpp',
            body:
                'Read the file top to bottom and compare each part with its Python equivalent:\n'
                + '- `#include <iostream>` ≈ `import` — pulls in the input/output library\n'
                + '- `int main() { ... }` — C++ has no "loose" top-level code. The program '
                + '*is* one function named `main`; running the program calls it.\n'
                + '- `{` curly braces `}` mark blocks — indentation is just for humans here\n'
                + '- every statement ends with a **semicolon** `;`\n'
                + '- `std::cout << x` ≈ `print(x)` — and `<<` chains: '
                + '`std::cout << "Total: " << total`\n'
                + '- `"\\n"` adds a newline\n'
                + '- `//` starts a comment, like `#`\n'
                + '- `return 0;` — `main` reports "exit code 0" = finished fine\n\n'
                + 'Everything between the braces is the body of `main`.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Compile and run',
            body:
                'Click **Run**. Two things happen behind that button:\n'
                + '1. The **compiler** translates `main.cpp` into machine code. (The first '
                + 'time, the compiler itself downloads into your browser — give it a '
                + 'moment.)\n'
                + '2. The compiled program runs, and its output lands in the terminal.\n\n'
                + 'Python normally runs source code directly. C++ uses the compilation step to '
                + 'produce the executable program and report many errors before it runs.',
            check: { kind: 'stdout', includes: 'Debug Cafe', label: 'Run the program (watch the terminal)' },
            hint: 'The green Run button is in the top-right toolbar. If it is greyed out, the compiler is still downloading.',
            successNote: 'The program compiled and ran.',
        },
        {
            id: 'break-it',
            title: 'Cause a compiler error',
            body:
                'Delete the **semicolon** at the '
                + 'end of this line:\n'
                + '```\ndouble muffinPrice = 3.25;\n```\n'
                + 'Then press **Run** and read the message in the terminal. It names the '
                + 'file, the line, and what it expected to find. In Python a typo like a '
                + 'missing `:` may fail while the file is running; in C++ the program does not '
                + 'start because compilation failed.',
            check: { kind: 'event', event: 'compile_error', label: 'Run with the semicolon missing — read the compile error' },
            hint: 'Remove just the ; at the end of the muffinPrice line, then press Run again.',
            successNote: 'The error identifies the file, line, and expected syntax.',
        },
        {
            id: 'fix-compile',
            title: 'Restore the semicolon',
            body:
                'Put the semicolon back and press **Run** — the receipt should print '
                + 'again.\n\n'
                + 'The normal workflow is **edit → compile → run**. Syntax errors are '
                + 'reported during the compile step.',
            check: { kind: 'stdout', includes: 'Debug Cafe', label: 'Restore the semicolon and run clean' },
        },
        {
            id: 'first-line',
            title: 'Write your first C++ statement',
            body:
                'Add one line of your own just **before** `return 0;`:\n'
                + '```\nstd::cout << "Thanks for visiting!\\n";\n'
                + '```\n'
                + 'Then **Run**. Note everything the line needs: `std::cout`, `<<`, double '
                + 'quotes, `\\n`, and a semicolon.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'Thanks for visiting', label: 'Add the cout line before return 0;' },
                    { kind: 'stdout', includes: 'Thanks for visiting!', label: 'Run it and see your line print' },
                ],
            },
            hint: 'The line goes inside main\'s braces, after the Total line and before return 0;.',
            successNote: 'The new statement compiled and printed its output.',
        },
        {
            id: 'briefing',
            title: 'Check the receipt output',
            body:
                'Look at the actual numbers:\n'
                + '- `Subtotal: $12.25` — two lattes (9.00) plus a muffin (3.25). **Correct.**\n'
                + '- `Tip: $0.775` — a 10% tip on $12.25 should be **$1.225**. Wrong.\n'
                + '- `Total: $8.525` — less than the subtotal, so it is also incorrect.\n\n'
                + 'The AI\'s note says it "double-checked the subtotal" — and the subtotal '
                + '*is* right. You can use a **debugger** to pause the program while it runs '
                + 'and inspect each variable\'s value at that point.',
            check: { kind: 'manual' },
        },
        {
            id: 'breakpoint',
            title: 'Set a breakpoint',
            body:
                'A **breakpoint** marks a line where the program should freeze. Find this '
                + 'line:\n'
                + '```\ndouble tip = subtotal * 0.10;\n```\n'
                + 'Click in the empty space just **left of its line number** — a red dot '
                + 'appears. (Clicking again removes it.)',
            check: { kind: 'breakpoint', anchor: 'double tip = subtotal * 0.10;' },
            hint: 'Hover just left of the line numbers; a faded red dot previews the spot. You can also put the cursor on the line and press F9.',
        },
        {
            id: 'debug',
            title: 'Pause at the breakpoint',
            body:
                'Click **Debug** (the bug icon next to Run). The program compiles, starts, '
                + 'and pauses at your breakpoint. The highlighted line has *not run yet*.',
            check: { kind: 'paused', anchor: 'double tip = subtotal * 0.10;' },
            hint: 'If it ran to the end without pausing, check the red dot is still there and press Debug again.',
            successNote: 'The program is paused at the selected line.',
        },
        {
            id: 'inspect',
            title: 'Inspect subtotal',
            body:
                'Open the **Variables** panel on the right and read `subtotal`.\n\n'
                + 'It says **7.75** — one latte plus one muffin. The receipt later printed '
                + '12.25.\n\n'
                + 'Both are true. The receipt printed the value `subtotal` held **later**; '
                + 'right now, at the tip line, it holds the earlier, wrong value. A '
                + 'variable isn\'t a formula that stays current — it\'s a box whose '
                + 'contents change over time. The debugger lets you read the box at any '
                + 'moment you choose.',
            check: { kind: 'variable', name: 'subtotal', equals: '7.75', label: 'See subtotal = 7.75 in the Variables panel' },
        },
        {
            id: 'step',
            title: 'Step through the calculation',
            body:
                'Use the step controls in the toolbar. **Step Over** (`F10`) executes one '
                + 'line and pauses again.\n\n'
                + 'Press it once: the tip line runs, and `tip` becomes **0.775** — 10% of '
                + 'the *stale* 7.75. Now scan down the file: the AI computes the correct '
                + 'subtotal **after** `tip` and `total` were already calculated.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Press Step Over (F10)' },
                    { kind: 'variable', name: 'tip', equals: '0.775', label: 'Watch tip become 0.775' },
                ],
            },
            hint: 'The toolbar appears near the top of the editor while paused. Step Over executes the current line without entering a called function.',
            successNote: 'tip = 0.775, computed from a subtotal that was corrected one line too late.',
        },
        {
            id: 'diagnose',
            title: 'Statements happen in order',
            body:
                'Here\'s the mental model, and it\'s the same one Python uses:\n\n'
                + '**Statements run in order.** `tip = subtotal * 0.10` doesn\'t '
                + 'create a relationship between tip and subtotal — it copies a number '
                + '*right now*. Changing `subtotal` afterwards changes nothing that was '
                + 'already computed. (If you\'ve used a spreadsheet, unlearn it: cells '
                + 'auto-update; variables don\'t.) The order of these statements determines '
                + 'which subtotal is used for each calculation.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix the receipt',
            body:
                'Make the subtotal correct **the first time**:\n'
                + '```\ndouble subtotal = 2 * lattePrice + muffinPrice;\n```\n'
                + 'and delete the too-late correction line below. Then **Run** and check '
                + 'the receipt: subtotal $12.25, tip $1.225, total $13.475.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'stdout', includes: 'Tip: $1.225', label: 'Tip is 10% of the real subtotal' },
                    { kind: 'stdout', includes: 'Total: $13.475', label: 'Total = subtotal + tip' },
                ],
            },
            hint: 'Fix the FIRST subtotal line (multiply the latte by 2) and remove the late "subtotal = ..." line near the prints. Stop the debugger first if it is still paused.',
            successNote: 'The subtotal, tip, and total are now calculated in the correct order.',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                'In this lesson you:\n'
                + '- read the **anatomy** of a C++ file — `#include`, `main`, braces, '
                + 'semicolons, `std::cout`\n'
                + '- saw the **compiler** catch a mistake before the program could run\n'
                + '- wrote your **first C++ statement**\n'
                + '- used a **breakpoint**, the **Variables panel**, and **Step Over** to '
                + 'find a calculation that used an earlier value\n\n'
                + 'The next lesson covers C++ types and integer division.',
            check: { kind: 'manual' },
        },
    ],
}
