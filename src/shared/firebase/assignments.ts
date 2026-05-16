import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import type { Assignment } from '@/shared/types'

function assignmentsCol(classId: string) {
  return collection(getDb(), 'classes', classId, 'assignments')
}

function assignmentRef(classId: string, assignmentId: string) {
  return doc(getDb(), 'classes', classId, 'assignments', assignmentId)
}

export async function createAssignment(opts: {
  classId: string
  teacherUid: string
  title?: string
}): Promise<string> {
  const ref = await addDoc(assignmentsCol(opts.classId), {
    classId: opts.classId,
    teacherUid: opts.teacherUid,
    title: opts.title ?? 'Untitled assignment',
    description: '',
    starterFiles: {
      '/workspace/main.cpp': '// TODO: write your solution\nint main() { return 0; }\n',
    },
    published: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAssignment(
  classId: string,
  assignmentId: string,
): Promise<Assignment | null> {
  const snap = await getDoc(assignmentRef(classId, assignmentId))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Assignment, 'id'>) }
}

export function watchAssignment(
  classId: string,
  assignmentId: string,
  cb: (a: Assignment | null) => void,
): Unsubscribe {
  return onSnapshot(assignmentRef(classId, assignmentId), (snap) => {
    if (!snap.exists()) cb(null)
    else cb({ id: snap.id, ...(snap.data() as Omit<Assignment, 'id'>) })
  })
}

export function watchClassAssignments(
  classId: string,
  opts: { publishedOnly?: boolean },
  cb: (list: Assignment[]) => void,
): Unsubscribe {
  const q = opts.publishedOnly
    ? query(assignmentsCol(classId), where('published', '==', true))
    : query(assignmentsCol(classId))
  return onSnapshot(q, (snap) => {
    const list: Assignment[] = []
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) }))
    list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    cb(list)
  })
}

export async function updateAssignmentMeta(
  classId: string,
  assignmentId: string,
  patch: Partial<Pick<Assignment, 'title' | 'description' | 'published'>>,
) {
  await updateDoc(assignmentRef(classId, assignmentId), patch)
}

export async function saveStarterFiles(
  classId: string,
  assignmentId: string,
  files: Record<string, string>,
) {
  // updateDoc, not setDoc({ merge: true }): setDoc's merge recursively
  // merges nested maps, so deletions never propagate (the removed key
  // stays in Firestore). updateDoc replaces the top-level `starterFiles`
  // field wholesale. createAssignment guarantees the doc exists.
  await updateDoc(assignmentRef(classId, assignmentId), { starterFiles: files })
}

export async function deleteAssignment(classId: string, assignmentId: string) {
  await deleteDoc(assignmentRef(classId, assignmentId))
}
