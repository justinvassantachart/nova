import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import App from '@/App'
import { IDEHostProvider } from '@/ide-host-context'
import { AssignmentInfoProvider } from '@/components/sidebar/assignment-info-context'
import type { IDEHost, AssignmentInfo } from '@/ide-host'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/auth-context'
import { useClass } from '@/lms/hooks/useClasses'
import { useAssignment } from '@/lms/hooks/useAssignments'
import { useStudentSubmission } from '@/lms/hooks/useSubmission'
import { downloadFilesZip } from '@/lms/zip'
import { editedAfterSubmit, fmtDateTime, isLate } from '@/lms/format'

// Teacher-only read-only view of a single student's submission. Renders the
// IDE with no onWorkspaceChange so any local edits are throw-away.
export default function SubmissionView() {
  const { classId, assignmentId, studentUid } = useParams<{
    classId: string
    assignmentId: string
    studentUid: string
  }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { klass, loading: cLoading } = useClass(classId)
  const { assignment, loading: aLoading } = useAssignment(classId, assignmentId)
  const { submission, loading: sLoading } = useStudentSubmission(classId, assignmentId, studentUid)

  // Freeze the IDE host within one student's submission so live Firestore
  // updates (e.g. submittedAt landing) don't re-bootstrap the workspace and
  // discard the teacher's scroll/selection. The dep deliberately tracks
  // `submission?.studentUid` rather than `submission !== null` — switching
  // students keeps `submission` non-null transiently with the previous
  // student's data, and we must wait for the fresh submission before
  // rebuilding the host (otherwise the new IDE mount seeds with the old
  // student's files).
  const host = useMemo<IDEHost | null>(() => {
    if (!submission || !assignmentId || !studentUid) return null
    if (submission.studentUid !== studentUid) return null
    return {
      mode: 'teacher-review',
      assignmentId,
      submissionId: studentUid,
      initialFiles: submission.files,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, studentUid, submission?.studentUid])

  const assignmentInfo = useMemo<AssignmentInfo | null>(() => {
    if (!assignment || !submission) return null
    return {
      title: assignment.title,
      description: [
        submission.studentDisplayName || submission.studentEmail || submission.studentUid,
        submission.submittedAt ? 'Submitted' : 'In progress',
      ].join(' · '),
      isTeacher: true,
      submitted: submission.submittedAt != null,
    }
  }, [assignment, submission])

  if (cLoading || aLoading || sLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!klass || !assignment) {
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
    return <div className="p-6 text-sm">Only the teacher of this class can view submissions.</div>
  }
  if (!submission) {
    return (
      <div className="h-screen w-screen flex flex-col">
        <header className="border-b px-4 py-2 flex items-center gap-3">
          <button
            onClick={() => navigate(`/classes/${classId}/assignments/${assignmentId}`)}
            className="text-sm underline"
          >
            ← Back to submissions
          </button>
          <UserMenu />
        </header>
        <div className="p-6 text-sm text-muted-foreground">
          This student hasn't opened the assignment yet.
        </div>
      </div>
    )
  }

  const submitted = submission.submittedAt != null

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => navigate(`/classes/${classId}/assignments/${assignmentId}`)}
          className="text-sm underline"
        >
          ← Submissions
        </button>
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {submission.studentDisplayName || submission.studentEmail || submission.studentUid}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {assignment.title} ·{' '}
            {submitted ? `Submitted ${fmtDateTime(submission.submittedAt)}` : 'In progress'}
            {isLate(submission.submittedAt, assignment.dueDate) && (
              <span className="text-amber-500"> · late</span>
            )}
            {editedAfterSubmit(submission.updatedAt, submission.submittedAt) && (
              <span className="text-amber-500"> · edited after submitting</span>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() =>
            downloadFilesZip(
              `${(submission.studentDisplayName || submission.studentUid).replace(/[^a-zA-Z0-9._-]+/g, '_')}.zip`,
              submission.files ?? {},
            )
          }
          className="px-3 py-1 rounded-md border text-xs hover:bg-accent"
        >
          Download .zip
        </button>
        <span className="text-xs text-muted-foreground">View-only</span>
        <UserMenu />
      </header>
      <div className="flex-1 min-h-0">
        {host && (
          <IDEHostProvider host={host}>
            {assignmentInfo ? (
              <AssignmentInfoProvider info={assignmentInfo}>
                <App />
              </AssignmentInfoProvider>
            ) : (
              <App />
            )}
          </IDEHostProvider>
        )}
      </div>
    </div>
  )
}
