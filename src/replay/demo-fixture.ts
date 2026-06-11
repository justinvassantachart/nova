// Synthetic but realistic session recordings for the dev-only replay demo
// page (and for eyeballing viewer changes without a Firebase backend).
// Mirrors the exact event vocabulary the IDE emits.

import type { ReplayEvent } from './types'

const STARTER = `#include <iostream>

int main() {
    int guests = 7;
    int slicesPerGuest = 3;
    int slicesPerPizza = 8;

    int slicesNeeded = guests * slicesPerGuest;
    int pizzasToOrder = slicesNeeded / slicesPerPizza;

    std::cout << "Slices needed: " << slicesNeeded << "\\n";
    std::cout << "Pizzas to order: " << pizzasToOrder << "\\n";
    return 0;
}
`

const FIXED = STARTER.replace(
  'int pizzasToOrder = slicesNeeded / slicesPerPizza;',
  'int pizzasToOrder = (slicesNeeded + slicesPerPizza - 1) / slicesPerPizza;',
)

export function demoEvents(): ReplayEvent[] {
  let t = Date.now() - 1000 * 60 * 18 // session "started" 18 minutes ago
  const out: ReplayEvent[] = []
  const push = (type: string, payload: Record<string, unknown>, gapMs = 1500, sessionId = 'demo-1') => {
    t += gapMs
    out.push({ type, payload, clientTs: t, sessionId })
  }

  push('session_start', { mode: 'student-work', files: { '/workspace/main.cpp': STARTER } }, 0)
  push('run', { debug: false }, 4000)
  push('terminal_stdout', { text: 'Slices needed: 21\n' }, 900)
  push('terminal_stdout', { text: 'Pizzas to order: 2\n' }, 60)
  push('program_exit', { code: 0 }, 300)

  // Student investigates: breakpoint + debug session with steps.
  push('breakpoint_toggle', { file: '/workspace/main.cpp', line: 9, on: true }, 9000)
  push('run', { debug: true }, 2500)
  push('debug_paused', { file: '/workspace/main.cpp', line: 9, func: 'main' }, 2200)
  push('debug_step_over', {}, 6000)
  push('debug_paused', { file: '/workspace/main.cpp', line: 11, func: 'main' }, 300)
  push('debug_step_over', {}, 2600)
  push('debug_paused', { file: '/workspace/main.cpp', line: 12, func: 'main' }, 280)
  push('terminal_stdout', { text: 'Slices needed: 21\n' }, 120)
  push('debug_continue', {}, 3400)
  push('terminal_stdout', { text: 'Pizzas to order: 2\n' }, 150)
  push('program_exit', { code: 0 }, 200)

  // The fix, typed over a few bursts.
  push('edit', {
    file: '/workspace/main.cpp',
    length: FIXED.length,
    content: STARTER.replace('slicesNeeded / slicesPerPizza;', '(slicesNeeded + slicesPerPizza - 1) / slicesPerPizza;'),
  }, 14000)
  push('edit', { file: '/workspace/main.cpp', length: FIXED.length, content: FIXED }, 1100)
  push('breakpoint_toggle', { file: '/workspace/main.cpp', line: 9, on: false }, 2600)
  push('run', { debug: false }, 1800)
  push('terminal_stdout', { text: 'Slices needed: 21\n' }, 800)
  push('terminal_stdout', { text: 'Pizzas to order: 3\n' }, 70)
  push('program_exit', { code: 0 }, 250)

  // A short second session later the same day: adds a tests file.
  let t2 = t + 1000 * 60 * 31
  const push2 = (type: string, payload: Record<string, unknown>, gapMs = 1500) => {
    t2 += gapMs
    out.push({ type, payload, clientTs: t2, sessionId: 'demo-2' })
  }
  push2('session_start', { mode: 'student-work', files: { '/workspace/main.cpp': FIXED } }, 0)
  push2('file_create', { path: '/workspace/tests.cpp', kind: 'file' }, 5000)
  push2('edit', {
    file: '/workspace/tests.cpp',
    length: 120,
    content: '#include "nova_test.h"\n\nSTUDENT_TEST("orders enough pizza") {\n    EXPECT_EQUALS((21 + 7) / 8, 3);\n}\n',
  }, 7000)
  push2('run_tests', {}, 2500)
  push2('program_exit', { code: 0 }, 1200)

  return out
}
