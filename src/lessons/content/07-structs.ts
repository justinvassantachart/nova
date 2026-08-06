import type { Lesson } from '../types'

const MAIN_CPP = `#include <iostream>
#include <string>
#include "nova_test.h"

// ----------------------------------------------------------------
//  WRITTEN BY AN AI ASSISTANT -- not yet reviewed by a human.
//
//  Prompt: "Define a Song struct for a music app (title, length
//  in seconds, play count), a function that registers one play,
//  and a function that formats a song for display."
//
//  Assistant: "Song bundles the three fields. addPlay bumps the
//  play count, and formatSong renders 'title [m:ss] -- N plays'.
//  The demo plays the anthem twice and prints it."
// ----------------------------------------------------------------

struct Song {
    std::string title;
    int seconds;
    int plays;
};

void addPlay(Song song) {
    song.plays = song.plays + 1;
}

std::string formatSong(const Song& song) {
    int minutes = song.seconds / 60;
    int leftover = song.seconds % 60;
    std::string result = song.title + " [" + std::to_string(minutes) + ":";
    if (leftover < 10) {
        result = result + "0";
    }
    result = result + std::to_string(leftover) + "] -- "
           + std::to_string(song.plays) + " plays";
    return result;
}

int main() {
    Song anthem = {"Cardinal Anthem", 210, 0};

    addPlay(anthem);
    addPlay(anthem);

    std::cout << formatSong(anthem) << "\\n";
    return 0;
}

// ---- Tests ---------------------------------------------------------
// Press the beaker (Tests) button to run these.

STUDENT_TEST("addPlay registers a play") {
    Song demo = {"Test Track", 90, 0};
    addPlay(demo);
    EXPECT_EQUALS(demo.plays, 1);
}
`

