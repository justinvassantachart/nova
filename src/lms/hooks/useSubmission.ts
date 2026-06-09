import { useEffect, useRef, useState } from 'react'
import {
  getOrCreateSubmission,
  watchAssignmentSubmissions,
  watchSubmission,
} from '@/shared/firebase/submissions'
import type { Submission } from '@/shared/types'

// Snapshots carry the key they were loaded for; loading is derived from a
// key mismatch instead of setLoading(true) inside the effect (see
// useClasses.ts for the rationale).
type Keyed<T> = { key: string; data: T } | null

// Loads or creates the student's submission for an assignment, seeded with
// the assignment's starter files on first run. Returns null until ready.
export function useSubmission(opts: {
  classId: string | undefined
  assignmentId: string | undefined
  studentUid: string | undefined
  studentDisplayName: string | undefined
  studentEmail: string | undefined
  starterFiles: Record<string, string> | undefined
}) {
  const { classId, assignmentId, studentUid, studentDisplayName, studentEmail, starterFiles } = opts
  const starterReady = Boolean(starterFiles)
  const key =
    classId && assignmentId && studentUid && starterReady
      ? `${classId}/${assignmentId}/${studentUid}`
      : undefined
  const [snap, setSnap] = useState<Keyed<Submission | null>>(null)

  // starterFiles comes from a Firestore snapshot, so its reference changes
  // on every assignment update — including ones triggered by our own
  // saveSubmissionFiles. If we put it in the dep array, every save flips
  // loading=true, which unmounts <App/> in AssignmentPage. App's unmount
  // clears the pending workspace flush timer, so any in-flight save is
  // cancelled, and the remount re-runs initVFS, which wipeWorkspace()s and
  // rehydrates from OPFS — losing any newly-created-but-not-yet-typed-in
  // file. Stash starterFiles in a ref instead so the effect re-runs only
  // on identity changes (different student / assignment).
  const starterRef = useRef(starterFiles)
  useEffect(() => {
    starterRef.current = starterFiles
  })

  useEffect(() => {
    if (!classId || !assignmentId || !studentUid || !key) return
    const seed = starterRef.current
    if (!seed) return
    let cancelled = false
    getOrCreateSubmission({
      classId,
      assignmentId,
      studentUid,
      studentDisplayName: studentDisplayName ?? '',
      studentEmail: studentEmail ?? '',
      starterFiles: seed,
    })
      .then((s) => {
        if (!cancelled) setSnap({ key, data: s })
      })
      .catch((e) => {
        console.warn('[useSubmission] create failed', e)
        if (!cancelled) setSnap({ key, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [classId, assignmentId, studentUid, studentDisplayName, studentEmail, key])

  // Live-update for things like submittedAt timestamp from other tabs.
  useEffect(() => {
    if (!classId || !assignmentId || !studentUid || !key) return
    return watchSubmission(classId, assignmentId, studentUid, (s) => {
      if (s) setSnap({ key, data: s })
    })
  }, [classId, assignmentId, studentUid, key])

  const fresh = snap !== null && snap.key === key
  return { submission: fresh ? snap.data : null, loading: !!key && !fresh }
}

export function useAssignmentSubmissions(
  classId: string | undefined,
  assignmentId: string | undefined,
) {
  const key = classId && assignmentId ? `${classId}/${assignmentId}` : undefined
  const [snap, setSnap] = useState<Keyed<Submission[]>>(null)
  useEffect(() => {
    if (!classId || !assignmentId || !key) return
    return watchAssignmentSubmissions(classId, assignmentId, (l) =>
      setSnap({ key, data: l }),
    )
  }, [classId, assignmentId, key])
  const fresh = snap !== null && snap.key === key
  return { list: fresh ? snap.data : [], loading: !!key && !fresh }
}

// Read-only fetch of a specific student's submission. Used by the teacher
// SubmissionView page; returns null if not yet started.
export function useStudentSubmission(
  classId: string | undefined,
  assignmentId: string | undefined,
  studentUid: string | undefined,
) {
  const key =
    classId && assignmentId && studentUid
      ? `${classId}/${assignmentId}/${studentUid}`
      : undefined
  const [snap, setSnap] = useState<Keyed<Submission | null>>(null)
  useEffect(() => {
    if (!classId || !assignmentId || !studentUid || !key) return
    return watchSubmission(classId, assignmentId, studentUid, (s) =>
      setSnap({ key, data: s }),
    )
  }, [classId, assignmentId, studentUid, key])
  const fresh = snap !== null && snap.key === key
  return { submission: fresh ? snap.data : null, loading: !!key && !fresh }
}
