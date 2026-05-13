import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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
  await setDoc(
    submissionRef(classId, assignmentId, studentUid),
    { files, updatedAt: serverTimestamp() },
    { merge: true },
  )
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
