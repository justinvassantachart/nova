import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { zipSync, strToU8 } from 'fflate'
import App from '@/App'
import { IDEHostProvider } from '@/ide-host-context'
import { AssignmentInfoProvider } from '@/components/sidebar/assignment-info-context'
import type { IDEHost, AssignmentInfo } from '@/ide-host'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/AuthProvider'
import { useClass } from '@/lms/hooks/useClasses'
import { useAssignment } from '@/lms/hooks/useAssignments'
import { useAssignmentSubmissions, useSubmission } from '@/lms/hooks/useSubmission'
import {
  saveStarterFiles,
  updateAssignmentMeta,
} from '@/shared/firebase/assignments'
import {
  markSubmitted,
  saveSubmissionFiles,
} from '@/shared/firebase/submissions'
import { useFirestoreEventSink } from '@/shared/analytics/useFirestoreEventSink'

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
  assignment: import('@/shared/types').Assignment
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'starter' | 'submissions'>('starter')

  const onEvent = useFirestoreEventSink({ uid: user?.uid, assignmentId })

  // Host identity is frozen on first mount so live Firestore updates to
  // starterFiles don't reseed the IDE and clobber teacher edits.
  const host = useMemo<IDEHost>(() => ({
    mode: 'teacher-edit',
    assignmentId,
    initialFiles: assignment.starterFiles,
    onWorkspaceChange: (files) =>
      saveStarterFiles(classId, assignmentId, files).catch((e) =>
        console.warn('[AssignmentPage] save starter failed', e),
      ),
    onEvent,
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

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-3 py-1 flex items-center gap-3 h-10">
        <button
          onClick={() => navigate(`/classes/${classId}`)}
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          ← Back to class
        </button>
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
          <SubmissionsList classId={classId} assignmentId={assignmentId} />
        )}
      </div>
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

function SubmissionsList({
  classId,
  assignmentId,
}: {
  classId: string
  assignmentId: string
}) {
  const navigate = useNavigate()
  const { list, loading } = useAssignmentSubmissions(classId, assignmentId)

  function fmt(ts?: { toDate(): Date } | null) {
    if (!ts || typeof ts.toDate !== 'function') return '—'
    return ts.toDate().toLocaleString()
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No student work yet. Students see this assignment once it's published.
          </p>
        )}
        <ul className="space-y-2">
          {list.map((s) => (
            <li key={s.studentUid}>
              <button
                onClick={() =>
                  navigate(
                    `/classes/${classId}/assignments/${assignmentId}/submissions/${s.studentUid}`,
                  )
                }
                className="w-full text-left border rounded-md p-3 hover:bg-accent/30 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {s.studentDisplayName || s.studentEmail || s.studentUid}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Last edit: {fmt(s.updatedAt)}
                    {s.submittedAt && <> · Submitted: {fmt(s.submittedAt)}</>}
                  </div>
                </div>
                {s.submittedAt ? (
                  <span className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-300 border border-green-700 shrink-0">
                    Submitted
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded border text-muted-foreground shrink-0">
                    In progress
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function downloadZip(filename: string, files: Record<string, string>) {
  const tree: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    const clean = path.replace(/^\/workspace\//, '').replace(/^\//, '')
    tree[clean || 'main.cpp'] = strToU8(content)
  }
  const zipped = zipSync(tree)
  const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function StudentView({
  classId,
  assignmentId,
  assignment,
}: {
  classId: string
  assignmentId: string
  assignment: import('@/shared/types').Assignment
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
      mode: 'student-work',
      assignmentId,
      submissionId: user.uid,
      initialFiles: submission.files,
      onWorkspaceChange: (files) =>
        saveSubmissionFiles(classId, assignmentId, user.uid, files).catch((e) =>
          console.warn('[AssignmentPage] save submission failed', e),
        ),
      onEvent,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, assignmentId, user?.uid, submission?.assignmentId])

  const handleSubmit = async () => {
    if (!user) return
    setSubmitting(true)
    try {
      await markSubmitted(classId, assignmentId, user.uid)
    } finally {
      setSubmitting(false)
    }
  }

  const submitted = submission?.submittedAt != null

  const assignmentInfo = useMemo<AssignmentInfo>(() => ({
    title: assignment.title,
    description: assignment.description ?? '',
    isTeacher: false,
    submitted,
    onSubmit: submitting ? undefined : handleSubmit,
    onDownload: submission?.files
      ? () => downloadZip(`${assignment.title || 'submission'}.zip`, submission.files)
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
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          ← Back to class
        </button>
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
