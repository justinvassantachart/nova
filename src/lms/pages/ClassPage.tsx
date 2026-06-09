import { useNavigate, useParams } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/auth-context'
import { useClass, useClassMembers } from '@/lms/hooks/useClasses'
import { useClassAssignments } from '@/lms/hooks/useAssignments'
import { createAssignment, deleteAssignment } from '@/shared/firebase/assignments'
import { leaveClass, removeMember } from '@/shared/firebase/classes'

export default function ClassPage() {
  const { classId } = useParams<{ classId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { klass, loading: cLoading } = useClass(classId)

  const isTeacher = !!(klass && user && klass.teacherUid === user.uid)

  if (cLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!klass) {
    return (
      <div className="p-6 text-sm">
        Class not found.{' '}
        <button className="underline" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </div>
    )
  }
  if (!classId) return null

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/dashboard')} className="text-sm underline shrink-0">
            ← Back
          </button>
          <div className="min-w-0">
            <div className="font-semibold truncate">{klass.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {isTeacher ? 'You teach this class' : `Taught by ${klass.teacherDisplayName}`}
            </div>
          </div>
        </div>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        {isTeacher ? (
          <TeacherView classId={classId} klass={klass} />
        ) : (
          <StudentView classId={classId} userUid={user?.uid} />
        )}
      </main>
    </div>
  )
}

function TeacherView({ classId, klass }: { classId: string; klass: import('@/shared/types').Class }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { list: assignments, loading: aLoading } = useClassAssignments(classId)
  const { list: members, loading: mLoading } = useClassMembers(classId)

  async function handleNew() {
    if (!user) return
    const id = await createAssignment({ classId, teacherUid: user.uid })
    navigate(`/classes/${classId}/assignments/${id}`)
  }

  async function handleDeleteAssignment(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    await deleteAssignment(classId, id)
  }

  async function handleRemoveMember(uid: string, name: string) {
    if (!confirm(`Remove ${name} from class?`)) return
    await removeMember(classId, uid)
  }

  async function copyInvite() {
    const url = `${location.origin}/join/${klass.inviteCode}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      prompt('Copy this invite link:', url)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {klass.description && (
        <p className="text-sm text-muted-foreground">{klass.description}</p>
      )}

      <section className="border rounded-md p-4 space-y-2">
        <div className="text-sm font-medium">Invite students</div>
        <div className="flex items-center gap-3">
          <code className="text-2xl font-mono tracking-widest px-3 py-1 bg-accent/30 rounded">
            {klass.inviteCode}
          </code>
          <button
            onClick={copyInvite}
            className="px-3 py-1.5 rounded-md border text-xs hover:bg-accent"
          >
            Copy invite link
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          Students can join at <code>/join/{klass.inviteCode}</code> or enter the code at <code>/join</code>.
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Assignments</h2>
          <button
            onClick={handleNew}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            New assignment
          </button>
        </div>
        {aLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!aLoading && assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No assignments yet. Click "New assignment" to create one.
          </p>
        )}
        <ul className="space-y-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="border rounded-md p-3 flex items-center justify-between hover:bg-accent/30"
            >
              <button
                onClick={() => navigate(`/classes/${classId}/assignments/${a.id}`)}
                className="text-left flex-1"
              >
                <div className="font-medium">{a.title || 'Untitled'}</div>
                <div className="text-xs text-muted-foreground">
                  {a.published ? 'Published' : 'Draft'} ·{' '}
                  {Object.keys(a.starterFiles ?? {}).length} starter file
                  {Object.keys(a.starterFiles ?? {}).length === 1 ? '' : 's'}
                </div>
              </button>
              <button
                onClick={() => handleDeleteAssignment(a.id, a.title)}
                className="text-xs text-destructive hover:underline ml-3"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Students ({members.length})</h2>
        {mLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!mLoading && members.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No students yet. Share the invite code above.
          </p>
        )}
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.uid}
              className="border rounded-md p-3 flex items-center justify-between text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{m.displayName || m.email}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
              <button
                onClick={() => handleRemoveMember(m.uid, m.displayName || m.email)}
                className="text-xs text-destructive hover:underline ml-3"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function StudentView({ classId, userUid }: { classId: string; userUid: string | undefined }) {
  const navigate = useNavigate()
  const { list: assignments, loading } = useClassAssignments(classId, { publishedOnly: true })

  async function handleLeave() {
    if (!userUid) return
    if (!confirm('Leave this class? You can rejoin with the invite code.')) return
    await leaveClass(classId, userUid)
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Assignments</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No assignments yet. Check back later.
          </p>
        )}
        <ul className="space-y-2">
          {assignments.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => navigate(`/classes/${classId}/assignments/${a.id}`)}
                className="w-full text-left border rounded-md p-3 hover:bg-accent/30"
              >
                <div className="font-medium">{a.title || 'Untitled'}</div>
                {a.description && (
                  <div className="text-xs text-muted-foreground mt-1">{a.description}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="pt-4">
        <button
          onClick={handleLeave}
          className="text-xs text-destructive hover:underline"
        >
          Leave class
        </button>
      </div>
    </div>
  )
}
