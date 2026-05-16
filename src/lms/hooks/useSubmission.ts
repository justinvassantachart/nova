import { useEffect, useRef, useState } from 'react'
import {
  getOrCreateSubmission,
  watchAssignmentSubmissions,
  watchSubmission,
} from '@/shared/firebase/submissions'
import type { Submission } from '@/shared/types'

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
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)

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
  starterRef.current = starterFiles
  const starterReady = Boolean(starterFiles)

  useEffect(() => {
    if (!classId || !assignmentId || !studentUid || !starterReady) return
    const seed = starterRef.current
    if (!seed) return
    let cancelled = false
    setLoading(true)
    getOrCreateSubmission({
      classId,
      assignmentId,
      studentUid,
      studentDisplayName: studentDisplayName ?? '',
      studentEmail: studentEmail ?? '',
      starterFiles: seed,
    })
      .then((s) => {
        if (cancelled) return
        setSubmission(s)
        setLoading(false)
      })
      .catch((e) => {
        console.warn('[useSubmission] create failed', e)
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId, assignmentId, studentUid, studentDisplayName, studentEmail, starterReady])

  // Live-update for things like submittedAt timestamp from other tabs.
  useEffect(() => {
    if (!classId || !assignmentId || !studentUid) return
    return watchSubmission(classId, assignmentId, studentUid, (s) => {
      if (s) setSubmission(s)
    })
  }, [classId, assignmentId, studentUid])

  return { submission, loading }
}

export function useAssignmentSubmissions(
  classId: string | undefined,
  assignmentId: string | undefined,
) {
  const [list, setList] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!classId || !assignmentId) return
    setLoading(true)
    return watchAssignmentSubmissions(classId, assignmentId, (l) => {
      setList(l)
      setLoading(false)
    })
  }, [classId, assignmentId])
  return { list, loading }
}

// Read-only fetch of a specific student's submission. Used by the teacher
// SubmissionView page; returns null if not yet started.
export function useStudentSubmission(
  classId: string | undefined,
  assignmentId: string | undefined,
  studentUid: string | undefined,
) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!classId || !assignmentId || !studentUid) return
    setLoading(true)
    return watchSubmission(classId, assignmentId, studentUid, (s) => {
      setSubmission(s)
      setLoading(false)
    })
  }, [classId, assignmentId, studentUid])
  return { submission, loading }
}
