import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth'
import { getFirebaseAuth } from './client'

// Nova sets COOP `same-origin` + COEP `require-corp` for the
// SharedArrayBuffer-based debugger, which breaks signInWithPopup and
// signInWithRedirect from the main app (the isolated browsing context
// severs cross-origin postMessage from accounts.google.com).
//
// Workaround — auth bridge:
//   1. Main app opens /auth.html as a same-origin tab. The bridge page
//      is served WITHOUT COOP/COEP (vite.config.ts + netlify.toml).
//   2. The bridge runs signInWithPopup itself. Without COOP/COEP it can
//      receive the postMessage from accounts.google.com normally. The
//      OAuth popup spawned from the bridge is the only visible popup.
//   3. Bridge posts the credential via BroadcastChannel and closes.
//   4. Main app calls signInWithCredential — no popup, no COOP issue.
//
// signInWithRedirect was tried inside the bridge to drop the OAuth
// popup entirely, but Firebase's redirect flow relies on cross-origin
// state at <authDomain> that gets partitioned on localhost (and in
// Safari/Chrome with third-party cookie restrictions). getRedirectResult
// would return no user and we'd loop forever. The tab-as-bridge +
// popup-for-OAuth is the robust compromise.
//
// The bridge is also used for any flow that pulls reCAPTCHA (password
// reset, sign-up with Email Enumeration Protection enabled), since the
// reCAPTCHA iframe is blocked by COEP `require-corp` in the main app.
//
// Pure email/password sign-in, sign-up, and sendEmailVerification don't
// need the bridge — they're plain CORS fetches.

const CHANNEL = 'nova_auth'
const TIMEOUT_MS = 5 * 60 * 1000

type BridgeOp = 'signin' | 'reset' | 'verify'

type BridgeMessage =
  | { ok: true; op: 'signin'; idToken: string | null; accessToken: string | null }
  | { ok: true; op: 'reset' }
  | { ok: true; op: 'verify' }
  | { ok: false; code?: string | null; error: string }

type BridgeOutcome =
  | { kind: 'msg'; msg: BridgeMessage }
  | { kind: 'closed' }
  | { kind: 'timeout' }

function bridgeConfig(): Record<string, string> {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
}

function openBridge(op: BridgeOp, extra: Record<string, string> = {}): Window {
  const params = new URLSearchParams({ op, ...bridgeConfig(), ...extra })
  // No features string → tab, not popup. Same-origin tab is all we need
  // for BroadcastChannel + shared auth storage.
  const tab = window.open(`/auth.html?${params.toString()}`, 'nova_auth')
  if (!tab) {
    throw authError('Sign-in window blocked. Please allow pop-ups for this site and try again.')
  }
  return tab
}

// Waits briefly for the next non-null user from Firebase Auth. Used as
// a fallback after the bridge tab closes — same-origin storage means
// the bridge's redirect sign-in may already have propagated.
function waitForAuthUser(graceMs = 1500): Promise<boolean> {
  const auth = getFirebaseAuth()
  if (auth.currentUser) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsub(); resolve(false) }, graceMs)
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { clearTimeout(timer); unsub(); resolve(true) }
    })
  })
}

async function awaitBridge(tab: Window): Promise<BridgeOutcome> {
  const channel = new BroadcastChannel(CHANNEL)
  let watch: ReturnType<typeof setInterval> | undefined
  try {
    return await new Promise<BridgeOutcome>((resolve) => {
      const timeout = setTimeout(() => resolve({ kind: 'timeout' }), TIMEOUT_MS)
      watch = setInterval(() => {
        if (tab.closed) {
          if (watch) clearInterval(watch)
          // Grace period: the bridge does `postMessage` then `window.close()`,
          // and BroadcastChannel delivery is async. Wait a beat to see if a
          // pending message arrives — otherwise we'd race and miss it.
          setTimeout(() => {
            clearTimeout(timeout)
            resolve({ kind: 'closed' })
          }, 500)
        }
      }, 250)
      channel.onmessage = (e: MessageEvent<BridgeMessage>) => {
        clearTimeout(timeout)
        if (watch) clearInterval(watch)
        resolve({ kind: 'msg', msg: e.data })
      }
    })
  } finally {
    if (watch) clearInterval(watch)
    channel.close()
    if (!tab.closed) { try { tab.close() } catch { /* tab nav'd cross-origin */ } }
  }
}

function authError(message: string, code?: string | null): Error {
  return code ? Object.assign(new Error(message), { code }) : new Error(message)
}

export async function signInWithGoogle(): Promise<void> {
  const tab = openBridge('signin')
  const outcome = await awaitBridge(tab)

  if (outcome.kind === 'timeout') throw authError('Sign-in timed out.')

  if (outcome.kind === 'msg') {
    const { msg } = outcome
    if (msg.ok && msg.op === 'signin' && (msg.idToken || msg.accessToken)) {
      const credential = GoogleAuthProvider.credential(msg.idToken, msg.accessToken)
      await signInWithCredential(getFirebaseAuth(), credential)
      return
    }
    if (!msg.ok) throw authError(msg.error, msg.code ?? undefined)
  }

  // Fallback — bridge may have completed sign-in via shared auth storage
  // (same origin → same localStorage/IndexedDB) without us catching the
  // BroadcastChannel message. Give Firebase a moment to observe it.
  if (await waitForAuthUser()) return

  throw authError('Sign-in window closed before completing.')
}

export async function resetPassword(email: string): Promise<void> {
  const tab = openBridge('reset', { email })
  const outcome = await awaitBridge(tab)
  if (outcome.kind === 'timeout') throw authError('Password reset timed out.')
  if (outcome.kind === 'closed') throw authError('Password reset window closed before completing.')
  if (!outcome.msg.ok) throw authError(outcome.msg.error, outcome.msg.code ?? undefined)
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<void> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password)
  const trimmed = displayName?.trim()
  if (trimmed) await updateProfile(cred.user, { displayName: trimmed })
  // Don't fail the sign-up if the verification email can't be sent —
  // the user is signed in and can resend from the unverified banner.
  try { await sendVerificationEmailViaBridge() } catch { /* surfaced via banner */ }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser
  if (!user) throw authError('Not signed in.')
  if (user.emailVerified) return
  await sendVerificationEmailViaBridge()
}

// sendEmailVerification goes through the bridge because Firebase
// triggers reCAPTCHA invisibly on this endpoint, and the reCAPTCHA
// iframe is blocked by COEP `require-corp` in the main app. The
// bridge inherits the same auth state via shared storage.
async function sendVerificationEmailViaBridge(): Promise<void> {
  const tab = openBridge('verify')
  const outcome = await awaitBridge(tab)
  if (outcome.kind === 'timeout') throw authError('Verification email timed out.')
  if (outcome.kind === 'closed') throw authError('Verification window closed before completing.')
  if (!outcome.msg.ok) throw authError(outcome.msg.error, outcome.msg.code ?? undefined)
}

export function signOut() {
  return fbSignOut(getFirebaseAuth())
}
