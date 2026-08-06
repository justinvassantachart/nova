import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import App from '@/App'
import { IDEHostProvider } from '@/ide-host-context'
import { AssignmentInfoProvider } from '@/components/sidebar/assignment-info-context'
import type { IDEHost, AssignmentInfo } from '@/ide-host'
import { UserMenu } from '@/lms/components/UserMenu'
import { AssignmentEditDialog } from '@/lms/components/AssignmentEditDialog'
import { SubmissionStatusChip } from '@/lms/components/SubmissionStatusChip'
import { useAuth } from '@/shared/context/auth-context'
import { useClass, useClassMembers } from '@/lms/hooks/useClasses'
import { useAssignment } from '@/lms/hooks/useAssignments'
import { useAssignmentSubmissions, useSubmission } from '@/lms/hooks/useSubmission'
import {
  saveStarterFiles,
  updateAssignmentMeta,
} from '@/shared/firebase/assignments'
import {
  getAllSubmissions,
  markSubmitted,
  saveSubmissionFiles,
} from '@/shared/firebase/submissions'
import { useFirestoreEventSink } from '@/shared/analytics/useFirestoreEventSink'
import { downloadFilesZip, downloadSubmissionsZip } from '@/lms/zip'
import { dueLabel, editedAfterSubmit, fmtDateTime, isLate } from '@/lms/format'
import type { Assignment, ClassMember, Submission } from '@/shared/types'

export default function AssignmentPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>()
  const { user } = useAuth()
  const { klass, loading: cLoading } = useClass(classId)
  const { assignment, loading: aLoading } = useAssignment(classId, assignmentId)
  const navigate = useNavigate()

  if (cLoading || aLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!klass || !assignment || !classId || !assignmentId) {
    return (
      <div className="p-6 text-sm">
        Assignment not found.{' '}
        <button className="underline" onClick={() => navigate('/dashboard')}>
          Back
        </button>
      </div>
    )
  }
  if (!user) return null

  const isTeacher = klass.teacherUid === user.uid
  if (isTeacher) {
    return <TeacherView classId={classId} assignmentId={assignmentId} assignment={assignment} />
  }
  if (!assignment.published) {
    return <div className="p-6 text-sm">This assignment is not available.</div>
  }
  return <StudentView classId={classId} assignmentId={assignmentId} assignment={assignment} />
}

