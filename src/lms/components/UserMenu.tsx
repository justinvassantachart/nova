import { useEffect, useState } from 'react'
import { resendVerificationEmail, signOut } from '@/shared/firebase/auth'
import { humanizeAuthError } from '@/shared/firebase/errors'
import { useAuth } from '@/shared/context/auth-context'

type ResendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

// After a successful resend, give the user 30 seconds to check their
// inbox before re-enabling the button. Long enough to discourage
// spamming, short enough that they aren't locked out if delivery fails.
const RESEND_COOLDOWN_MS = 30_000

export function UserMenu() {
  const { user, appUser } = useAuth()
  const [resend, setResend] = useState<ResendState>({ kind: 'idle' })

  useEffect(() => {
    if (resend.kind !== 'sent') return
    const t = setTimeout(() => setResend({ kind: 'idle' }), RESEND_COOLDOWN_MS)
    return () => clearTimeout(t)
  }, [resend.kind])

  if (!appUser) return null

  // Google-signed-in users always have emailVerified = true. Email/password
  // users start unverified; we show an inline badge with a resend link
  // until they click the link in their inbox (after which their next
  // page load will surface emailVerified = true on the User object).
  const unverified = user && !user.emailVerified

  async function handleResend() {
    if (resend.kind === 'sending') return
    setResend({ kind: 'sending' })
    try {
      await resendVerificationEmail()
      setResend({ kind: 'sent' })
    } catch (err) {
      setResend({ kind: 'error', message: humanizeAuthError(err) })
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {unverified && (
        <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          <span>Unverified email</span>
          <span className="text-amber-600/40 dark:text-amber-400/40">·</span>
          {resend.kind === 'sent' ? (
            <span className="text-amber-700 dark:text-amber-300">Sent — check inbox</span>
          ) : resend.kind === 'error' ? (
            <button
              onClick={handleResend}
              title={resend.message}
              className="underline hover:no-underline text-red-600 dark:text-red-400"
            >
              Failed — retry
            </button>
          ) : (
            <button
              onClick={handleResend}
              disabled={resend.kind === 'sending'}
              className="underline hover:no-underline disabled:opacity-50"
            >
              {resend.kind === 'sending' ? 'Sending…' : 'Resend'}
            </button>
          )}
        </span>
      )}
      <span className="text-muted-foreground">
        {appUser.displayName || appUser.email}
      </span>
      <button onClick={() => signOut()} className="underline text-xs">
        Sign out
      </button>
    </div>
  )
}
