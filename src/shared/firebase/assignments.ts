import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { sortAssignments } from '@/shared/assignment-order'
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
  // Syllabus position; pass nextOrder(currentList) so new work lands last.
  order?: number
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
    order: opts.order ?? 0,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

// Copy of an existing assignment: same description, starter files and due
// date, but always a draft (never auto-published) and placed at `order`.
export async function duplicateAssignment(opts: {
  classId: string
  teacherUid: string
  source: Assignment
  order: number
}): Promise<string> {
  const ref = await addDoc(assignmentsCol(opts.classId), {
    classId: opts.classId,
    teacherUid: opts.teacherUid,
    title: `Copy of ${opts.source.title || 'Untitled'}`,
    description: opts.source.description ?? '',
    starterFiles: opts.source.starterFiles ?? {},
    published: false,
    order: opts.order,
    dueDate: opts.source.dueDate ?? null,
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
    cb(sortAssignments(list))
  })
}

export async function updateAssignmentMeta(
  classId: string,
  assignmentId: string,
  patch: Partial<Pick<Assignment, 'title' | 'description' | 'published' | 'dueDate'>>,
) {
  await updateDoc(assignmentRef(classId, assignmentId), patch)
}

// Persist a full syllabus order: every assignment's `order` becomes its
// index in `orderedIds`. Normalizing the whole list on every move keeps the
// field self-healing (legacy docs without `order` get one on first reorder).
export async function reorderAssignments(classId: string, orderedIds: string[]) {
  const batch = writeBatch(getDb())
  orderedIds.forEach((id, index) => {
    batch.update(assignmentRef(classId, id), { order: index })
  })
  await batch.commit()
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

// Deletes the assignment AND its submissions subcollection. Deleting only
// the parent doc would orphan student work as unreachable-but-billed docs
// (Firestore subcollections survive parent deletion).
export async function deleteAssignment(classId: string, assignmentId: string) {
  const subs = await getDocs(
    collection(getDb(), 'classes', classId, 'assignments', assignmentId, 'submissions'),
  )
  // Batches cap at 500 writes; chunk to stay clear of the limit.
  const refs = subs.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(getDb())
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
    await batch.commit()
  }
  await deleteDoc(assignmentRef(classId, assignmentId))
}