export const structsLesson: Lesson = {
    id: 'structs',
    slug: 'structs',
    title: 'Structs',
    tagline: 'Defining structs and passing them by value or reference.',
    description:
        'Define and initialize a C++ struct, access its fields, and compare passing a struct by value with '
        + 'passing it by reference. Use tests and the debugger to correct a function that changes only a copy.',
    minutes: 14,
    tags: ['structs', 'testing', 'AI-generated code'],
    files: { 'main.cpp': MAIN_CPP },
    primaryFile: 'main.cpp',
    steps: [
        {
            id: 'own-types',
            title: 'Define a struct',
            body:
                'In Python you bundled related data with a class:\n'
                + '```\nclass Song:\n    def __init__(self, title, seconds):\n'
                + '        self.title = title\n        self.seconds = seconds\n```\n'
                + 'The C++ starter version is a **struct** — fields only, types '
                + 'declared, no `__init__`, no `self`:\n'
                + '```\nstruct Song {\n    std::string title;\n    int seconds;\n'
                + '    int plays;\n};\n```\n'
                + 'Two syntax details matter:\n'
                + '- the **semicolon after the closing brace** is required\n'
                + '- field order matters for initialization, coming right up\n\n'
                + '`struct Song` defines a genuine new *type*: you can declare '
                + '`Song s;`, pass `Song` to functions, even make a '
                + '`std::vector<Song>`.',
            check: { kind: 'manual' },
        },
        {
            id: 'using-structs',
            title: 'Create, read, pass',
            body:
                'Creating one uses **brace initialization**, values in field order:\n'
                + '```\nSong anthem = {"Cardinal Anthem", 210, 0};\n```\n'
                + 'title, then seconds, then plays — the order in the struct. Reading '
                + 'and writing uses the dot, just like Python: `anthem.plays += 1;`\n\n'
                + 'Passing to functions — read these signatures with lesson-3 eyes:\n'
                + '- `void addPlay(Song song)` — takes a **copy** of the whole struct\n'
                + '- `std::string formatSong(const Song& song)` — borrows the real one, '
                + 'read-only\n\n'
                + 'The first signature cannot update the caller\'s Song because it '
                + 'receives a copy. Check the function before moving on.',
            check: { kind: 'manual' },
        },
        {
            id: 'run',
            title: 'Run the demo',
            body:
                'Press **Run**. The demo plays the anthem twice, then prints it.\n\n'
                + 'The format is `[3:30]`, with zero-padded seconds. The '
                + 'play count says **0 plays**. After two `addPlay` calls.',
            check: { kind: 'stdout', includes: '-- 0 plays', label: 'Run it — zero plays after two addPlay calls' },
        },
        {
            id: 'tests',
            title: 'Run the tests',
            body:
                'The test at the bottom of `main.cpp` makes one play and demands '
                + '`plays == 1`. Press **Tests**.',
            check: { kind: 'tests', minTotal: 1, minFailed: 1, label: 'Run Tests — expected 1, actual 0' },
            successNote: 'The test expected 1, but the caller\'s value remained 0.',
        },
        {
            id: 'predict',
            title: 'Diagnose pass-by-value',
            body:
                'You have seen the same pass-by-value behavior with ints that would not swap '
                + '(lesson 3), and a pointer that was itself a copy (lesson 5). Read '
                + 'the signature and predict the result **before** the debugger confirms '
                + 'it:\n'
                + '```\nvoid addPlay(Song song)\n```\n'
                + 'Python code often mutates an object through a shared reference. '
                + 'C++ structs are **values**: '
                + 'passing one copies the *entire struct*, string and all. The '
                + 'function changes the copy\'s counter; the copy is destroyed at `}`.\n\n'
                + 'Use the debugger to verify this behavior.',
            check: { kind: 'manual' },
        },
        {
            id: 'confirm',
            title: 'Inspect the copied struct',
            body:
                'Set a **breakpoint** on the increment:\n'
                + '```\nsong.plays = song.plays + 1;\n```\n'
                + 'and press **Debug**. While paused, look at the Variables panel: two '
                + 'frames, two complete Songs — `main`\'s `anthem` and `addPlay`\'s '
                + '`song`, each with its own title, seconds, plays. **Step Over** '
                + '(`F10`): the copy\'s `plays` becomes 1... and `anthem.plays` below '
                + 'stays 0. The function changed only its local copy.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'breakpoint', anchor: 'song.plays = song.plays + 1;', label: 'Breakpoint on the increment' },
                    { kind: 'paused', func: 'addPlay', label: 'Pause inside addPlay()' },
                    { kind: 'event', event: 'debug_step_over', label: 'Step Over and watch the copy change' },
                ],
            },
        },
        {
            id: 'fix',
            title: 'Pass the struct by reference',
            body:
                'Change the parameter to a reference:\n'
                + '```\nvoid addPlay(Song& song) {\n```\n'
                + '`Song&` — the caller\'s actual Song, under a new name. The body '
                + 'stays. Run **Tests** again.',
            check: {
                kind: 'all',
                of: [
                    { kind: 'code', matches: 'addPlay\\(Song\\s*&', label: 'Take the Song by reference' },
                    { kind: 'tests', minTotal: 1, allPass: true, label: 'Re-run Tests: green' },
                ],
            },
            successNote: 'The reference lets the function update the caller\'s Song.',
        },
        {
            id: 'verify',
            title: 'Verify the output',
            body: 'Press **Run** — the anthem now reports its two plays.',
            check: { kind: 'stdout', includes: '-- 2 plays', label: 'Run it — “-- 2 plays”' },
        },
        {
            id: 'default-init',
            title: 'Add default member initializers',
            body:
                'One more upgrade, this time to the *type*. If anyone writes '
                + '`Song s;` without braces, `seconds` and `plays` hold **garbage** — '
                + 'C++ doesn\'t zero plain fields. Give the struct **default member '
                + 'initializers**:\n'
                + '```\nstruct Song {\n    std::string title;\n    int seconds = 0;\n'
                + '    int plays = 0;\n};\n```\n'
                + 'Now every Song starts with defined numeric values, braces or not. (Brace initialization '
                + 'still overrides the defaults, so the existing code is unchanged.) '
                + 'Default member initializers reduce the chance of using '
                + 'uninitialized fields.',
            check: { kind: 'code', matches: 'int plays = 0;', label: 'Add default initializers to the struct' },
            hint: 'Edit the struct definition near the top: seconds = 0 and plays = 0.',
        },
        {
            id: 'your-test',
            title: 'Test the formatting',
            body:
                'Add a test for the zero-padding in `formatSong` (`[1:05]`, not `[1:5]`):\n'
                + '```\nSTUDENT_TEST("formatSong zero-pads the seconds") {\n'
                + '    Song jingle = {"Jingle", 65, 3};\n'
                + '    EXPECT_EQUALS(formatSong(jingle), "Jingle [1:05] -- 3 plays");\n}\n```\n'
                + 'Run **Tests** — two green.',
            check: { kind: 'tests', minTotal: 2, allPass: true, label: 'Two tests, all passing' },
        },
        {
            id: 'arrow-preview',
            title: 'Access fields through a pointer',
            body:
                'Structs meet pointers with one new spelling. Given '
                + '`Song* p = &anthem;`, reaching a field through the pointer is:\n'
                + '```\n(*p).title     // follow, then dot -- clunky\np->title       // the arrow: same thing, made for humans\n```\n'
                + '`->` means "follow the pointer, then access the field."\n\n'
                + 'Structs, pointers, and heap allocation can be combined by giving a '
                + 'struct a pointer **to its own type**. The next lesson uses that '
                + 'pattern to build a linked list.',
            check: { kind: 'manual' },
        },
        {
            id: 'recap',
            title: 'What you just learned',
            body:
                '- `struct` defines a real type: typed fields, brace init in field '
                + 'order, `.` access, and a required semicolon after `}`\n'
                + '- Structs are **values** — copied whole into functions unless the '
                + 'signature says `&`\n'
                + '- `const Song&` to borrow read-only; `Song&` to modify\n'
                + '- **Default member initializers** make a type safe by construction\n'
                + '- `p->field` follows a pointer to a field\n\n'
                + 'Next: use `struct Node` to build a linked list.',
            check: { kind: 'manual' },
        },
    ],
}
