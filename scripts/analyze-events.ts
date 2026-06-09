import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID env var.');
  process.exit(1);
}

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const credential = saPath
  ? cert(JSON.parse(readFileSync(saPath, 'utf8')))
  : applicationDefault();

initializeApp({ credential, projectId });
const db = getFirestore();

const DEBUG_TYPES = new Set([
  'compile_debug',
  'breakpoint_toggle',
  'debug_continue',
  'debug_step_over',
  'debug_step_into',
  'debug_step_out',
  'debug_step_back',
  'debug_step_forward',
]);

type EventDoc = {
  uid: string;
  type: string;
  sessionId: string;
  clientTs: number;
  assignmentId?: string | null;
};

async function main() {
  console.error(`Reading events/ from project "${projectId}"...`);
  const snap = await db.collection('events').get();
  console.error(`Fetched ${snap.size} events.`);

  const usersAll = new Set<string>();
  const usersDebug = new Set<string>();
  const usersBreakpoint = new Set<string>();
  const usersStepActions = new Set<string>();
  const usersTimeTravel = new Set<string>();
  const usersTests = new Set<string>();
  const usersCompiled = new Set<string>();

  const typeCounts: Record<string, number> = {};
  const compileByUser: Record<string, { ok: number; err: number }> = {};
  const sessionEvents: Record<
    string,
    { uid: string; min: number; max: number; n: number; edits: number; hadDebug: boolean }
  > = {};

  snap.forEach((doc) => {
    const e = doc.data() as EventDoc;
    if (!e.uid || !e.type) return;

    usersAll.add(e.uid);
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;

    if (DEBUG_TYPES.has(e.type)) usersDebug.add(e.uid);
    if (e.type === 'breakpoint_toggle') usersBreakpoint.add(e.uid);
    if (
      e.type === 'debug_step_over' ||
      e.type === 'debug_step_into' ||
      e.type === 'debug_step_out' ||
      e.type === 'debug_continue'
    )
      usersStepActions.add(e.uid);
    if (e.type === 'debug_step_back' || e.type === 'debug_step_forward')
      usersTimeTravel.add(e.uid);
    if (e.type === 'run_tests' || e.type === 'compile_test') usersTests.add(e.uid);

    if (e.type === 'compile' || e.type === 'compile_debug' || e.type === 'compile_test') {
      usersCompiled.add(e.uid);
      (compileByUser[e.uid] ??= { ok: 0, err: 0 }).ok += 1;
    } else if (e.type === 'compile_error') {
      (compileByUser[e.uid] ??= { ok: 0, err: 0 }).err += 1;
    }

    if (e.sessionId && typeof e.clientTs === 'number') {
      const s = (sessionEvents[e.sessionId] ??= {
        uid: e.uid,
        min: e.clientTs,
        max: e.clientTs,
        n: 0,
        edits: 0,
        hadDebug: false,
      });
      s.min = Math.min(s.min, e.clientTs);
      s.max = Math.max(s.max, e.clientTs);
      s.n += 1;
      if (e.type === 'edit') s.edits += 1;
      if (DEBUG_TYPES.has(e.type)) s.hadDebug = true;
    }
  });

  const total = usersAll.size;
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : 'n/a');

  const sessions = Object.values(sessionEvents);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const errRates = Object.values(compileByUser)
    .filter((c) => c.ok + c.err > 0)
    .map((c) => c.err / (c.ok + c.err));

  console.log('');
  console.log('=== Nova event analysis (all-time, all students) ===');
  console.log('');
  console.log(`Distinct students (any event):       ${total}`);
  console.log(`Distinct students (any compile):     ${usersCompiled.size}  (${pct(usersCompiled.size)})`);
  console.log('');
  console.log('--- Debug feature ---');
  console.log(`Used debug (any debug-type event):   ${usersDebug.size}  (${pct(usersDebug.size)})`);
  console.log(`Set at least one breakpoint:         ${usersBreakpoint.size}  (${pct(usersBreakpoint.size)})`);
  console.log(`Used a step action (over/into/out/continue): ${usersStepActions.size}  (${pct(usersStepActions.size)})`);
  console.log(`Used time-travel (step_back/forward):${usersTimeTravel.size}  (${pct(usersTimeTravel.size)})`);
  console.log(`Ran tests at least once:             ${usersTests.size}  (${pct(usersTests.size)})`);
  console.log('');
  console.log('--- Event-type totals ---');
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t.padEnd(24)} ${c}`));
  console.log('');
  console.log('--- Compile success ---');
  console.log(`Per-student avg error rate:          ${(avg(errRates) * 100).toFixed(1)}%`);
  console.log('');
  console.log('--- Session stats ---');
  console.log(`Sessions:                            ${sessions.length}`);
  console.log(`Sessions that touched debug:         ${sessions.filter((s) => s.hadDebug).length}`);
  console.log(`Avg events / session:                ${avg(sessions.map((s) => s.n)).toFixed(1)}`);
  console.log(`Avg duration (min) / session:        ${avg(sessions.map((s) => (s.max - s.min) / 60000)).toFixed(1)}`);
  console.log(`Avg edits / session:                 ${avg(sessions.map((s) => s.edits)).toFixed(1)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
