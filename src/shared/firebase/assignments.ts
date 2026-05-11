import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import type { Assignment } from '@/shared/types'

const COL = 'assignments'

export async function createAssignment(teacherUid: string, title = 'Untitled assignment') {
  const ref = await addDoc(collection(getDb(), COL), {
    title,
    description: '',
    teacherUid,
    starterFiles: { '/workspace/main.cpp': '// TODO: write your solution\nint main() { return 0; }\n' },
    published: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const snap = await getDoc(doc(getDb(), COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Assignment, 'id'>) }
}

export function watchAssignment(id: string, cb: (a: Assignment | null) => void): Unsubscribe {
  return onSnapshot(doc(getDb(), COL, id), (snap) => {
    if (!snap.exists()) cb(null)
    else cb({ id: snap.id, ...(snap.data() as Omit<Assignment, 'id'>) })
  })
}

export function watchMyAssignments(teacherUid: string, cb: (list: Assignment[]) => void): Unsubscribe {
  const q = query(collection(getDb(), COL), where('teacherUid', '==', teacherUid))
  return onSnapshot(q, (snap) => {
    const list: Assignment[] = []
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) }))
    list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    cb(list)
  })
}

export function watchPublishedAssignments(cb: (list: Assignment[]) => void): Unsubscribe {
  const q = query(collection(getDb(), COL), where('published', '==', true))
  return onSnapshot(q, (snap) => {
    const list: Assignment[] = []
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) }))
    list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    cb(list)
  })
}

export async function updateAssignmentMeta(
  id: string,
  patch: Partial<Pick<Assignment, 'title' | 'description' | 'published'>>,
) {
  await updateDoc(doc(getDb(), COL, id), patch)
}

export async function saveStarterFiles(id: string, files: Record<string, string>) {
  await setDoc(doc(getDb(), COL, id), { starterFiles: files }, { merge: true })
}

export async function deleteAssignment(id: string) {
  await deleteDoc(doc(getDb(), COL, id))
}
