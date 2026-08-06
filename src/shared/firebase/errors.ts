// Maps Firebase Auth error codes (and the auth bridge's wrappers) to
// friendly strings for end users. Centralized so Login.tsx and any
// future auth UI surface the same wording, and so the switch can be
// unit-tested independently of React.
//
// Design note: when the code is an `auth/*` Firebase code we DON'T fall
// through to err.message — that surfaces strings like "Firebase: Error
// (auth/internal-error)." which leak SDK internals into the UI. Plain
// JS errors (no code) keep their original message, because those are
// our own thrown errors with already-friendly text ("Sign-in window
// closed before completing.", etc.).

const KNOWN: Readonly<Record<string, string>> = {
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with that email already exists. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/popup-blocked': 'Browser blocked the sign-in window. Allow pop-ups for this site.',
  'auth/operation-not-allowed': 'This sign-in method is disabled. Contact support.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
}

const GENERIC = 'Something went wrong. Please try again.'

export function humanizeAuthError(err: unknown): string {
  if (err == null) return GENERIC
  const e = err as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''
  if (code && KNOWN[code]) return KNOWN[code]
  // Has a Firebase-style code but we don't recognize it — sanitize.
  if (code.startsWith('auth/')) return GENERIC
  // No code: this is one of our own throws with already-friendly text.
  return message || GENERIC
}
