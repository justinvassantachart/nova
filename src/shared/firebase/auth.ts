import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth'
import { getFirebaseAuth } from './client'

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  return signInWithPopup(getFirebaseAuth(), provider)
}

export function signOut() {
  return fbSignOut(getFirebaseAuth())
}
