import { useEffect, useState } from 'react'
import {
  watchAssignment,
  watchClassAssignments,
} from '@/shared/firebase/assignments'
import type { Assignment } from '@/shared/types'

// Snapshots carry the key they were loaded for; loading is derived from a
// key mismatch instead of setLoading(true) inside the effect (see
// useClasses.ts for the rationale).
type Keyed<T> = { key: string; data: T } | null

export function useClassAssignments(
  classId: string | undefined,
  opts: { publishedOnly?: boolean } = {},
) {
  const publishedOnly = opts.publishedOnly ?? false
  const key = classId ? `${classId}:${publishedOnly}` : undefined
  const [snap, setSnap] = useState<Keyed<Assignment[]>>(null)
  useEffect(() => {
    if (!classId || !key) return
    return watchClassAssignments(classId, { publishedOnly }, (l) =>
      setSnap({ key, data: l }),
    )
  }, [classId, key, publishedOnly])
  const fresh = snap !== null && snap.key === key
  return { list: fresh ? snap.data : [], loading: !!key && !fresh }
}

export function useAssignment(
  classId: string | undefined,
  assignmentId: string | undefined,
) {
  const key = classId && assignmentId ? `${classId}/${assignmentId}` : undefined
  const [snap, setSnap] = useState<Keyed<Assignment | null>>(null)
  useEffect(() => {
    if (!classId || !assignmentId || !key) return
    return watchAssignment(classId, assignmentId, (a) => setSnap({ key, data: a }))
  }, [classId, assignmentId, key])
  const fresh = snap !== null && snap.key === key
  return { assignment: fresh ? snap.data : null, loading: !!key && !fresh }
}
