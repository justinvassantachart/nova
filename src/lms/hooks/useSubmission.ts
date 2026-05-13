import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!classId || !assignmentId || !studentUid || !starterFiles) return
    let cancelled = false
    setLoading(true)
    getOrCreateSubmission({
      classId,
      assignmentId,
      studentUid,
      studentDisplayName: studentDisplayName ?? '',
      studentEmail: studentEmail ?? '',
      starterFiles,
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
  }, [classId, assignmentId, studentUid, studentDisplayName, studentEmail, starterFiles])

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
