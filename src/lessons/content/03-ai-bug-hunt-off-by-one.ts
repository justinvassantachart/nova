import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Write a C++ function that returns the average of an
//  array of quiz scores."
//
//  Assistant: "This iterates over every score, sums them, and
//  divides by the count. I verified the logic on a few examples."
// ----------------------------------------------------------------
double averageScore(const int scores[], int count) {
    int total = 0;
    for (int i = 1; i < count; i++) {
        total += scores[i];
    }
    return static_cast<double>(total) / count;
}

int main() {
    int scores[] = {90, 80, 70, 100, 60};
    int count = 5;

    std::cout << "Scores:  90 80 70 100 60\\n";
    std::cout << "Average: " << averageScore(scores, count) << "\\n";
    std::cout << "Check by hand: (90+80+70+100+60) / 5 = 80\\n";
    return 0;
}
`

export const aiBugHuntOffByOne: Lesson = {
    id: 'ai-bug-hunt-off-by-one',
    slug: 'ai-bug-hunt-off-by-one',
    title: 'AI Bug Hunt: The Missing Element',
    tagline: 'An AI wrote a five-line average function. It compiles, it looks right, and it\'s wrong.',
    description:
        'Your AI assistant delivered an average-of-scores function with a confident explanation. '
        + 'The numbers disagree. Use the debugger to catch the classic mistake AI code makes most — '
        + 'and learn the verify-first workflow for reviewing generated code.',
    minutes: 12,
    tags: ['AI-generated code', 'loops', 'off-by-one'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'briefing',
            title: 'Your code review just arrived',
            body:
                'You asked an AI assistant for a function that averages quiz scores. It '
                + 'delivered `averageScore` — clean, idiomatic, confidently explained. '
                + 'Read it in the editor. It *looks* completely fine.\n\n'
                + 'Here\'s the thing about AI-generated code: it\'s fluent, it compiles, '
                + 'and when it\'s wrong it\'s wrong **quietly**. The skill you\'re building '
                + 'in this lesson isn\'t "spot the bug by staring" — it\'s **verify before '
                + 'you trust**, with the debugger as your lie detector.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Verify against ground truth',
            body:
                'The program already includes a ground truth: the average of 90, 80, 70, '
                + '100, 60 — by hand — is **80**.\n\n'
                + 'Click **Run** and compare.',
            check: { kind: 'stdout', includes: 'Average: 62', label: 'Run it and read the average' },
            successNote: 'It says 62. The hand calculation says 80. The AI\'s "verified logic" is off by 18 points.',
        },
        {
            id: 'hypothesize',
            title: 'Don\'t squint — instrument',
            body:
                'The function does two things: **sum** the scores, then **divide** by the '
                + 'count. One of them is lying. Two hypotheses:\n'
                + '- The sum is wrong (some score skipped or double-counted?)\n'
                + '- The division is wrong (wrong count? integer truncation again?)\n\n'
                + 'Last lesson\'s truncation bug might make you suspect the division — but '
                + 'notice the AI even used `static_cast<double>` correctly there. Don\'t '
                + 'guess. Watch the sum being built.',
            check: { kind: 'manual' },
        },
        {
            id: 'breakpoint',
            title: 'Break inside the loop',
            body:
                'Set a breakpoint on the line that accumulates the total:\n'
                + '```\ntotal += scores[i];\n```\n'
                + 'This pauses at **every iteration**, so you can watch the sum grow score '
                + 'by score.',
            check: { kind: 'breakpoint', anchor: 'total += scores[i];' },
        },
        {
            id: 'first-iteration',
            title: 'Interrogate the first iteration',
            body:
                'Click **Debug**. When it pauses, look at the Variables panel **before '
                + 'anything else runs**:\n'
                + '- What is `total`? (should be 0 — nothing added yet)\n'
                + '- What is `i`?\n\n'
                + 'The first score lives at `scores[0]`. So on the *first* trip through the '
                + 'loop, `i` should be...?',
            check: {
                kind: 'all',
                of: [
                    { kind: 'paused', func: 'averageScore', label: 'Pause inside averageScore()' },
                    { kind: 'variable', name: 'i', equals: '1', label: 'Read `i` at the first stop' },
                ],
            },
            hint: 'Press Debug and look at `i` in the Variables panel the moment it first pauses.',
            successNote: '`i` is 1 on the very first iteration. `scores[0]` — the 90 — is never added.',
        },
        {
            id: 'diagnosis',
            title: 'The off-by-one',
            body:
                'There it is. C++ arrays start at index **0**, but the AI\'s loop starts '
                + 'at **1**:\n'
                + '```\nfor (int i = 1; i < count; i++)\n```\n'
                + 'So the sum is 80+70+100+60 = 310, and 310 ÷ 5 = **62**. The division was '
                + 'innocent; the loop skipped the first element.\n\n'
                + 'This is the single most common class of bug in generated code: **boundary '
                + 'errors**. Models have seen loops that start at 0 and loops that start at 1 '
                + '(sums, 1-indexed pseudocode, off-by-design loops) and sometimes blend them. '
                + 'The code *pattern* looks plausible either way — only the *semantics* break.',
            check: { kind: 'manual' },
        },
        {
            id: 'fix',
            title: 'Fix and re-verify',
            body:
                'Make the loop start at the first element:\n'
                + '```\nfor (int i = 0; i < count; i++)\n```\n'
                + 'Then **Run** again and check the output against the hand calculation.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'for \\(int i = 0; i < count; i\\+\\+\\)', label: 'Start the loop at i = 0' },
                    { kind: 'stdout', includes: 'Average: 80', label: 'Run it: average is 80' },
                ],
            },
            successNote: '80 — matches ground truth. NOW the code has earned trust.',
        },
        {
            id: 'recap',
            title: 'The AI code review workflow',
            body:
                'What you just did generalizes to every piece of generated code you\'ll '
                + 'ever accept:\n'
                + '- **Establish ground truth** — a case where you know the right answer\n'
                + '- **Run and compare** — never assume; the explanation is not the code\n'
                + '- **Break inside the suspect region** — loops earn the first look\n'
                + '- **Interrogate the first and last iterations** — boundaries are where '
                + 'generated code fails most\n\n'
                + 'Next lesson: pointers. You\'ll *watch* a linked list grow on the heap, '
                + 'node by node, in the memory graph.',
            check: { kind: 'manual' },
        },
    ],
}
