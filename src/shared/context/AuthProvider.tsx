import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseConfigured, getDb, getFirebaseAuth } from '@/shared/firebase/client'
import type { AppUser } from '@/shared/types'

type AuthState = {
  user: User | null
  appUser: AppUser | null
  loading: boolean
  configured: boolean
}

const AuthContext = createContext<AuthState>({
  user: null,
  appUser: null,
  loading: true,
  configured: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false)
      return
    }
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
        await setDoc(ref, {
          email: user.email ?? '',
          displayName: user.displayName ?? '',
          createdAt: serverTimestamp(),
        })
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

export function useAuth() {
  return useContext(AuthContext)
}
