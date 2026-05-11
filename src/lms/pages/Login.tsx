import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { signInWithGoogle } from '@/shared/firebase/auth'
import { useAuth } from '@/shared/context/AuthProvider'

export default function Login() {
  const { user, appUser, loading, configured } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (user && appUser) {
      if (!appUser.role) navigate('/role', { replace: true })
      else navigate(appUser.role === 'teacher' ? '/teacher' : '/student', { replace: true })
    }
  }, [user, appUser, loading, navigate])

  if (!configured) {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-6">
        <div className="max-w-md text-sm space-y-2">
          <h1 className="text-xl font-semibold">Firebase not configured</h1>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Firebase
            project's web config. See <code>README.md</code> for setup instructions.
          </p>
          <p>
            You can still use the standalone IDE at <a className="underline" href="/ide">/ide</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold">Nova</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue</p>
        <button
          onClick={() => signInWithGoogle()}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
        >
          Sign in with Google
        </button>
        <a className="text-xs underline text-muted-foreground" href="/ide">
          or use the standalone IDE
        </a>
      </div>
    </div>
  )
}
