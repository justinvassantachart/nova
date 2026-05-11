import { useNavigate } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { usePublishedAssignments } from '@/lms/hooks/useAssignments'

export default function StudentDashboard() {
  const { list, loading } = usePublishedAssignments()
  const navigate = useNavigate()
  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <h1 className="font-semibold">Nova · Student</h1>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-lg font-medium">Assignments</h2>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && list.length === 0 && (
            <p className="text-sm text-muted-foreground">No assignments published yet.</p>
          )}
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => navigate(`/student/assignments/${a.id}`)}
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
        </div>
      </main>
    </div>
  )
}
