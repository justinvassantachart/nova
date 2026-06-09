import { useNavigate } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/auth-context'
import { useTeachingClasses, useMyMemberships } from '@/lms/hooks/useClasses'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { list: teaching, loading: tLoading } = useTeachingClasses(user?.uid)
  const { list: enrolled, loading: eLoading } = useMyMemberships(user?.uid)

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <h1 className="font-semibold">Nova</h1>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Classes you teach</h2>
              <button
                onClick={() => navigate('/classes/new')}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
              >
                Create class
              </button>
            </div>
            {tLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!tLoading && teaching.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You haven't created any classes yet.
              </p>
            )}
            <ul className="space-y-2">
              {teaching.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate(`/classes/${c.id}`)}
                    className="w-full text-left border rounded-md p-3 hover:bg-accent/30"
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Invite code: <span className="font-mono">{c.inviteCode}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Classes you're in</h2>
              <button
                onClick={() => navigate('/join')}
                className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent"
              >
                Join class
              </button>
            </div>
            {eLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!eLoading && enrolled.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You haven't joined any classes yet. Ask your teacher for an invite code.
              </p>
            )}
            <ul className="space-y-2">
              {enrolled.map((m) => (
                <li key={m.classId}>
                  <button
                    onClick={() => navigate(`/classes/${m.classId}`)}
                    className="w-full text-left border rounded-md p-3 hover:bg-accent/30"
                  >
                    <div className="font-medium">{m.className}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {m.teacherDisplayName}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  )
}
