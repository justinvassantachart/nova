import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import type { Submission } from '@/shared/types'

const COL = 'submissions'

export function submissionId(assignmentId: string, studentUid: string) {
  return `${assignmentId}_${studentUid}`
}

export async function getOrCreateSubmission(
  assignmentId: string,
  studentUid: string,
  starterFiles: Record<string, string>,
): Promise<Submission> {
  const id = submissionId(assignmentId, studentUid)
  const ref = doc(getDb(), COL, id)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return { id, ...(snap.data() as Omit<Submission, 'id'>) }
  }
  const initial: Omit<Submission, 'id'> = {
    assignmentId,
    studentUid,
    files: starterFiles,
    updatedAt: null,
  }
  await setDoc(ref, { ...initial, updatedAt: serverTimestamp() })
  // Re-read so server timestamps resolve.
  const after = await getDoc(ref)
  return { id, ...(after.data() as Omit<Submission, 'id'>) }
}

export function watchSubmission(id: string, cb: (s: Submission | null) => void): Unsubscribe {
  return onSnapshot(doc(getDb(), COL, id), (snap) => {
    if (!snap.exists()) cb(null)
    else cb({ id: snap.id, ...(snap.data() as Omit<Submission, 'id'>) })
  })
}

export async function saveSubmissionFiles(id: string, files: Record<string, string>) {
  await setDoc(
    doc(getDb(), COL, id),
    { files, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export async function markSubmitted(id: string) {
  await setDoc(doc(getDb(), COL, id), { submittedAt: serverTimestamp() }, { merge: true })
}
