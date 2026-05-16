import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'

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

// /login is the only route served with COOP/COEP unsafe-none. Everywhere
// else runs under require-corp (we need crossOriginIsolated for clangd's
// SharedArrayBuffer). Firebase Auth's default popup/redirect resolver
// pre-loads an iframe from <project>.firebaseapp.com that has no CORP
// header, so under require-corp the browser refuses to display it and
// auth init hangs. On isolated routes we initialize WITHOUT the resolver
// — no iframe is ever requested — and Login.tsx passes the resolver
// explicitly to signInWithPopup, which only runs on /login anyway.
function isLoginRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname === '/login' || window.location.pathname === '/'
}

function ensure() {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase not configured. Copy .env.example to .env.local and fill in values. See README.',
    )
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(config)
    _auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      // Only include the popup/redirect resolver on /login. On isolated
      // routes, leaving this out keeps Firebase from fetching the auth
      // iframe that COEP would otherwise block.
      popupRedirectResolver: isLoginRoute() ? browserPopupRedirectResolver : undefined,
    })
    // experimentalAutoDetectLongPolling: webchannel streaming fetch
    // intermittently fails under COEP + our CORP-injecting SW (the
    // streaming body doesn't survive the Response() rewrap reliably in
    // all browsers). Long polling uses discrete fetches that the SW can
    // safely re-wrap, so the Listen channel doesn't get stuck.
    _db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
  }
}

export function getFirebaseAuth(): Auth {
  ensure()
  return _auth!
}

export { browserPopupRedirectResolver }

export function getDb(): Firestore {
  ensure()
  return _db!
}
