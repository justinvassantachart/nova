import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './LandingPage'

// Keep the landing shell independent of Monaco, Firebase, and the runtime.
// The live example owns its workbench in a same-origin, isolated iframe.
if (window.location.pathname === '/') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode><LandingPage /></StrictMode>,
  )
} else {
  void import('./workspace-app').catch(() => {
    createRoot(document.getElementById('root')!).render(
      <main className="p-8">
        <h1 className="text-xl font-semibold">The workspace could not load.</h1>
        <p className="mt-3">Check your connection and <a className="underline" href={window.location.pathname + window.location.search}>try again</a>.</p>
        <a className="mt-4 inline-block underline" href="/">Back to web-ide</a>
      </main>,
    )
  })
}
