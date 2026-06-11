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
    std::cout << "===== Nova Cafe =====\\n";

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
    tagline: 'You know Python. Meet the compiler, the anatomy of a C++ program, and your first AI-written bug.',
    description:
        'Your first C++ program is a cafe receipt written by an AI — and the total is wrong even though '
        + 'every line looks right. Learn how a C++ file is put together, what a compiler does, and how to '
        + 'freeze a running program to catch the exact moment the math goes stale.',
    minutes: 14,
    tags: ['C++ basics', 'AI-generated code', 'debugger basics'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'welcome',
            title: 'From Python to C++',
            body:
                'You\'ve written Python: variables, `if`s, loops, functions. **All of that '
                + 'knowledge transfers.** C++ asks the same questions — it just answers some '
                + 'of them differently:\n'
                + '- Python **runs** your file top to bottom. C++ **compiles** it first: a '
                + 'program called the compiler translates your whole file into machine code '
                + 'before anything runs.\n'
                + '- Python finds many mistakes *while running*. The C++ compiler catches '
                + 'them *before* the program ever starts.\n'
                + '- Python guesses what kind of data a variable holds. C++ makes you say '
                + 'it. (That\'s the next lesson.)\n\n'
                + 'Your workspace: the **editor** (left) shows `main.cpp` — a cafe receipt '
                + 'program written by an AI assistant. The **Run** and **Debug** buttons '
                + 'live in the top-right toolbar, and the **terminal** (bottom right) shows '
                + 'output. Press **Next** to dissect the file.',
            check: { kind: 'manual' },
        },
        {
            id: 'anatomy',
            title: 'The anatomy of main.cpp',
            body:
                'Read the file top to bottom and match each piece to its Python ancestor:\n'
                + '- `#include <iostream>` ≈ `import` — pulls in the input/output library\n'
                + '- `int main() { ... }` — C++ has no "loose" top-level code. The program '
                + '*is* one function named `main`; running the program calls it.\n'
                + '- `{` curly braces `}` mark blocks — indentation is just for humans here\n'
                + '- every statement ends with a **semicolon** `;`\n'
                + '- `std::cout << x` ≈ `print(x)` — and `<<` chains: '
                + '`std::cout << "Total: " << total`\n'
                + '- `"\\n"` is the newline `print()` added for free\n'
                + '- `//` starts a comment, like `#`\n'
                + '- `return 0;` — `main` reports "exit code 0" = finished fine\n\n'
                + 'That\'s the whole skeleton. Everything between the braces reads almost '
                + 'like Python with type names in front.',
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
                + 'Python skipped straight to step 2. The extra step buys you speed and an '
                + 'army of pre-flight checks — which you\'re about to meet.',
            check: { kind: 'stdout', includes: 'Nova Cafe', label: 'Run the program (watch the terminal)' },
            hint: 'The green Run button is in the top-right toolbar. If it is greyed out, the compiler is still downloading.',
            successNote: 'It compiled, then it ran. Hold that receipt — we\'ll come back to it.',
        },
        {
            id: 'break-it',
            title: 'Break it on purpose',
            body:
                'Time to meet the compiler\'s personality. Delete the **semicolon** at the '
                + 'end of this line:\n'
                + '```\ndouble muffinPrice = 3.25;\n```\n'
                + 'Then press **Run** and read the message in the terminal. It names the '
                + 'file, the line, and what it expected to find. In Python a typo like a '
                + 'missing `:` exploded *at runtime*; in C++ the program **never even '
                + 'started** — the compiler refused to build it.\n\n'
                + 'Compiler errors aren\'t punishment. They\'re a proofreader who works for '
                + 'free and reads everything before opening night.',
            check: { kind: 'event', event: 'compile_error', label: 'Run with the semicolon missing — read the compile error' },
            hint: 'Remove just the ; at the end of the muffinPrice line, then press Run again.',
            successNote: 'That message — file, line, expectation — is the compiler being helpful, not hostile.',
        },
        {
            id: 'fix-compile',
            title: 'Make it whole again',
            body:
                'Put the semicolon back and press **Run** — the receipt should print '
                + 'again.\n\n'
                + 'Get comfortable with this rhythm: **edit → compile → run**. You\'ll do '
                + 'it hundreds of times, and the compiler will catch most slips at the '
                + '"compile" beat, where they\'re cheapest to fix.',
            check: { kind: 'stdout', includes: 'Nova Cafe', label: 'Restore the semicolon and run clean' },
        },
        {
            id: 'first-line',
            title: 'Write your first C++ statement',
            body:
                'Add one line of your own just **before** `return 0;`:\n'
                + '```\nstd::cout << "Thanks for visiting!\\n";\n'
                + '```\n'
                + 'Then **Run**. Note everything the line needs: the `std::cout`, the '
                + '`<<`, the double quotes, the `\\n`, the semicolon. Congratulations — '
                + 'you write C++ now.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'Thanks for visiting', label: 'Add the cout line before return 0;' },
                    { kind: 'stdout', includes: 'Thanks for visiting!', label: 'Run it and see your line print' },
                ],
            },
            hint: 'The line goes inside main\'s braces, after the Total line and before return 0;.',
            successNote: 'One statement down. The other few million of your career will feel just like it.',
        },
        {
            id: 'briefing',
            title: 'Now read that receipt',
            body:
                'Look at the actual numbers:\n'
                + '- `Subtotal: $12.25` — two lattes (9.00) plus a muffin (3.25). **Correct.**\n'
                + '- `Tip: $0.775` — a 10% tip on $12.25 should be **$1.225**. Wrong.\n'
                + '- `Total: $8.525` — less than the subtotal?! Very wrong.\n\n'
                + 'The AI\'s note says it "double-checked the subtotal" — and the subtotal '
                + '*is* right. Yet the receipt is nonsense. In Python you might scatter '
                + '`print()` calls to investigate. C++ gives you something better: a '
                + '**debugger** that freezes the program mid-run and lets you read every '
                + 'variable\'s value at that exact moment.',
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
            title: 'Freeze the program',
            body:
                'Click **Debug** (the bug icon next to Run). The program compiles, starts, '
                + 'reaches your breakpoint, and **freezes** — the highlighted line has '
                + '*not run yet*. The program is alive, paused mid-thought, waiting for '
                + 'you.',
            check: { kind: 'paused', anchor: 'double tip = subtotal * 0.10;' },
            hint: 'If it ran to the end without pausing, check the red dot is still there and press Debug again.',
            successNote: 'Frozen. Time to look inside.',
        },
        {
            id: 'inspect',
            title: 'The smoking gun',
            body:
                'Open the **Variables** panel on the right and read `subtotal`.\n\n'
                + 'It says **7.75** — one latte plus one muffin. But the receipt *printed* '
                + '12.25!\n\n'
                + 'Both are true. The receipt printed the value `subtotal` held **later**; '
                + 'right now, at the tip line, it holds the earlier, wrong value. A '
                + 'variable isn\'t a formula that stays current — it\'s a box whose '
                + 'contents change over time. The debugger lets you read the box at any '
                + 'moment you choose.',
            check: { kind: 'variable', name: 'subtotal', equals: '7.75', label: 'See subtotal = 7.75 in the Variables panel' },
        },
        {
            id: 'step',
            title: 'Step and watch the damage',
            body:
                'A small toolbar floated in — those are the step controls. **Step Over** '
                + '(`F10`) executes exactly one line and freezes again.\n\n'
                + 'Press it once: the tip line runs, and `tip` becomes **0.775** — 10% of '
                + 'the *stale* 7.75. Now scan down the file: the AI computes the correct '
                + 'subtotal **after** `tip` and `total` were already locked in. The "fix" '
                + 'arrived after the numbers it needed to fix.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'event', event: 'debug_step_over', label: 'Press Step Over (F10)' },
                    { kind: 'variable', name: 'tip', equals: '0.775', label: 'Watch tip become 0.775' },
                ],
            },
            hint: 'The floating toolbar appears near the top of the editor while paused. Step Over is the arrow hopping over a dot.',
            successNote: 'tip = 0.775, computed from a subtotal that was corrected one line too late.',
        },
        {
            id: 'diagnose',
            title: 'Statements happen in order',
            body:
                'Here\'s the mental model, and it\'s the same one Python uses:\n\n'
                + '**A program is a sequence of moments.** `tip = subtotal * 0.10` doesn\'t '
                + 'create a relationship between tip and subtotal — it copies a number '
                + '*right now*. Changing `subtotal` afterwards changes nothing that was '
                + 'already computed. (If you\'ve used a spreadsheet, unlearn it: cells '
                + 'auto-update; variables don\'t.)\n\n'
                + 'The AI\'s code reads like a sensible essay — setup, computation, '
                + 'a correction, printing — and that\'s exactly why it *looked* right. '
                + 'Order is invisible when you skim.',
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
            successNote: 'A receipt you could hand to a customer. 🧾',
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                'In one sitting you:\n'
                + '- read the **anatomy** of a C++ file — `#include`, `main`, braces, '
                + 'semicolons, `std::cout`\n'
                + '- saw the **compiler** catch a mistake before the program could run\n'
                + '- wrote your **first C++ statement**\n'
                + '- used a **breakpoint**, the **Variables panel**, and **Step Over** to '
                + 'catch a value going stale — a bug that read perfectly fine on paper\n\n'
                + 'Next lesson: the biggest day-one difference from Python — **types** — '
                + 'and a pizza order that quietly starves a party guest.',
            check: { kind: 'manual' },
        },
    ],
}
