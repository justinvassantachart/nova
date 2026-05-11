import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as fbSignOut,
} from 'firebase/auth'
import { getFirebaseAuth } from './client'

// Nova sets COOP `same-origin` for the SharedArrayBuffer-based debugger,
// which breaks both signInWithPopup and signInWithRedirect from the main
// app (cross-origin postMessage from accounts.google.com → firebaseapp.com
// is blocked by the isolated opener).
//
// Workaround — "auth bridge" pattern:
//   1. Main app opens /auth.html as a same-origin popup. That static page
//      is served WITHOUT COOP/COEP (see vite.config.ts dev middleware and
//      netlify.toml [[headers]] override).
//   2. The bridge runs Firebase's signInWithPopup itself. Because the
//      bridge has no COOP, the Google OAuth popup can postMessage back.
//   3. Bridge broadcasts {idToken, accessToken} via BroadcastChannel.
//   4. Main app receives the credential and calls signInWithCredential —
//      no popup/redirect involvement, no COOP issue.

const CHANNEL = 'nova_auth'
const POPUP_FEATURES = 'width=500,height=620,menubar=no,toolbar=no'
const TIMEOUT_MS = 5 * 60 * 1000

type BridgeMessage =
  | { ok: true; idToken: string | null; accessToken: string | null }
  | { ok: false; error: string }

// Waits for the next non-null user from Firebase Auth, with a short
// grace period. Used to detect implicit sign-in via shared auth storage
// (the bridge writes to the same origin's localStorage / IndexedDB).
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

export async function signInWithGoogle(): Promise<void> {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  const url = `/auth.html?${new URLSearchParams(config as Record<string, string>).toString()}`
  const popup = window.open(url, 'nova_auth', POPUP_FEATURES)
  if (!popup) {
    throw new Error('Sign-in popup was blocked. Please allow popups and try again.')
  }

  const channel = new BroadcastChannel(CHANNEL)
  let popupWatch: ReturnType<typeof setInterval> | undefined

  // Race: explicit BroadcastChannel message OR popup-closed (bridge may
  // have signed in via shared storage so fast we missed the message).
  type Outcome = { kind: 'msg'; msg: BridgeMessage } | { kind: 'closed' } | { kind: 'timeout' }

  try {
    const outcome = await new Promise<Outcome>((resolve) => {
      const timeout = setTimeout(() => resolve({ kind: 'timeout' }), TIMEOUT_MS)
      popupWatch = setInterval(() => {
        if (popup.closed) {
          clearTimeout(timeout)
          if (popupWatch) clearInterval(popupWatch)
          resolve({ kind: 'closed' })
        }
      }, 250)
      channel.onmessage = (e: MessageEvent<BridgeMessage>) => {
        clearTimeout(timeout)
        if (popupWatch) clearInterval(popupWatch)
        resolve({ kind: 'msg', msg: e.data })
      }
    })

    if (outcome.kind === 'timeout') throw new Error('Sign-in timed out.')

    if (outcome.kind === 'msg' && outcome.msg.ok && (outcome.msg.idToken || outcome.msg.accessToken)) {
      // Use the explicit credential when we got one.
      const credential = GoogleAuthProvider.credential(outcome.msg.idToken, outcome.msg.accessToken)
      await signInWithCredential(getFirebaseAuth(), credential)
      return
    }

    // Fallback path: bridge may have signed in via shared auth storage
    // (same origin → same localStorage/IndexedDB) without delivering a
    // usable credential message. Wait briefly for onAuthStateChanged.
    if (await waitForAuthUser()) return

    // No credential, no implicit auth — surface the bridge error if any.
    if (outcome.kind === 'msg' && !outcome.msg.ok) throw new Error(outcome.msg.error)
    throw new Error('Sign-in window closed before completing.')
  } finally {
    if (popupWatch) clearInterval(popupWatch)
    channel.close()
    if (!popup.closed) {
      try { popup.close() } catch { /* cross-origin if still on Google */ }
    }
  }
}

export function signOut() {
  return fbSignOut(getFirebaseAuth())
}
