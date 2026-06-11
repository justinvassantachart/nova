import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { deleteAssignment } from './assignments'
import type { Class, ClassMember, Membership } from '@/shared/types'

// 6-char alphanumeric invite code with ambiguous chars removed (no 0/O, 1/I/L).
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generateInviteCode(): string {
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
  }
  return out
}

export async function createClass(opts: {
  name: string
  description?: string
  teacherUid: string
  teacherDisplayName: string
}): Promise<string> {
  const db = getDb()
  const ref = doc(collection(db, 'classes'))
  await writeBatch(db)
    .set(ref, {
      name: opts.name,
      description: opts.description ?? '',
      teacherUid: opts.teacherUid,
      teacherDisplayName: opts.teacherDisplayName,
      inviteCode: generateInviteCode(),
      createdAt: serverTimestamp(),
    })
    .commit()
  return ref.id
}

export async function updateClassMeta(
  classId: string,
  patch: Partial<Pick<Class, 'name' | 'description'>>,
): Promise<void> {
  await updateDoc(doc(getDb(), 'classes', classId), patch)
}

// Invalidates a leaked invite code by minting a fresh one. Already-enrolled
// students are unaffected — the code only gates joining.
export async function regenerateInviteCode(classId: string): Promise<string> {
  const code = generateInviteCode()
  await updateDoc(doc(getDb(), 'classes', classId), { inviteCode: code })
  return code
}

// Best-effort cascade: every assignment (which itself cascades submissions
// and their recorded event traces — see deleteAssignment), the roster,
// then the class doc itself. Firestore has no server-side recursive delete
// for clients, so this enumerates what the teacher can see. Top-level
// /events docs (lesson + teacher-edit traces) are intentionally retained
// as append-only research data.
export async function deleteClassCascade(classId: string): Promise<void> {
  const db = getDb()
  const assignments = await getDocs(collection(db, 'classes', classId, 'assignments'))
  for (const a of assignments.docs) {
    await deleteAssignment(classId, a.id)
  }
  const members = await getDocs(collection(db, 'classes', classId, 'members'))
  for (let i = 0; i < members.docs.length; i += 400) {
    const batch = writeBatch(db)
    for (const d of members.docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(doc(db, 'classes', classId))
}

export async function getClass(classId: string): Promise<Class | null> {
  const snap = await getDoc(doc(getDb(), 'classes', classId))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Class, 'id'>) }
}

export function watchClass(classId: string, cb: (c: Class | null) => void): Unsubscribe {
  return onSnapshot(doc(getDb(), 'classes', classId), (snap) => {
    if (!snap.exists()) cb(null)
    else cb({ id: snap.id, ...(snap.data() as Omit<Class, 'id'>) })
  })
}

export async function getClassByInviteCode(code: string): Promise<Class | null> {
  const q = query(
    collection(getDb(), 'classes'),
    where('inviteCode', '==', code.toUpperCase()),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...(d.data() as Omit<Class, 'id'>) }
}

// Joins the signed-in user to a class. Writes BOTH the authoritative member
// doc and the mirrored membership doc atomically.
export async function joinClass(opts: {
  classId: string
  className: string
  teacherDisplayName: string
  uid: string
  email: string
  displayName: string
}): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  batch.set(doc(db, 'classes', opts.classId, 'members', opts.uid), {
    uid: opts.uid,
    email: opts.email,
    displayName: opts.displayName,
    joinedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'users', opts.uid, 'memberships', opts.classId), {
    classId: opts.classId,
    className: opts.className,
    teacherDisplayName: opts.teacherDisplayName,
    joinedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function leaveClass(classId: string, uid: string): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  batch.delete(doc(db, 'classes', classId, 'members', uid))
  batch.delete(doc(db, 'users', uid, 'memberships', classId))
  await batch.commit()
}

export async function removeMember(classId: string, memberUid: string): Promise<void> {
  // Teacher-side removal: delete the member doc (rules permit teacher).
  // The student's own /users/{uid}/memberships mirror is owned by them and
  // can't be deleted by the teacher; it's stale but the actual class membership
  // is gone, so any attempt to access the class fails at the rules layer.
  await deleteDoc(doc(getDb(), 'classes', classId, 'members', memberUid))
}

export function watchTeachingClasses(uid: string, cb: (list: Class[]) => void): Unsubscribe {
  const q = query(collection(getDb(), 'classes'), where('teacherUid', '==', uid))
  return onSnapshot(q, (snap) => {
    const list: Class[] = []
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Class, 'id'>) }))
    list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    cb(list)
  })
}

export function watchMyMemberships(uid: string, cb: (list: Membership[]) => void): Unsubscribe {
  return onSnapshot(collection(getDb(), 'users', uid, 'memberships'), (snap) => {
    const list: Membership[] = []
    snap.forEach((d) => list.push(d.data() as Membership))
    list.sort((a, b) => (b.joinedAt?.toMillis?.() ?? 0) - (a.joinedAt?.toMillis?.() ?? 0))
    cb(list)
  })
}

export function watchClassMembers(classId: string, cb: (list: ClassMember[]) => void): Unsubscribe {
  return onSnapshot(collection(getDb(), 'classes', classId, 'members'), (snap) => {
    const list: ClassMember[] = []
    snap.forEach((d) => list.push(d.data() as ClassMember))
    list.sort((a, b) => a.displayName.localeCompare(b.displayName))
    cb(list)
  })
}
