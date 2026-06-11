import { useEffect, useState } from 'react'
import {
  countSubmissions,
  getMySubmissionStatuses,
} from '@/shared/firebase/submissions'
import type { Submission } from '@/shared/types'

// Submission COUNTS per assignment for the teacher's class page. Aggregate
// queries aren't live; this refreshes whenever the assignment id set
// changes (and on mount), which is the cadence the list page needs.
export function useSubmissionCounts(
  classId: string | undefined,
  assignmentIds: string[],
) {
  const key = classId ? `${classId}:${assignmentIds.join(',')}` : undefined
  const [counts, setCounts] = useState<Record<string, { started: number; submitted: number }>>({})
  useEffect(() => {
    if (!classId || !key || assignmentIds.length === 0) return
    let cancelled = false
    void Promise.all(
      assignmentIds.map(async (aid) => [aid, await countSubmissions(classId, aid)] as const),
    ).then((entries) => {
      if (!cancelled) setCounts(Object.fromEntries(entries))
    }).catch(() => { /* counts are decorative; ignore */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return counts
}

// The signed-in student's own status per assignment (Not started when the
// assignment id is absent from the record).
export function useMySubmissionStatuses(
  classId: string | undefined,
  assignmentIds: string[],
  studentUid: string | undefined,
) {
  const key = classId && studentUid ? `${classId}:${studentUid}:${assignmentIds.join(',')}` : undefined
  const [statuses, setStatuses] = useState<
    Record<string, Pick<Submission, 'submittedAt' | 'updatedAt'>>
  >({})
  useEffect(() => {
    if (!classId || !studentUid || !key || assignmentIds.length === 0) return
    let cancelled = false
    void getMySubmissionStatuses(classId, assignmentIds, studentUid)
      .then((r) => { if (!cancelled) setStatuses(r) })
      .catch(() => { /* badges are decorative; ignore */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return statuses
}
