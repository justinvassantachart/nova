import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import type { Submission } from '@/shared/types'

function submissionRef(classId: string, assignmentId: string, studentUid: string) {
  return doc(
    getDb(),
    'classes', classId,
    'assignments', assignmentId,
    'submissions', studentUid,
  )
}

function submissionsCol(classId: string, assignmentId: string) {
  return collection(
    getDb(),
    'classes', classId,
    'assignments', assignmentId,
    'submissions',
  )
}

export async function getOrCreateSubmission(opts: {
  classId: string
  assignmentId: string
  studentUid: string
  studentDisplayName: string
  studentEmail: string
  starterFiles: Record<string, string>
}): Promise<Submission> {
  const ref = submissionRef(opts.classId, opts.assignmentId, opts.studentUid)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap.data() as Submission

  await setDoc(ref, {
    classId: opts.classId,
    assignmentId: opts.assignmentId,
    studentUid: opts.studentUid,
    studentDisplayName: opts.studentDisplayName,
    studentEmail: opts.studentEmail,
    files: opts.starterFiles,
    updatedAt: serverTimestamp(),
  })
  const after = await getDoc(ref)
  return after.data() as Submission
}

export function watchSubmission(
  classId: string,
  assignmentId: string,
  studentUid: string,
  cb: (s: Submission | null) => void,
): Unsubscribe {
  return onSnapshot(submissionRef(classId, assignmentId, studentUid), (snap) => {
    if (!snap.exists()) cb(null)
    else cb(snap.data() as Submission)
  })
}

export function watchAssignmentSubmissions(
  classId: string,
  assignmentId: string,
  cb: (list: Submission[]) => void,
): Unsubscribe {
  return onSnapshot(submissionsCol(classId, assignmentId), (snap) => {
    const list: Submission[] = []
    snap.forEach((d) => list.push(d.data() as Submission))
    list.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
    cb(list)
  })
}

export async function saveSubmissionFiles(
  classId: string,
  assignmentId: string,
  studentUid: string,
  files: Record<string, string>,
) {
  // updateDoc, not setDoc({ merge: true }): setDoc's merge recursively
  // merges nested maps, so deletions never propagate (the removed key
  // stays in Firestore). updateDoc replaces the top-level `files` field
  // wholesale. getOrCreateSubmission guarantees the doc exists.
  await updateDoc(
    submissionRef(classId, assignmentId, studentUid),
    { files, updatedAt: serverTimestamp() },
  )
}

// Cheap status summary for the class assignment list. Aggregate count
// queries return numbers without downloading submission payloads (each of
// which carries the student's full file map).
export async function countSubmissions(
  classId: string,
  assignmentId: string,
): Promise<{ started: number; submitted: number }> {
  const col = submissionsCol(classId, assignmentId)
  const [startedSnap, submittedSnap] = await Promise.all([
    getCountFromServer(col),
    // Range filter matches only docs where the field exists — i.e. submitted.
    getCountFromServer(query(col, where('submittedAt', '>', Timestamp.fromMillis(0)))),
  ])
  return { started: startedSnap.data().count, submitted: submittedSnap.data().count }
}

// One-time full fetch, used by the teacher's "download all" export.
export async function getAllSubmissions(
  classId: string,
  assignmentId: string,
): Promise<Submission[]> {
  const snap = await getDocs(submissionsCol(classId, assignmentId))
  return snap.docs.map((d) => d.data() as Submission)
}

// The student's own submission status across many assignments, one read
// each (students may not run collection queries over other students' docs,
// so this is per-doc by design).
export async function getMySubmissionStatuses(
  classId: string,
  assignmentIds: string[],
  studentUid: string,
): Promise<Record<string, Pick<Submission, 'submittedAt' | 'updatedAt'>>> {
  const entries = await Promise.all(
    assignmentIds.map(async (aid) => {
      const snap = await getDoc(submissionRef(classId, aid, studentUid))
      if (!snap.exists()) return null
      const s = snap.data() as Submission
      return [aid, { submittedAt: s.submittedAt ?? null, updatedAt: s.updatedAt ?? null }] as const
    }),
  )
  return Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e !== null))
}

export async function markSubmitted(
  classId: string,
  assignmentId: string,
  studentUid: string,
) {
  await setDoc(
    submissionRef(classId, assignmentId, studentUid),
    { submittedAt: serverTimestamp() },
    { merge: true },
  )
}