function TeacherView({
  classId,
  assignmentId,
  assignment,
}: {
  classId: string
  assignmentId: string
  assignment: Assignment
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'starter' | 'submissions'>('starter')
  const [editing, setEditing] = useState(false)

  const onEvent = useFirestoreEventSink({ uid: user?.uid, assignmentId })

  // Host identity is frozen on first mount so live Firestore updates to
  // starterFiles don't reseed the IDE and clobber teacher edits.
  const host = useMemo<IDEHost>(() => ({
    workspace: {
      id: `assignment:${assignmentId}`,
      initialFiles: assignment.starterFiles,
      persistence: {
        save: (files) =>
          saveStarterFiles(classId, assignmentId, files).catch((e) =>
            console.warn('[AssignmentPage] save starter failed', e),
          ),
      },
    },
    events: { emit: onEvent },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [classId, assignmentId])

  // Assignment metadata is a separate context — it can re-render freely
  // on every Firestore push without disturbing the host channel.
  const assignmentInfo = useMemo<AssignmentInfo>(() => ({
    title: assignment.title,
    description: assignment.description ?? '',
    isTeacher: true,
    published: assignment.published,
    onTogglePublish: () => {
      void updateAssignmentMeta(classId, assignmentId, { published: !assignment.published })
    },
    onTitleChange: (title) => {
      void updateAssignmentMeta(classId, assignmentId, { title })
    },
    onDescriptionChange: (description) => {
      void updateAssignmentMeta(classId, assignmentId, { description })
    },
  }), [assignment.title, assignment.description, assignment.published, classId, assignmentId])

  const due = dueLabel(assignment.dueDate)

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-3 py-1 flex items-center gap-3 h-10">
        <button
          onClick={() => navigate(`/classes/${classId}`)}
          className="text-sm underline text-muted-foreground hover:text-foreground shrink-0"
        >
          ← Back to class
        </button>
        <div className="min-w-0 flex items-center gap-2 text-sm">
          <span className="font-medium truncate">{assignment.title || 'Untitled'}</span>
          <span
            className={
              'text-[11px] px-2 py-0.5 rounded-full border shrink-0 ' +
              (assignment.published
                ? 'bg-green-600/15 text-green-500 border-green-700/50'
                : 'text-muted-foreground border-border')
            }
          >
            {assignment.published ? 'Published' : 'Draft'}
          </span>
          {due && <span className="text-xs text-muted-foreground shrink-0">{due}</span>}
          <button
            onClick={() => setEditing(true)}
            className="text-xs underline text-muted-foreground hover:text-foreground shrink-0"
          >
            Edit details
          </button>
        </div>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>
      <div className="border-b px-4 flex items-center gap-1 text-sm">
        <TabButton active={tab === 'starter'} onClick={() => setTab('starter')}>
          Starter files
        </TabButton>
        <TabButton active={tab === 'submissions'} onClick={() => setTab('submissions')}>
          Submissions
        </TabButton>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'starter' && (
          <IDEHostProvider host={host}>
            <AssignmentInfoProvider info={assignmentInfo}>
              <App />
            </AssignmentInfoProvider>
          </IDEHostProvider>
        )}
        {tab === 'submissions' && (
          <SubmissionsList classId={classId} assignmentId={assignmentId} assignment={assignment} />
        )}
      </div>
      {editing && (
        <AssignmentEditDialog
          classId={classId}
          assignment={assignment}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 border-b-2 ' +
        (active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  )
}

// Failures from one-shot click actions surface as native alerts, matching
// the LMS's confirm()-based dialogs.
async function runOrAlert(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    alert(`${label} failed: ${e instanceof Error ? e.message : 'unknown error'}`)
  }
}

type RosterRow = {
  uid: string
  name: string
  email: string
  submission: Submission | null
  enrolled: boolean
}

// Gradescope-style roster view: one row per enrolled student (including
// the ones who never opened the assignment), plus any submissions from
// since-removed students so no work is ever hidden.
function buildRoster(members: ClassMember[], submissions: Submission[]): RosterRow[] {
  const byUid = new Map(submissions.map((s) => [s.studentUid, s]))
  const rows: RosterRow[] = members.map((m) => ({
    uid: m.uid,
    name: m.displayName || m.email || m.uid,
    email: m.email,
    submission: byUid.get(m.uid) ?? null,
    enrolled: true,
  }))
  const memberUids = new Set(members.map((m) => m.uid))
  for (const s of submissions) {
    if (!memberUids.has(s.studentUid)) {
      rows.push({
        uid: s.studentUid,
        name: s.studentDisplayName || s.studentEmail || s.studentUid,
        email: s.studentEmail,
        submission: s,
        enrolled: false,
      })
    }
  }
  // Submitted first (most recent first), then in-progress, then not-started.
  const rank = (r: RosterRow) => (r.submission?.submittedAt ? 0 : r.submission ? 1 : 2)
  return rows.sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return a.name.localeCompare(b.name)
  })
}

function SubmissionsList({
  classId,
  assignmentId,
  assignment,
}: {
  classId: string
  assignmentId: string
  assignment: Assignment
}) {
  const navigate = useNavigate()
  const { list: submissions, loading: sLoading } = useAssignmentSubmissions(classId, assignmentId)
  const { list: members, loading: mLoading } = useClassMembers(classId)
  const [exporting, setExporting] = useState(false)

  const loading = sLoading || mLoading
  const roster = useMemo(() => buildRoster(members, submissions), [members, submissions])
  const submittedCount = submissions.filter((s) => s.submittedAt).length

  async function handleDownloadAll() {
    setExporting(true)
    try {
      await runOrAlert('Export', async () => {
        const all = await getAllSubmissions(classId, assignmentId)
        downloadSubmissionsZip(`${assignment.title || 'assignment'}-submissions.zip`, all)
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {submittedCount}/{members.length} submitted · {submissions.length} started
            </p>
            <button
              onClick={() => void handleDownloadAll()}
              disabled={exporting || submissions.length === 0}
              className="px-3 py-1.5 rounded-md border text-xs hover:bg-accent disabled:opacity-40"
            >
              {exporting ? 'Preparing…' : 'Download all (.zip)'}
            </button>
          </div>
        )}
        {!loading && roster.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No students enrolled yet. Share the class invite code first.
          </p>
        )}
        <ul className="space-y-2">
          {roster.map((row) => {
            const s = row.submission
            const open = s
              ? () =>
                  navigate(
                    `/classes/${classId}/assignments/${assignmentId}/submissions/${row.uid}`,
                  )
              : undefined
            return (
              <li
                key={row.uid}
                className={
                  'border rounded-md p-3 flex items-center justify-between gap-3 ' +
                  (s ? 'hover:bg-accent/30' : 'opacity-80')
                }
              >
                <button
                  onClick={open}
                  disabled={!open}
                  className="text-left flex-1 min-w-0 disabled:cursor-default"
                >
                  <div className="font-medium truncate">
                    {row.name}
                    {!row.enrolled && (
                      <span className="text-xs text-muted-foreground"> · no longer enrolled</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s ? (
                      <>
                        Last edit: {fmtDateTime(s.updatedAt)}
                        {s.submittedAt && <> · Submitted: {fmtDateTime(s.submittedAt)}</>}
                        {editedAfterSubmit(s.updatedAt, s.submittedAt) && (
                          <span className="text-amber-500"> · edited after submitting</span>
                        )}
                      </>
                    ) : (
                      'Has not opened this assignment'
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <SubmissionStatusChip
                    submitted={!!s?.submittedAt}
                    started={!!s}
                    late={isLate(s?.submittedAt, assignment.dueDate)}
                  />
                  {s && (
                    <>
                      <button
                        onClick={() =>
                          navigate(
                            `/classes/${classId}/assignments/${assignmentId}/submissions/${row.uid}/replay`,
                          )
                        }
                        title="Replay this student's recorded sessions"
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        Replay
                      </button>
                      <button
                        onClick={() =>
                          downloadFilesZip(
                            `${row.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}.zip`,
                            s.files ?? {},
                          )
                        }
                        title="Download this student's files"
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        Download
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function StudentView({
  classId,
  assignmentId,
  assignment,
}: {
  classId: string
  assignmentId: string
  assignment: Assignment
}) {
  const { user, appUser } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const { submission, loading } = useSubmission({
    classId,
    assignmentId,
    studentUid: user?.uid,
    studentDisplayName: appUser?.displayName || user?.displayName || '',
    studentEmail: appUser?.email || user?.email || '',
    starterFiles: assignment.starterFiles,
  })

  const onEvent = useFirestoreEventSink({
    uid: user?.uid,
    classId,
    assignmentId,
    submissionId: user?.uid,
  })

  // Build host once submission is ready. Freeze identity within a single
  // assignment so live Firestore updates (submittedAt, etc.) don't
  // re-bootstrap the IDE and clobber the student's in-progress edits.
  const host = useMemo<IDEHost | null>(() => {
    if (!user || !submission) return null
    if (submission.assignmentId !== assignmentId) return null
    return {
      workspace: {
        id: `submission:${assignmentId}:${user.uid}`,
        initialFiles: submission.files,
        persistence: {
          save: (files) =>
            saveSubmissionFiles(classId, assignmentId, user.uid, files).catch((e) =>
              console.warn('[AssignmentPage] save submission failed', e),
            ),
        },
      },
      // Recorded sessions need the full runtime trace (terminal output,
      // exits, pause locations) — that's what makes replay faithful.
      events: { emit: onEvent, includeRuntime: true },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, assignmentId, user?.uid, submission?.assignmentId])

  // Open every recorded trace with the workspace seed: replay reconstructs
  // file state from this snapshot plus the edit stream that follows.
  useEffect(() => {
    if (!host) return
    onEvent('session_start', {
      mode: 'student-work',
      files: host.workspace?.initialFiles ?? {},
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host])

  const handleSubmit = async () => {
    if (!user) return
    setSubmitting(true)
    try {
      await runOrAlert('Submitting', () => markSubmitted(classId, assignmentId, user.uid))
    } finally {
      setSubmitting(false)
    }
  }

  const submitted = submission?.submittedAt != null
  const due = dueLabel(assignment.dueDate)

  const assignmentInfo = useMemo<AssignmentInfo>(() => ({
    title: assignment.title,
    description: assignment.description ?? '',
    isTeacher: false,
    submitted,
    onSubmit: submitting ? undefined : handleSubmit,
    onDownload: submission?.files
      ? () => downloadFilesZip(`${assignment.title || 'submission'}.zip`, submission.files)
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [assignment.title, assignment.description, submitted, submission?.files, submitting])

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-3 py-1 flex items-center gap-3 h-10">
        <button
          onClick={() => navigate(`/classes/${classId}`)}
          className="text-sm underline text-muted-foreground hover:text-foreground shrink-0"
        >
          ← Back to class
        </button>
        <div className="min-w-0 flex items-center gap-2 text-sm">
          <span className="font-medium truncate">{assignment.title || 'Untitled'}</span>
          {due && <span className="text-xs text-muted-foreground shrink-0">{due}</span>}
          {submitted && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border bg-green-600/15 text-green-500 border-green-700/50 shrink-0">
              Submitted {fmtDateTime(submission?.submittedAt)}
            </span>
          )}
        </div>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>
      <div className="flex-1 min-h-0">
        {host && (
          <IDEHostProvider host={host}>
            <AssignmentInfoProvider info={assignmentInfo}>
              <App />
            </AssignmentInfoProvider>
          </IDEHostProvider>
        )}
      </div>
    </div>
  )
}
