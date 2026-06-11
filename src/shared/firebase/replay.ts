import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { getDb } from './client'
import type { ReplayEvent } from '@/replay/types'

// Hard ceiling on how many events one replay load pulls. A heavy session
// records a few thousand events; this protects against pathological logs
// while staying far above anything a real student produces.
const MAX_EVENTS = 20_000

// One-time fetch of a submission's full recorded trace, oldest first.
// Lives under the submission doc, so the class teacher's read permission
// is inherited and the single-field orderBy needs no composite index.
export async function getSubmissionEvents(
  classId: string,
  assignmentId: string,
  studentUid: string,
): Promise<ReplayEvent[]> {
  const col = collection(
    getDb(),
    'classes', classId,
    'assignments', assignmentId,
    'submissions', studentUid,
    'events',
  )
  const snap = await getDocs(query(col, orderBy('clientTs', 'asc'), limit(MAX_EVENTS)))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      type: String(data.type ?? ''),
      payload: (data.payload ?? {}) as Record<string, unknown>,
      clientTs: Number(data.clientTs ?? 0),
      sessionId: String(data.sessionId ?? ''),
    }
  })
}
