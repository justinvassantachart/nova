import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserMenu } from '@/lms/components/UserMenu'
import { useAuth } from '@/shared/context/auth-context'
import { getClassByInviteCode, joinClass } from '@/shared/firebase/classes'
import type { Class } from '@/shared/types'

export default function JoinClass() {
  const { code: codeParam } = useParams<{ code?: string }>()
  const { user, appUser } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState(codeParam?.toUpperCase() ?? '')
  const [klass, setKlass] = useState<Class | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const [joining, setJoining] = useState(false)

  // If a code was passed in the URL, look it up immediately.
  useEffect(() => {
    if (!codeParam) return
    void lookup(codeParam.toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam])

  async function lookup(c: string) {
    setLooking(true)
    setError(null)
    setKlass(null)
    try {
      const found = await getClassByInviteCode(c)
      if (!found) {
        setError(`No class found for code "${c}".`)
        return
      }
      if (user && found.teacherUid === user.uid) {
        setError("You're the teacher of this class — you're already in it.")
        return
      }
      setKlass(found)
    } catch (e) {
      console.warn('[JoinClass] lookup failed', e)
      setError('Lookup failed. Try again.')
    } finally {
      setLooking(false)
    }
  }

  async function handleJoin() {
    if (!user || !klass) return
    setJoining(true)
    try {
      await joinClass({
        classId: klass.id,
        className: klass.name,
        teacherDisplayName: klass.teacherDisplayName,
        uid: user.uid,
        email: appUser?.email ?? user.email ?? '',
        displayName: appUser?.displayName || user.displayName || user.email || 'Student',
      })
      navigate(`/classes/${klass.id}`, { replace: true })
    } catch (e) {
      console.warn('[JoinClass] join failed', e)
      setError('Could not join class. Try again.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <button onClick={() => navigate('/dashboard')} className="text-sm underline">
          ← Back
        </button>
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-md mx-auto space-y-4">
          <h2 className="text-lg font-medium">Join a class</h2>
          {!klass && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) void lookup(code.trim().toUpperCase())
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="text-sm font-medium">Class code</label>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-transparent font-mono tracking-widest uppercase"
                  maxLength={8}
                />
              </div>
              <button
                type="submit"
                disabled={!code.trim() || looking}
                className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
              >
                {looking ? 'Looking up…' : 'Find class'}
              </button>
            </form>
          )}

          {klass && (
            <div className="space-y-3 border rounded-md p-4">
              <div>
                <div className="text-xs text-muted-foreground">Class</div>
                <div className="font-medium">{klass.name}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Teacher</div>
                <div className="text-sm">{klass.teacherDisplayName}</div>
              </div>
              {klass.description && (
                <div>
                  <div className="text-xs text-muted-foreground">About</div>
                  <div className="text-sm">{klass.description}</div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {joining ? 'Joining…' : 'Join class'}
                </button>
                <button
                  onClick={() => {
                    setKlass(null)
                    setCode('')
                  }}
                  className="px-3 py-2 rounded-md border text-sm hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
      </main>
    </div>
  )
}
