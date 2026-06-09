import { useEffect, useState } from 'react'
import {
  watchClass,
  watchClassMembers,
  watchMyMemberships,
  watchTeachingClasses,
} from '@/shared/firebase/classes'
import type { Class, ClassMember, Membership } from '@/shared/types'

// All hooks here share one shape: subscribe to a Firestore watcher keyed by
// an id, store the latest snapshot together with the key it was loaded for,
// and *derive* loading from whether the stored key matches the current one.
// Deriving (instead of setLoading(true) inside the effect) avoids the
// setState-in-effect cascade and automatically shows a loading state again
// when the key changes.
type Keyed<T> = { key: string; data: T } | null

export function useTeachingClasses(uid: string | undefined) {
  const [snap, setSnap] = useState<Keyed<Class[]>>(null)
  useEffect(() => {
    if (!uid) return
    return watchTeachingClasses(uid, (l) => setSnap({ key: uid, data: l }))
  }, [uid])
  const fresh = snap !== null && snap.key === uid
  return { list: fresh ? snap.data : [], loading: !!uid && !fresh }
}

export function useMyMemberships(uid: string | undefined) {
  const [snap, setSnap] = useState<Keyed<Membership[]>>(null)
  useEffect(() => {
    if (!uid) return
    return watchMyMemberships(uid, (l) => setSnap({ key: uid, data: l }))
  }, [uid])
  const fresh = snap !== null && snap.key === uid
  return { list: fresh ? snap.data : [], loading: !!uid && !fresh }
}

export function useClass(classId: string | undefined) {
  const [snap, setSnap] = useState<Keyed<Class | null>>(null)
  useEffect(() => {
    if (!classId) return
    return watchClass(classId, (c) => setSnap({ key: classId, data: c }))
  }, [classId])
  const fresh = snap !== null && snap.key === classId
  return { klass: fresh ? snap.data : null, loading: !!classId && !fresh }
}

export function useClassMembers(classId: string | undefined) {
  const [snap, setSnap] = useState<Keyed<ClassMember[]>>(null)
  useEffect(() => {
    if (!classId) return
    return watchClassMembers(classId, (l) => setSnap({ key: classId, data: l }))
  }, [classId])
  const fresh = snap !== null && snap.key === classId
  return { list: fresh ? snap.data : [], loading: !!classId && !fresh }
}
