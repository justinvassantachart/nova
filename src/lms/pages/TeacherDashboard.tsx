import { useNavigate } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/AuthProvider'
import { useMyAssignments } from '@/lms/hooks/useAssignments'
import { createAssignment, deleteAssignment } from '@/shared/firebase/assignments'

export default function TeacherDashboard() {
  const { user } = useAuth()
  const { list, loading } = useMyAssignments(user?.uid)
  const navigate = useNavigate()

  async function handleNew() {
    if (!user) return
    const id = await createAssignment(user.uid)
    navigate(`/teacher/assignments/${id}`)
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    await deleteAssignment(id)
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <h1 className="font-semibold">Nova · Teacher</h1>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Your assignments</h2>
            <button
              onClick={handleNew}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
            >
              New assignment
            </button>
          </div>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && list.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No assignments yet. Click "New assignment" to create one.
            </p>
          )}
          <ul className="space-y-2">
            {list.map((a) => (
              <li
                key={a.id}
                className="border rounded-md p-3 flex items-center justify-between hover:bg-accent/30"
              >
                <button
                  onClick={() => navigate(`/teacher/assignments/${a.id}`)}
                  className="text-left flex-1"
                >
                  <div className="font-medium">{a.title || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.published ? 'Published' : 'Draft'} ·{' '}
                    {Object.keys(a.starterFiles ?? {}).length} file
                    {Object.keys(a.starterFiles ?? {}).length === 1 ? '' : 's'}
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(a.id, a.title)}
                  className="text-xs text-destructive hover:underline ml-3"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}
