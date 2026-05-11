import {
  GoogleAuthProvider,
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

  try {
    const msg = await new Promise<BridgeMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sign-in timed out.'))
      }, TIMEOUT_MS)

      // If the user closes the popup before signing in, fail fast rather than wait.
      popupWatch = setInterval(() => {
        if (popup.closed) {
          clearTimeout(timeout)
          if (popupWatch) clearInterval(popupWatch)
          reject(new Error('Sign-in window was closed.'))
        }
      }, 500)

      channel.onmessage = (e: MessageEvent<BridgeMessage>) => {
        clearTimeout(timeout)
        resolve(e.data)
      }
    })

    if (!msg.ok) throw new Error(msg.error)
    const credential = GoogleAuthProvider.credential(msg.idToken, msg.accessToken)
    await signInWithCredential(getFirebaseAuth(), credential)
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
