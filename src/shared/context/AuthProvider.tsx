import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseConfigured, getDb, getFirebaseAuth } from '@/shared/firebase/client'
import { AuthContext } from './auth-context'
import type { AppUser } from '@/shared/types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  // Without Firebase there is nothing to wait for — start settled.
  const [loading, setLoading] = useState(firebaseConfigured)

  useEffect(() => {
    if (!firebaseConfigured) return
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u)
      if (!u) {
        setAppUser(null)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  // Sync /users/{uid} doc. Create on first login. No role concept — roles
  // are per-class and derived from class teacherUid + membership docs.
  useEffect(() => {
    if (!user) return
    const db = getDb()
    const ref = doc(db, 'users', user.uid)
    let firstSnap = true
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        // If this create fails (offline, rules), don't leave the app on the
        // loading spinner forever — settle with auth-only identity; the doc
        // sync retries on the next snapshot/sign-in.
        try {
          await setDoc(ref, {
            email: user.email ?? '',
            displayName: user.displayName ?? '',
            createdAt: serverTimestamp(),
          })
        } catch (e) {
          console.warn('[auth] user doc create failed', e)
          setAppUser({
            uid: user.uid,
            email: user.email ?? '',
            displayName: user.displayName ?? '',
            createdAt: null,
          })
          if (firstSnap) {
            firstSnap = false
            setLoading(false)
          }
        }
        return
      }
      const data = snap.data() as Omit<AppUser, 'uid'>
      setAppUser({ uid: user.uid, ...data })
      if (firstSnap) {
        firstSnap = false
        setLoading(false)
      }
    })
    return unsub
  }, [user])

  return (
    <AuthContext.Provider value={{ user, appUser, loading, configured: firebaseConfigured }}>
      {children}
    </AuthContext.Provider>
  )
}
