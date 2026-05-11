import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth'
import { getFirebaseAuth } from './client'

// Nova sets COOP `same-origin` for the SharedArrayBuffer debugger, which
// breaks signInWithPopup (the popup can't postMessage back through the
// isolated opener). Use the redirect flow instead — full-page navigation
// to Google and back, no popup needed.
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  await signInWithRedirect(getFirebaseAuth(), provider)
}

// Call once on app boot to consume any pending redirect result.
// onAuthStateChanged also fires after this resolves; we just await it so
// the post-redirect render doesn't briefly flash the login page.
export async function consumeRedirectResult() {
  try {
    await getRedirectResult(getFirebaseAuth())
  } catch (e) {
    console.warn('[auth] redirect result error', e)
  }
}

export function signOut() {
  return fbSignOut(getFirebaseAuth())
}
