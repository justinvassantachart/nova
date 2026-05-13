import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId)

let app: FirebaseApp | undefined
let _auth: Auth | undefined
let _db: Firestore | undefined

function ensure() {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase not configured. Copy .env.example to .env.local and fill in values. See README.',
    )
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(config)
    _auth = getAuth(app)
    _db = getFirestore(app)
  }
}

export function getFirebaseAuth(): Auth {
  ensure()
  return _auth!
}

export function getDb(): Firestore {
  ensure()
  return _db!
}
