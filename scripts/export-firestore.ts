// Full Firestore export for the Nova IDE impact paper.
//
// Pulls every relevant collection into a dated output directory:
//   exports/<UTC-stamp>/
//     users.jsonl
//     classes.jsonl
//     members.jsonl                  (flattened across classes)
//     assignments.jsonl              (flattened across classes)
//     submissions.jsonl              (flattened; includes file contents)
//     events.jsonl                   (every event, raw)
//     events.csv                     (flattened, paper-friendly columns)
//     sessions.csv                   (per-session aggregate)
//     per_user.csv                   (per-user aggregate)
//     per_user_per_assignment.csv    (per-user per-assignment aggregate)
//     summary.json                   (top-line stats)
//     manifest.json                  (counts + schema version + run metadata)
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/nova-lms-...-adminsdk.json \
//   FIREBASE_PROJECT_ID=nova-lms-7ea12 \
//   npx tsx scripts/export-firestore.ts
//
// Optional:
//   EXPORT_DIR=/abs/path        override default exports/<stamp>
//   INCLUDE_FILE_CONTENTS=0     omit submission/starter file contents (just keep keys)

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { mkdirSync, createWriteStream, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID env var (e.g. nova-lms-7ea12).')
  process.exit(1)
}

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
const credential = saPath
  ? cert(JSON.parse(readFileSync(saPath, 'utf8')))
  : applicationDefault()

initializeApp({ credential, projectId })
const db = getFirestore()

const INCLUDE_FILE_CONTENTS = process.env.INCLUDE_FILE_CONTENTS !== '0'

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = process.env.EXPORT_DIR ?? join('exports', stamp)
mkdirSync(outDir, { recursive: true })
console.error(`Writing export to ${outDir}`)

// ── helpers ────────────────────────────────────────────────────────

function tsToMs(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v === 'number') return v
  return null
}

// Convert Firestore Timestamps to ISO strings (recursive). Leaves other
// values alone. Used to make JSONL output human/tool-friendly.
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalize(v)
    }
    return out
  }
  return value
}

