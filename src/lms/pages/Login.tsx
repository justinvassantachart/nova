import { useNavigate } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import {
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/shared/firebase/auth'
import { humanizeAuthError } from '@/shared/firebase/errors'
import { useAuth } from '@/shared/context/AuthProvider'

type Mode = 'signin' | 'signup'

export default function Login() {
  const { user, loading, configured } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)

  useEffect(() => {
    if (loading) return
    if (user) navigate('/dashboard', { replace: true })
  }, [user, loading, navigate])

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

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setResetSent(false)
    setPopupBlocked(false)
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setResetSent(false)
    setPopupBlocked(false)
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password, displayName)
      }
    } catch (err) {
      setError(humanizeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  // Sync (not async) so the call stack from the click event reaches
  // signInWithGoogle → openBridge → window.open without any `await`
  // microtask boundary in between. That preserves the click's transient
  // user activation, which is what most browsers require to allow a
  // popup through, even when the user has popups globally restricted.
  function handleGoogle() {
    setError(null)
    setResetSent(false)
    setPopupBlocked(false)
    setBusy(true)
    signInWithGoogle()
      .catch((err) => {
        if (isPopupBlocked(err)) {
          setPopupBlocked(true)
        } else {
          setError(humanizeAuthError(err))
        }
      })
      .finally(() => setBusy(false))
  }

  function handleForgot() {
    setError(null)
    setResetSent(false)
    setPopupBlocked(false)
    if (!email.trim()) {
      setError('Enter your email above first.')
      return
    }
    setBusy(true)
    resetPassword(email.trim())
      .then(() => setResetSent(true))
      .catch((err) => {
        if (isPopupBlocked(err)) {
          setPopupBlocked(true)
        } else {
          setError(humanizeAuthError(err))
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-center">Nova</h1>

        <div role="tablist" aria-label="Authentication method" className="flex gap-1 p-1 bg-muted/50 rounded-md">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            aria-controls="auth-form"
            onClick={() => switchMode('signin')}
            className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
              mode === 'signin'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            aria-controls="auth-form"
            onClick={() => switchMode('signup')}
            className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
              mode === 'signup'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create account
          </button>
        </div>

        <form id="auth-form" role="tabpanel" onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <input
              type="text"
              aria-label="Display name (optional)"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              disabled={busy}
              className="px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
            />
          )}
          <input
            type="email"
            aria-label="Email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
            disabled={busy}
            className="px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
          />
          <input
            type="password"
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 6 : undefined}
            disabled={busy}
            className="px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
          />
          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleForgot}
              disabled={busy}
              className="self-end text-xs text-muted-foreground hover:underline disabled:opacity-50"
            >
              Forgot password?
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {resetSent && (
          <div className="text-xs text-center text-emerald-600 dark:text-emerald-400">
            Password reset email sent. Check your inbox.
          </div>
        )}
        {popupBlocked && (
          <div className="text-xs p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            Pop-ups are blocked for this site. Allow them (look for the blocked-pop-up icon in
            your address bar, or open site settings), then{' '}
            <button onClick={handleGoogle} className="underline font-semibold">
              click here to retry
            </button>
            .
          </div>
        )}
        {error && (
          <div className="text-xs text-center text-red-500">{error}</div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <span>or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="px-4 py-2 rounded-md border bg-background text-sm hover:bg-muted disabled:opacity-50"
        >
          Continue with Google
        </button>

        <a className="text-xs underline text-muted-foreground text-center" href="/ide">
          or use the standalone IDE
        </a>
      </div>
    </div>
  )
}

function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

// Two distinct popup-blocked paths lead here:
//   - `nova/popup-blocked`  → the bridge TAB itself was blocked. We threw
//     this from openBridge when window.open returned null.
//   - `auth/popup-blocked`  → Firebase's signInWithPopup INSIDE the bridge
//     was blocked (the OAuth popup to accounts.google.com). The bridge
//     forwards Firebase's code in its failure broadcast.
// Same user remediation either way: allow-list pop-ups for this site,
// then retry. So both render the same amber banner.
function isPopupBlocked(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'nova/popup-blocked' || code === 'auth/popup-blocked'
}

