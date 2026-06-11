import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/auth-context'
import { useClass } from '@/lms/hooks/useClasses'
import { useAssignment } from '@/lms/hooks/useAssignments'
import { useStudentSubmission } from '@/lms/hooks/useSubmission'
import { getSubmissionEvents } from '@/shared/firebase/replay'
import { buildSessions } from '@/replay/reconstruct'
import { SessionPicker } from '@/replay/SessionPicker'
import { SessionReplay } from '@/replay/SessionReplay'
import type { ReplaySession } from '@/replay/types'

// Teacher-only replay of a student's recorded work sessions. The page owns
// Firestore loading + auth; the viewer (src/replay) is a pure component
// over plain event data and knows nothing about the LMS.
export default function ReplayPage() {
  const { classId, assignmentId, studentUid } = useParams<{
    classId: string
    assignmentId: string
    studentUid: string
  }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { klass, loading: cLoading } = useClass(classId)
  const { assignment, loading: aLoading } = useAssignment(classId, assignmentId)
  const { submission } = useStudentSubmission(classId, assignmentId, studentUid)

  // Keyed snapshot (see useClasses.ts for the pattern): loading derives
  // from a key mismatch, so switching students never needs a synchronous
  // setState-in-effect reset.
  const key = classId && assignmentId && studentUid
    ? `${classId}/${assignmentId}/${studentUid}`
    : undefined
  const [snap, setSnap] = useState<
    { key: string; sessions: ReplaySession[] | null; error: string } | null
  >(null)
  const [sessionId, setSessionId] = useState('')

  useEffect(() => {
    if (!classId || !assignmentId || !studentUid || !key) return
    let cancelled = false
    getSubmissionEvents(classId, assignmentId, studentUid)
      .then((events) => {
        if (!cancelled) setSnap({ key, sessions: buildSessions(events), error: '' })
      })
      .catch((e) => {
        if (!cancelled) {
          setSnap({
            key,
            sessions: null,
            error: e instanceof Error ? e.message : 'Failed to load events',
          })
        }
      })
    return () => { cancelled = true }
  }, [classId, assignmentId, studentUid, key])

  const fresh = snap !== null && snap.key === key
  const sessions = fresh ? snap.sessions : null
  const error = fresh ? snap.error : ''

  // Default to the most recent session — usually the one being graded.
  const session = useMemo(
    () => sessions?.find((s) => s.sessionId === sessionId) ?? sessions?.[sessions.length - 1],
    [sessions, sessionId],
  )

  if (cLoading || aLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!klass || !assignment || !classId || !assignmentId || !studentUid) {
    return (
      <div className="p-6 text-sm">
        Not found.{' '}
        <button className="underline" onClick={() => navigate('/dashboard')}>
          Back
        </button>
      </div>
    )
  }
  if (!user || klass.teacherUid !== user.uid) {
    return <div className="p-6 text-sm">Only the teacher of this class can view session replays.</div>
  }

  const studentName =
    submission?.studentDisplayName || submission?.studentEmail || studentUid

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center gap-3">
        <button
          onClick={() =>
            navigate(`/classes/${classId}/assignments/${assignmentId}/submissions/${studentUid}`)
          }
          className="text-sm underline shrink-0"
        >
          ← Submission
        </button>
        <div className="min-w-0">
          <div className="font-semibold truncate">{studentName} — session replay</div>
          <div className="text-xs text-muted-foreground truncate">{assignment.title}</div>
        </div>
        <div className="flex-1" />
        <UserMenu />
      </header>

      <div className="flex-1 min-h-0">
        {error && (
          <div className="p-6 text-sm text-destructive">Couldn't load the recording: {error}</div>
        )}
        {!error && sessions === null && (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading recorded sessions…
          </div>
        )}
        {!error && sessions !== null && sessions.length === 0 && (
          <div className="h-full flex items-center justify-center px-8 text-center">
            <p className="text-sm text-muted-foreground max-w-md">
              No recorded sessions for this submission yet. Sessions are captured
              automatically while the student works on the assignment.
            </p>
          </div>
        )}
        {!error && session && (
          <SessionReplay
            events={session.events}
            header={
              <SessionPicker
                sessions={sessions ?? []}
                value={session.sessionId}
                onChange={setSessionId}
              />
            }
          />
        )}
      </div>
    </div>
  )
}
