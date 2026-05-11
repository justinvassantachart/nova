import { useEffect, useState } from 'react'
import {
  getOrCreateSubmission,
  submissionId,
  watchSubmission,
} from '@/shared/firebase/submissions'
import type { Submission } from '@/shared/types'

// Loads or creates the student's submission for an assignment, seeded with
// the assignment's starter files on first run. Returns null until ready.
export function useSubmission(
  assignmentId: string | undefined,
  studentUid: string | undefined,
  starterFiles: Record<string, string> | undefined,
) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!assignmentId || !studentUid || !starterFiles) return
    let cancelled = false
    setLoading(true)
    getOrCreateSubmission(assignmentId, studentUid, starterFiles)
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
  }, [assignmentId, studentUid, starterFiles])

  // Live-update for things like submittedAt timestamp from other tabs.
  useEffect(() => {
    if (!assignmentId || !studentUid) return
    const id = submissionId(assignmentId, studentUid)
    const unsub = watchSubmission(id, (s) => {
      if (s) setSubmission(s)
    })
    return unsub
  }, [assignmentId, studentUid])

  return { submission, loading }
}