// Open a JSONL writer that batches writes.
function openJsonl(path: string) {
  const stream = createWriteStream(path, { flags: 'w' })
  return {
    write(obj: unknown) { stream.write(JSON.stringify(obj) + '\n') },
    close() { return new Promise<void>((r) => stream.end(r)) },
  }
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s: string
  if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

function openCsv(path: string, header: string[]) {
  const stream = createWriteStream(path, { flags: 'w' })
  stream.write(header.map(csvCell).join(',') + '\n')
  return {
    write(row: Record<string, unknown>) {
      stream.write(header.map((h) => csvCell(row[h])).join(',') + '\n')
    },
    close() { return new Promise<void>((r) => stream.end(r)) },
  }
}

// ── pulls ───────────────────────────────────────────────────────────

type CountMap = Record<string, number>

async function exportUsers(): Promise<{ users: Map<string, Record<string, unknown>> }> {
  const out = openJsonl(join(outDir, 'users.jsonl'))
  const users = new Map<string, Record<string, unknown>>()
  const snap = await db.collection('users').get()
  console.error(`  users:        ${snap.size}`)
  for (const doc of snap.docs) {
    const data = { uid: doc.id, ...(doc.data() as Record<string, unknown>) }
    users.set(doc.id, data)
    out.write(normalize(data))
  }
  await out.close()
  return { users }
}

async function exportClasses(): Promise<{
  classes: Map<string, Record<string, unknown>>
}> {
  const out = openJsonl(join(outDir, 'classes.jsonl'))
  const classes = new Map<string, Record<string, unknown>>()
  const snap = await db.collection('classes').get()
  console.error(`  classes:      ${snap.size}`)
  for (const doc of snap.docs) {
    const data = { classId: doc.id, ...(doc.data() as Record<string, unknown>) }
    classes.set(doc.id, data)
    out.write(normalize(data))
  }
  await out.close()
  return { classes }
}

async function exportMembers(classIds: string[]): Promise<{
  membersByClass: Map<string, string[]>
}> {
  const out = openJsonl(join(outDir, 'members.jsonl'))
  const membersByClass = new Map<string, string[]>()
  let total = 0
  for (const classId of classIds) {
    const snap = await db.collection('classes').doc(classId).collection('members').get()
    const list: string[] = []
    for (const m of snap.docs) {
      const data = { classId, memberUid: m.id, ...(m.data() as Record<string, unknown>) }
      list.push(m.id)
      total += 1
      out.write(normalize(data))
    }
    membersByClass.set(classId, list)
  }
  console.error(`  members:      ${total}`)
  await out.close()
  return { membersByClass }
}

async function exportAssignments(classIds: string[]): Promise<{
  assignmentsByClass: Map<string, Array<{ id: string; data: Record<string, unknown> }>>
}> {
  const out = openJsonl(join(outDir, 'assignments.jsonl'))
  const assignmentsByClass = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>()
  let total = 0
  for (const classId of classIds) {
    const snap = await db.collection('classes').doc(classId).collection('assignments').get()
    const list: Array<{ id: string; data: Record<string, unknown> }> = []
    for (const a of snap.docs) {
      const raw = a.data() as Record<string, unknown>
      const data: Record<string, unknown> = { ...raw }
      if (!INCLUDE_FILE_CONTENTS && data.starterFiles && typeof data.starterFiles === 'object') {
        data.starterFiles = Object.keys(data.starterFiles as Record<string, unknown>)
      }
      list.push({ id: a.id, data: raw })
      total += 1
      out.write(normalize({ classId, assignmentId: a.id, ...data }))
    }
    assignmentsByClass.set(classId, list)
  }
  console.error(`  assignments:  ${total}`)
  await out.close()
  return { assignmentsByClass }
}

type SubmissionRow = {
  classId: string
  assignmentId: string
  studentUid: string
  data: Record<string, unknown>
}

async function exportSubmissions(
  assignmentsByClass: Map<string, Array<{ id: string; data: Record<string, unknown> }>>,
): Promise<SubmissionRow[]> {
  const out = openJsonl(join(outDir, 'submissions.jsonl'))
  const rows: SubmissionRow[] = []
  let total = 0
  for (const [classId, assignments] of assignmentsByClass) {
    for (const { id: assignmentId } of assignments) {
      const snap = await db
        .collection('classes').doc(classId)
        .collection('assignments').doc(assignmentId)
        .collection('submissions').get()
      for (const s of snap.docs) {
        const raw = s.data() as Record<string, unknown>
        const data: Record<string, unknown> = { ...raw }
        if (!INCLUDE_FILE_CONTENTS && data.files && typeof data.files === 'object') {
          data.files = Object.keys(data.files as Record<string, unknown>)
        }
        rows.push({ classId, assignmentId, studentUid: s.id, data: raw })
        total += 1
        out.write(normalize({ classId, assignmentId, studentUid: s.id, ...data }))
      }
    }
  }
  console.error(`  submissions:  ${total}`)
  await out.close()
  return rows
}

type EventDoc = {
  uid: string
  sessionId: string
  assignmentId: string | null
  submissionId: string | null
  type: string
  payload: Record<string, unknown>
  clientTs: number
  ts: Timestamp | null
}

const DEBUG_TYPES = new Set([
  'compile_debug',
  'breakpoint_toggle',
  'debug_continue',
  'debug_step_over',
  'debug_step_into',
  'debug_step_out',
  'debug_step_back',
  'debug_step_forward',
])

const STEP_TYPES = new Set([
  'debug_step_over',
  'debug_step_into',
  'debug_step_out',
  'debug_continue',
])

const TIME_TRAVEL_TYPES = new Set(['debug_step_back', 'debug_step_forward'])

async function exportEvents(): Promise<{
  events: EventDoc[]
  typeCounts: CountMap
}> {
  const jsonl = openJsonl(join(outDir, 'events.jsonl'))
  const csv = openCsv(join(outDir, 'events.csv'), [
    'id', 'uid', 'sessionId', 'classId', 'assignmentId', 'submissionId',
    'type', 'clientTs', 'clientISO', 'serverISO', 'payload',
  ])

  const events: EventDoc[] = []
  const typeCounts: CountMap = {}

  const snap = await db.collection('events').get()
  console.error(`  events:       ${snap.size}`)
  for (const doc of snap.docs) {
    const e = doc.data() as EventDoc
    events.push(e)
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1
    jsonl.write(normalize({ id: doc.id, ...(e as unknown as Record<string, unknown>) }))
    csv.write({
      id: doc.id,
      uid: e.uid,
      sessionId: e.sessionId,
      // events don't store classId directly; left blank, joinable via assignment lookup.
      classId: '',
      assignmentId: e.assignmentId ?? '',
      submissionId: e.submissionId ?? '',
      type: e.type,
      clientTs: e.clientTs,
      clientISO: typeof e.clientTs === 'number' ? new Date(e.clientTs).toISOString() : '',
      serverISO: e.ts instanceof Timestamp ? e.ts.toDate().toISOString() : '',
      payload: e.payload ?? {},
    })
  }
  await jsonl.close()
  await csv.close()
  return { events, typeCounts }
}

// ── aggregates ──────────────────────────────────────────────────────

type SessionRow = {
  sessionId: string
  uid: string
  startISO: string
  endISO: string
  durationMin: number
  events: number
  edits: number
  compiles: number
  compileDebug: number
  compileTest: number
  compileErrors: number
  runs: number
  runTests: number
  breakpoints: number
  stepActions: number
  timeTravel: number
  fileCreates: number
  fileDeletes: number
  fileRenames: number
  assignmentIds: string
}

function writeSessionCsv(events: EventDoc[]) {
  const sess = new Map<string, SessionRow & { _min: number; _max: number; _assn: Set<string> }>()
  for (const e of events) {
    if (!e.sessionId || typeof e.clientTs !== 'number') continue
    let s = sess.get(e.sessionId)
    if (!s) {
      s = {
        sessionId: e.sessionId,
        uid: e.uid,
        startISO: '',
        endISO: '',
        durationMin: 0,
        events: 0,
        edits: 0,
        compiles: 0,
        compileDebug: 0,
        compileTest: 0,
        compileErrors: 0,
        runs: 0,
        runTests: 0,
        breakpoints: 0,
        stepActions: 0,
        timeTravel: 0,
        fileCreates: 0,
        fileDeletes: 0,
        fileRenames: 0,
        assignmentIds: '',
        _min: e.clientTs,
        _max: e.clientTs,
        _assn: new Set<string>(),
      }
      sess.set(e.sessionId, s)
    }
    s._min = Math.min(s._min, e.clientTs)
    s._max = Math.max(s._max, e.clientTs)
    s.events += 1
    if (e.assignmentId) s._assn.add(e.assignmentId)
    switch (e.type) {
      case 'edit': s.edits += 1; break
      case 'compile': s.compiles += 1; break
      case 'compile_debug': s.compileDebug += 1; break
      case 'compile_test': s.compileTest += 1; break
      case 'compile_error': s.compileErrors += 1; break
      case 'run': s.runs += 1; break
      case 'run_tests': s.runTests += 1; break
      case 'breakpoint_toggle': s.breakpoints += 1; break
      case 'file_create': s.fileCreates += 1; break
      case 'file_delete': s.fileDeletes += 1; break
      case 'file_rename': s.fileRenames += 1; break
    }
    if (STEP_TYPES.has(e.type)) s.stepActions += 1
    if (TIME_TRAVEL_TYPES.has(e.type)) s.timeTravel += 1
  }

  const csv = openCsv(join(outDir, 'sessions.csv'), [
    'sessionId', 'uid', 'startISO', 'endISO', 'durationMin', 'events',
    'edits', 'compiles', 'compileDebug', 'compileTest', 'compileErrors',
    'runs', 'runTests', 'breakpoints', 'stepActions', 'timeTravel',
    'fileCreates', 'fileDeletes', 'fileRenames', 'assignmentIds',
  ])
  for (const s of sess.values()) {
    s.startISO = new Date(s._min).toISOString()
    s.endISO = new Date(s._max).toISOString()
    s.durationMin = Number(((s._max - s._min) / 60000).toFixed(3))
    s.assignmentIds = Array.from(s._assn).join('|')
    const { _min, _max, _assn, ...row } = s
    void _min; void _max; void _assn
    csv.write(row as unknown as Record<string, unknown>)
  }
  return csv.close()
}

function writePerUserCsv(events: EventDoc[]) {
  type Acc = {
    uid: string
    totalEvents: number
    sessions: Set<string>
    firstISO: string
    lastISO: string
    _min: number
    _max: number
    edits: number
    compiles: number
    compileDebug: number
    compileTest: number
    compileErrors: number
    runs: number
    runTests: number
    breakpoints: number
    stepActions: number
    timeTravel: number
    fileCreates: number
    fileDeletes: number
    usedDebug: boolean
    usedTimeTravel: boolean
    assignmentSet: Set<string>
  }
  const m = new Map<string, Acc>()
  for (const e of events) {
    if (!e.uid) continue
    let a = m.get(e.uid)
    if (!a) {
      a = {
        uid: e.uid, totalEvents: 0, sessions: new Set(),
        firstISO: '', lastISO: '',
        _min: e.clientTs ?? Number.POSITIVE_INFINITY,
        _max: e.clientTs ?? 0,
        edits: 0, compiles: 0, compileDebug: 0, compileTest: 0,
        compileErrors: 0, runs: 0, runTests: 0, breakpoints: 0,
        stepActions: 0, timeTravel: 0, fileCreates: 0, fileDeletes: 0,
        usedDebug: false, usedTimeTravel: false,
        assignmentSet: new Set(),
      }
      m.set(e.uid, a)
    }
    a.totalEvents += 1
    if (e.sessionId) a.sessions.add(e.sessionId)
    if (typeof e.clientTs === 'number') {
      a._min = Math.min(a._min, e.clientTs)
      a._max = Math.max(a._max, e.clientTs)
    }
    if (e.assignmentId) a.assignmentSet.add(e.assignmentId)
    if (DEBUG_TYPES.has(e.type)) a.usedDebug = true
    if (TIME_TRAVEL_TYPES.has(e.type)) a.usedTimeTravel = true
    switch (e.type) {
      case 'edit': a.edits += 1; break
      case 'compile': a.compiles += 1; break
      case 'compile_debug': a.compileDebug += 1; break
      case 'compile_test': a.compileTest += 1; break
      case 'compile_error': a.compileErrors += 1; break
      case 'run': a.runs += 1; break
      case 'run_tests': a.runTests += 1; break
      case 'breakpoint_toggle': a.breakpoints += 1; break
      case 'file_create': a.fileCreates += 1; break
      case 'file_delete': a.fileDeletes += 1; break
    }
    if (STEP_TYPES.has(e.type)) a.stepActions += 1
    if (TIME_TRAVEL_TYPES.has(e.type)) a.timeTravel += 1
  }
  const csv = openCsv(join(outDir, 'per_user.csv'), [
    'uid', 'firstISO', 'lastISO', 'spanDays', 'sessions', 'totalEvents',
    'edits', 'compiles', 'compileDebug', 'compileTest', 'compileErrors',
    'runs', 'runTests', 'breakpoints', 'stepActions', 'timeTravel',
    'fileCreates', 'fileDeletes', 'distinctAssignments',
    'usedDebug', 'usedTimeTravel',
  ])
  for (const a of m.values()) {
    csv.write({
      uid: a.uid,
      firstISO: isFinite(a._min) ? new Date(a._min).toISOString() : '',
      lastISO: a._max ? new Date(a._max).toISOString() : '',
      spanDays: isFinite(a._min) && a._max
        ? Number(((a._max - a._min) / 86_400_000).toFixed(3))
        : 0,
      sessions: a.sessions.size,
      totalEvents: a.totalEvents,
      edits: a.edits,
      compiles: a.compiles,
      compileDebug: a.compileDebug,
      compileTest: a.compileTest,
      compileErrors: a.compileErrors,
      runs: a.runs,
      runTests: a.runTests,
      breakpoints: a.breakpoints,
      stepActions: a.stepActions,
      timeTravel: a.timeTravel,
      fileCreates: a.fileCreates,
      fileDeletes: a.fileDeletes,
      distinctAssignments: a.assignmentSet.size,
      usedDebug: a.usedDebug ? 1 : 0,
      usedTimeTravel: a.usedTimeTravel ? 1 : 0,
    })
  }
  return csv.close()
}

function writePerUserPerAssignmentCsv(events: EventDoc[]) {
  type Acc = {
    uid: string
    assignmentId: string
    sessions: Set<string>
    events: number
    edits: number
    compiles: number
    compileDebug: number
    compileTest: number
    compileErrors: number
    runs: number
    runTests: number
    breakpoints: number
    stepActions: number
    timeTravel: number
    _min: number
    _max: number
  }
  const m = new Map<string, Acc>()
  for (const e of events) {
    if (!e.uid || !e.assignmentId) continue
    const key = `${e.uid}::${e.assignmentId}`
    let a = m.get(key)
    if (!a) {
      a = {
        uid: e.uid,
        assignmentId: e.assignmentId,
        sessions: new Set(),
        events: 0, edits: 0, compiles: 0, compileDebug: 0,
        compileTest: 0, compileErrors: 0, runs: 0, runTests: 0,
        breakpoints: 0, stepActions: 0, timeTravel: 0,
        _min: e.clientTs ?? Number.POSITIVE_INFINITY,
        _max: e.clientTs ?? 0,
      }
      m.set(key, a)
    }
    a.events += 1
    if (e.sessionId) a.sessions.add(e.sessionId)
    if (typeof e.clientTs === 'number') {
      a._min = Math.min(a._min, e.clientTs)
      a._max = Math.max(a._max, e.clientTs)
    }
    switch (e.type) {
      case 'edit': a.edits += 1; break
      case 'compile': a.compiles += 1; break
      case 'compile_debug': a.compileDebug += 1; break
      case 'compile_test': a.compileTest += 1; break
      case 'compile_error': a.compileErrors += 1; break
      case 'run': a.runs += 1; break
      case 'run_tests': a.runTests += 1; break
      case 'breakpoint_toggle': a.breakpoints += 1; break
    }
    if (STEP_TYPES.has(e.type)) a.stepActions += 1
    if (TIME_TRAVEL_TYPES.has(e.type)) a.timeTravel += 1
  }
  const csv = openCsv(join(outDir, 'per_user_per_assignment.csv'), [
    'uid', 'assignmentId', 'firstISO', 'lastISO', 'spanMin', 'sessions',
    'events', 'edits', 'compiles', 'compileDebug', 'compileTest',
    'compileErrors', 'runs', 'runTests', 'breakpoints', 'stepActions',
    'timeTravel',
  ])
  for (const a of m.values()) {
    csv.write({
      uid: a.uid,
      assignmentId: a.assignmentId,
      firstISO: isFinite(a._min) ? new Date(a._min).toISOString() : '',
      lastISO: a._max ? new Date(a._max).toISOString() : '',
      spanMin: isFinite(a._min) && a._max
        ? Number(((a._max - a._min) / 60_000).toFixed(3))
        : 0,
      sessions: a.sessions.size,
      events: a.events,
      edits: a.edits,
      compiles: a.compiles,
      compileDebug: a.compileDebug,
      compileTest: a.compileTest,
      compileErrors: a.compileErrors,
      runs: a.runs,
      runTests: a.runTests,
      breakpoints: a.breakpoints,
      stepActions: a.stepActions,
      timeTravel: a.timeTravel,
    })
  }
  return csv.close()
}

// ── main ────────────────────────────────────────────────────────────

async function main() {
  console.error(`Reading project "${projectId}"...`)
  console.error(`  include file contents: ${INCLUDE_FILE_CONTENTS}`)

  const { users } = await exportUsers()
  const { classes } = await exportClasses()
  const classIds = Array.from(classes.keys())
  const { membersByClass } = await exportMembers(classIds)
  const { assignmentsByClass } = await exportAssignments(classIds)
  const submissions = await exportSubmissions(assignmentsByClass)
  const { events, typeCounts } = await exportEvents()

  console.error('Writing aggregates...')
  await writeSessionCsv(events)
  await writePerUserCsv(events)
  await writePerUserPerAssignmentCsv(events)

  // Summary
  const distinctStudents = new Set(events.map((e) => e.uid).filter(Boolean))
  const distinctSessions = new Set(events.map((e) => e.sessionId).filter(Boolean))
  const tsList = events.map((e) => tsToMs(e.clientTs)).filter((x): x is number => x != null)
  const earliest = tsList.length ? Math.min(...tsList) : null
  const latest = tsList.length ? Math.max(...tsList) : null

  let totalMembers = 0
  for (const list of membersByClass.values()) totalMembers += list.length
  let totalAssignments = 0
  for (const list of assignmentsByClass.values()) totalAssignments += list.length

  const summary = {
    projectId,
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.size,
      classes: classes.size,
      members: totalMembers,
      assignments: totalAssignments,
      submissions: submissions.length,
      events: events.length,
      eventDistinctStudents: distinctStudents.size,
      eventDistinctSessions: distinctSessions.size,
    },
    eventWindow: {
      earliestISO: earliest ? new Date(earliest).toISOString() : null,
      latestISO: latest ? new Date(latest).toISOString() : null,
      spanDays: earliest && latest
        ? Number(((latest - earliest) / 86_400_000).toFixed(2))
        : null,
    },
    eventTypeCounts: typeCounts,
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))

  const manifest = {
    projectId,
    generatedAt: new Date().toISOString(),
    includeFileContents: INCLUDE_FILE_CONTENTS,
    files: [
      'users.jsonl', 'classes.jsonl', 'members.jsonl', 'assignments.jsonl',
      'submissions.jsonl', 'events.jsonl', 'events.csv', 'sessions.csv',
      'per_user.csv', 'per_user_per_assignment.csv', 'summary.json',
    ],
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.error('Done.')
  console.error(`Output: ${outDir}`)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
