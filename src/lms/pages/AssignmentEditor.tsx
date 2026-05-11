import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import App from '@/App'
import { IDEHostProvider } from '@/ide-host-context'
import type { IDEHost } from '@/ide-host'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAssignment } from '@/lms/hooks/useAssignments'
import {
  saveStarterFiles,
  updateAssignmentMeta,
} from '@/shared/firebase/assignments'
import { useAuth } from '@/shared/context/AuthProvider'
import { useFirestoreEventSink } from '@/shared/analytics/useFirestoreEventSink'

export default function AssignmentEditor() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { assignment, loading } = useAssignment(id)
  const navigate = useNavigate()

  // Local mirrors for the title/description so typing is responsive;
  // patch back to Firestore on blur.
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const initialized = useRef(false)
  useEffect(() => {
    if (!assignment || initialized.current) return
    setTitle(assignment.title)
    setDesc(assignment.description ?? '')
    initialized.current = true
  }, [assignment])

  const onEvent = useFirestoreEventSink({ uid: user?.uid, assignmentId: id })

  // Host context for the IDE: edits to /workspace flow back into
  // assignment.starterFiles on a 2s debounce (handled in App.tsx).
  const host = useMemo<IDEHost | null>(() => {
    if (!assignment || !id) return null
    return {
      mode: 'teacher-edit',
      assignmentId: id,
      initialFiles: assignment.starterFiles,
      onWorkspaceChange: (files) => {
        saveStarterFiles(id, files).catch((e) => console.warn('[AssignmentEditor] save failed', e))
      },
      onEvent,
    }
    // We intentionally only seed initialFiles once (on first load); ignore later updates
    // from snapshot to avoid stomping the teacher's in-flight edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, assignment !== null])

  if (!user) return null
  if (loading) return <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  if (!assignment) return <div className="p-6 text-sm">Assignment not found. <a className="underline" onClick={() => navigate('/teacher')}>Back</a></div>
  if (assignment.teacherUid !== user.uid) {
    return <div className="p-6 text-sm">You don't own this assignment.</div>
  }

  async function togglePublish() {
    if (!id || !assignment) return
    await updateAssignmentMeta(id, { published: !assignment.published })
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center gap-3">
        <button onClick={() => navigate('/teacher')} className="text-sm underline">
          ← Back
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => id && title !== assignment.title && updateAssignmentMeta(id, { title })}
          placeholder="Assignment title"
          className="font-semibold bg-transparent border-b border-transparent focus:border-border outline-none px-1"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => id && desc !== assignment.description && updateAssignmentMeta(id, { description: desc })}
          placeholder="Short description (shown to students)"
          className="flex-1 text-sm bg-transparent border-b border-transparent focus:border-border outline-none px-1"
        />
        <button
          onClick={togglePublish}
          className={
            'px-3 py-1 rounded-md text-xs ' +
            (assignment.published
              ? 'bg-green-600/20 text-green-300 border border-green-700'
              : 'bg-muted text-muted-foreground border')
          }
        >
          {assignment.published ? 'Published' : 'Unpublished'}
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
