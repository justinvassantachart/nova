import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth'
import { getFirebaseAuth } from './client'

// Auth runs on the /login route, which is served WITHOUT COOP/COEP (see
// vite.config.ts + netlify.toml). That means we can call Firebase's
// signInWithPopup and sendPasswordResetEmail directly from the click
// handler — no bridge tab, no inherited-activation timing, no CDN load
// between the click and the popup. This matches Firebase's docs:
//   "Ensure signInWithPopup() is called directly inside a click event
//    handler. Avoid calling it inside an async function where there is
//    a long-running task before the popup call."
//
// Login.tsx forces a hard navigation to /dashboard once a user is
// observed, so the isolated headers come back on the new page load and
// SharedArrayBuffer is available for the debugger downstream.
//
// Pure email/password sign-in, sign-up, and sendEmailVerification on a
// signed-in user are plain CORS fetches and run anywhere — no popup,
// no reCAPTCHA, no isolation issues.

export async function signInWithGoogle(): Promise<void> {
  // No `await` between the click handler and this call. Provider
  // construction is synchronous; signInWithPopup itself opens the
  // popup synchronously before returning its Promise.
  await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider())
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email)
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
  if (trimmed) {
    // Best-effort: a failed display-name update shouldn't break sign-up.
    try { await updateProfile(cred.user, { displayName: trimmed }) } catch { /* tolerated */ }
  }
  // Verification is also best-effort. The unverified banner + Resend
  // covers the user if this fails silently.
  try { await sendEmailVerification(cred.user) } catch { /* surfaced via banner */ }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser
  if (!user) throw new Error('Not signed in.')
  if (user.emailVerified) return
  await sendEmailVerification(user)
}

export function signOut() {
  return fbSignOut(getFirebaseAuth())
}
