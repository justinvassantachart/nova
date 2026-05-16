import './index.css'
import '@vscode/codicons/dist/codicon.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { initTheme } from '@/theme/theme-store'

// Paint the persisted theme before React mounts so the first frame already
// carries the right palette — otherwise the page flashes the dark default
// for one tick when light is selected.
initTheme()
import { AuthProvider } from '@/shared/context/AuthProvider'
import { ProtectedRoute } from '@/lms/components/ProtectedRoute'
import Login from '@/lms/pages/Login'
import RootRedirect from '@/lms/pages/RootRedirect'
import Dashboard from '@/lms/pages/Dashboard'
import CreateClass from '@/lms/pages/CreateClass'
import ClassPage from '@/lms/pages/ClassPage'
import JoinClass from '@/lms/pages/JoinClass'
import AssignmentPage from '@/lms/pages/AssignmentPage'
import SubmissionView from '@/lms/pages/SubmissionView'

// Register the CORP-injection service worker before anything tries to
// reach Firebase. Under COEP: require-corp, responses from
// firestore.googleapis.com / firebaseapp.com would otherwise be blocked
// (they don't ship CORP headers). The SW rewrites those responses with
// CORP: cross-origin so they pass the gate. Skip on /login since that
// route is unsafe-none anyway and Firebase loads there without the gate.
//
// First-time install: register resolves while the SW is still
// `installing`, so reg.active is null at that point. We must wait for
// it to reach `activated` before reloading — checking reg.active in the
// then() callback always misses the first install.
if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  window.location.pathname !== '/login' &&
  window.location.pathname !== '/'
) {
  void (async () => {
    try {
      const reg = await navigator.serviceWorker.register('/coep-sw.js')
      if (navigator.serviceWorker.controller) return
      const sw = reg.installing ?? reg.waiting ?? reg.active
      if (!sw) return
      if (sw.state !== 'activated') {
        await new Promise<void>((resolve) => {
          sw.addEventListener('statechange', () => {
            if (sw.state === 'activated') resolve()
          })
        })
      }
      window.location.reload()
    } catch (err) {
      console.warn('[coep-sw] registration failed:', err)
    }
  })()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classes/new"
            element={
              <ProtectedRoute>
                <CreateClass />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classes/:classId"
            element={
              <ProtectedRoute>
                <ClassPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classes/:classId/assignments/:assignmentId"
            element={
              <ProtectedRoute>
                <AssignmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classes/:classId/assignments/:assignmentId/submissions/:studentUid"
            element={
              <ProtectedRoute>
                <SubmissionView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join"
            element={
              <ProtectedRoute>
                <JoinClass />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join/:code"
            element={
              <ProtectedRoute>
                <JoinClass />
              </ProtectedRoute>
            }
          />
          {/* Standalone IDE — no auth, no host context, original behavior. */}
          <Route
            path="/ide"
            element={
              <div className="h-screen w-screen">
                <App />
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
