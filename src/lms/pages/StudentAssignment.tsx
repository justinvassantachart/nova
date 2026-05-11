import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { zipSync, strToU8 } from 'fflate'
import App from '@/App'
import { IDEHostProvider } from '@/ide-host-context'
import type { IDEHost } from '@/ide-host'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/AuthProvider'
import { useAssignment } from '@/lms/hooks/useAssignments'
import { useSubmission } from '@/lms/hooks/useSubmission'
import {
  markSubmitted,
  saveSubmissionFiles,
  submissionId,
} from '@/shared/firebase/submissions'
import { useFirestoreEventSink } from '@/shared/analytics/useFirestoreEventSink'

function downloadZip(filename: string, files: Record<string, string>) {
  const tree: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    // strip leading /workspace/ for a cleaner zip
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

export default function StudentAssignment() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { assignment, loading: aLoading } = useAssignment(id)
  const { submission, loading: sLoading } = useSubmission(
    id,
    user?.uid,
    assignment?.starterFiles,
  )
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const subId = id && user ? submissionId(id, user.uid) : undefined
  const onEvent = useFirestoreEventSink({ uid: user?.uid, assignmentId: id, submissionId: subId })

  // Build host once submission is ready. We seed initialFiles with submission.files
  // (which on first load equals starterFiles). The IDE-side useEffect on host?.initialFiles
  // means changing the *identity* of the files object causes a re-bootstrap, so we
  // freeze it after first ready to avoid stomping ongoing edits.
  const host = useMemo<IDEHost | null>(() => {
    if (!id || !subId || !submission) return null
    return {
      mode: 'student-work',
      assignmentId: id,
      submissionId: subId,
      initialFiles: submission.files,
      onWorkspaceChange: (files) => {
        saveSubmissionFiles(subId, files).catch((e) =>
          console.warn('[StudentAssignment] save failed', e),
        )
      },
      onEvent,
    }
    // Freeze on first submission load — subsequent live updates (e.g. submittedAt
    // changes from Firestore) must not re-bootstrap and discard local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, subId, submission !== null])

  async function handleSubmit() {
    if (!subId) return
    setSubmitting(true)
    try {
      await markSubmitted(subId)
    } finally {
      setSubmitting(false)
    }
  }

  if (aLoading || sLoading) {
    return <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }
  if (!assignment) {
    return <div className="p-6 text-sm">Assignment not found. <a className="underline" onClick={() => navigate('/student')}>Back</a></div>
  }
  if (!assignment.published) {
    return <div className="p-6 text-sm">This assignment is no longer available.</div>
  }

  const submitted = submission?.submittedAt != null

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center gap-3">
        <button onClick={() => navigate('/student')} className="text-sm underline">
          ← Back
        </button>
        <div className="font-semibold">{assignment.title}</div>
        {assignment.description && (
          <div className="text-xs text-muted-foreground truncate">
            · {assignment.description}
          </div>
        )}
        <div className="flex-1" />
        {submitted && (
          <span className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-300 border border-green-700">
            Submitted
          </span>
        )}
        <button
          onClick={() => submission && downloadZip(`${assignment.title || 'submission'}.zip`, submission.files)}
          className="px-2 py-1 rounded-md border text-xs hover:bg-accent"
        >
          Download .zip
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
        >
          {submitted ? 'Re-submit' : 'Submit'}
        </button>
        <UserMenu />
      </header>
      <div className="flex-1 min-h-0">
        {host && (
          <IDEHostProvider host={host}>
            <App />
          </IDEHostProvider>
        )}
      </div>
    </div>
  )
}
