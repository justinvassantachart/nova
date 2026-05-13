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
//   2. Bridge runs signInWithRedirect itself — its own tab navigates to
//      Google and back. On return, it calls getRedirectResult, posts
//      the credential via BroadcastChannel, and closes itself.
//   3. Main app receives the credential and calls signInWithCredential.
//
// The bridge is also used for any flow that pulls reCAPTCHA (password
// reset, sign-up with Email Enumeration Protection enabled), since the
// reCAPTCHA iframe is blocked by COEP `require-corp` in the main app.
//
// Pure email/password sign-in and sign-up don't need the bridge — they
// are plain CORS fetches to identitytoolkit.googleapis.com.

const CHANNEL = 'nova_auth'
const TIMEOUT_MS = 5 * 60 * 1000

type BridgeMessage =
  | { ok: true; op: 'signin'; idToken: string | null; accessToken: string | null }
  | { ok: true; op: 'reset' }
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

function openBridge(op: 'signin' | 'reset', extra: Record<string, string> = {}): Window {
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
}

export function signOut() {
  return fbSignOut(getFirebaseAuth())
}
