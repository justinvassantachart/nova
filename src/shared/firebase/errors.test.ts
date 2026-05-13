import { describe, expect, it } from 'vitest'
import { humanizeAuthError } from './errors'

// These tests are deliberately literal: each Firebase error code we
// claim to handle gets a dedicated assertion. If anyone widens or
// tightens the mapping, the test diff makes the user-visible change
// explicit. The default-branch tests are the most important — they
// guard the security-sensitive "don't leak SDK internals" behavior.

describe('humanizeAuthError', () => {
  describe('known Firebase Auth codes', () => {
    const cases: Array<[string, string]> = [
      ['auth/invalid-email', "That email address doesn't look right."],
      ['auth/user-not-found', 'No account found with that email.'],
      ['auth/wrong-password', 'Incorrect email or password.'],
      ['auth/invalid-credential', 'Incorrect email or password.'],
      ['auth/email-already-in-use', 'An account with that email already exists. Try signing in instead.'],
      ['auth/weak-password', 'Password must be at least 6 characters.'],
      ['auth/too-many-requests', 'Too many attempts. Try again in a few minutes.'],
      ['auth/network-request-failed', 'Network error. Check your connection.'],
      ['auth/popup-blocked', 'Browser blocked the sign-in window. Allow pop-ups for this site.'],
      ['auth/operation-not-allowed', 'This sign-in method is disabled. Contact support.'],
      ['auth/requires-recent-login', 'Please sign in again to complete this action.'],
      ['auth/user-disabled', 'This account has been disabled. Contact support.'],
    ]

    it.each(cases)('%s → %s', (code, expected) => {
      expect(humanizeAuthError({ code, message: 'Firebase: Error (auth/xyz).' })).toBe(expected)
    })
  })

  describe('unknown auth/* codes', () => {
    it('does NOT leak the raw Firebase message', () => {
      const err = { code: 'auth/internal-error', message: 'Firebase: Error (auth/internal-error).' }
      const result = humanizeAuthError(err)
      expect(result).not.toContain('Firebase')
      expect(result).not.toContain('auth/internal-error')
      expect(result).toBe('Something went wrong. Please try again.')
    })

    it('sanitizes a totally unrecognized auth/* code too', () => {
      const err = { code: 'auth/something-new-in-2030', message: 'Firebase: Error (auth/something-new-in-2030).' }
      expect(humanizeAuthError(err)).toBe('Something went wrong. Please try again.')
    })
  })

  describe('errors without a Firebase code', () => {
    it('returns the original message for our own thrown Errors', () => {
      const err = new Error('Sign-in window closed before completing.')
      expect(humanizeAuthError(err)).toBe('Sign-in window closed before completing.')
    })

    it('returns generic when no code and no message', () => {
      expect(humanizeAuthError({})).toBe('Something went wrong. Please try again.')
    })

    it('returns the message when only message is present', () => {
      expect(humanizeAuthError({ message: 'Pop-up was blocked.' })).toBe('Pop-up was blocked.')
    })
  })

  describe('hostile / malformed inputs', () => {
    it('handles null', () => {
      expect(humanizeAuthError(null)).toBe('Something went wrong. Please try again.')
    })

    it('handles undefined', () => {
      expect(humanizeAuthError(undefined)).toBe('Something went wrong. Please try again.')
    })

    it('handles strings', () => {
      // A raw string thrown — no message field, no code field.
      expect(humanizeAuthError('boom')).toBe('Something went wrong. Please try again.')
    })

    it('handles a non-string code field', () => {
      expect(humanizeAuthError({ code: 42, message: 'has message' })).toBe('has message')
    })

    it('handles a non-string message field', () => {
      expect(humanizeAuthError({ code: 'auth/invalid-email', message: 99 })).toBe(
        "That email address doesn't look right.",
      )
    })

    it('falls back to generic when both fields are wrong types', () => {
      expect(humanizeAuthError({ code: 42, message: 99 })).toBe('Something went wrong. Please try again.')
    })
  })

  describe('regression: ambiguous Firebase shapes', () => {
    it('treats wrong-password and invalid-credential identically (Firebase v9.21+ collapsed these)', () => {
      const a = humanizeAuthError({ code: 'auth/wrong-password' })
      const b = humanizeAuthError({ code: 'auth/invalid-credential' })
      expect(a).toBe(b)
    })

    it('known code wins over message contents', () => {
      // Even if Firebase someday returns a hostile message string, the
      // mapping must take precedence.
      const err = { code: 'auth/user-not-found', message: '<script>alert(1)</script>' }
      expect(humanizeAuthError(err)).toBe('No account found with that email.')
    })
  })
})
