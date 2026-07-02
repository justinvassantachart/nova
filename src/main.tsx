import './index.css'
import '@vscode/codicons/dist/codicon.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { initTheme } from '@/theme/theme-store'
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
import ReplayPage from '@/lms/pages/ReplayPage'
import ReplayDemo from '@/replay/ReplayDemo'
import LessonsHome from '@/lessons/LessonsHome'
import LessonRunner from '@/lessons/LessonRunner'
import LandingPage from '@/LandingPage'

// Sync the React-side theme store with the data-theme already set by the
// inline boot script in index.html. The inline script runs before the
// stylesheet parses so there's no flash; this call just brings the
// zustand store in line with that pre-paint state.
initTheme()

// Routes served without COOP/COEP. The SW gate is unnecessary there:
// signInWithPopup needs unsafe-none headers (which is the whole point of
// the carve-out), and Firebase calls on these routes don't need CORP
// rewrites.
const NON_ISOLATED_PATHS = new Set(['/', '/login'])

// Cap on how long we'll wait for the SW to take control before rendering
// without it. Normal first-install path is 50–300 ms. Past this point
// the SW is broken — better to render a half-working app than to freeze
// behind the loading screen forever.
const SW_CONTROL_TIMEOUT_MS = 5000

// Resolves true if the page becomes controlled within the timeout. Pure
// helper — no side effects beyond its own event wiring.
function waitForController(timeoutMs: number): Promise<boolean> {
  if (navigator.serviceWorker.controller) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (controlled: boolean) => {
      if (settled) return
      settled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      clearTimeout(timer)
      resolve(controlled)
    }
    const onChange = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    // Race guard: clients.claim() may complete between the initial check
    // and addEventListener. Without this re-check we'd hang for the full
    // timeout on the (vanishingly rare) lost-race path.
    if (navigator.serviceWorker.controller) finish(true)
  })
}

// Registers coep-sw.js and waits for it to control this page before
// returning. Under COEP: require-corp, cross-origin responses from
// firestore.googleapis.com / firebaseapp.com would be blocked because
// they don't ship CORP headers; the SW intercepts them and adds
// `Cross-Origin-Resource-Policy: cross-origin`. AuthProvider triggers
// Firebase fetches the moment React mounts, so the page must already be
// SW-controlled by then — any fetch that slips past stays failed for the
// page's lifetime.
async function prepareServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (NON_ISOLATED_PATHS.has(window.location.pathname)) return
  try {
    const reg = await navigator.serviceWorker.register('/coep-sw.js')
    if (navigator.serviceWorker.controller) return
    // SW is already active but isn't controlling this page. The usual
    // cause is Shift+Reload, which Chrome serves with `Service-Worker:
    // none`. clients.claim() only fires on activate, so controllerchange
    // will never come — bail out instead of hanging on the timeout. A
    // normal reload brings the SW back into control next time.
    if (reg.active?.state === 'activated') {
      console.warn(
        '[coep-sw] page is uncontrolled (Shift+Reload?); CORP rewrites disabled this session',
      )
      return
    }
    const controlled = await waitForController(SW_CONTROL_TIMEOUT_MS)
    if (!controlled) {
      console.warn(
        `[coep-sw] did not take control within ${SW_CONTROL_TIMEOUT_MS}ms; rendering without it`,
      )
    }
  } catch (err) {
    console.warn('[coep-sw] registration failed:', err)
  }
}

void (async () => {
  await prepareServiceWorker()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
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
            <Route
              path="/classes/:classId/assignments/:assignmentId/submissions/:studentUid/replay"
              element={
                <ProtectedRoute>
                  <ReplayPage />
                </ProtectedRoute>
              }
            />
            {/* Replay viewer against synthetic data — dev builds only. */}
            {import.meta.env.DEV && <Route path="/replay-demo" element={<ReplayDemo />} />}
            {/* Guided lesson series — no auth required; progress lives in
                localStorage. Served with COOP/COEP (not in the non-isolated
                carve-out) so the embedded IDE's SharedArrayBuffer workers run. */}
            <Route path="/learn" element={<LessonsHome />} />
            <Route path="/learn/:slug" element={<LessonRunner />} />
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
})()
