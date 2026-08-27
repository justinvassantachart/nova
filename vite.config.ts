import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// COOP `same-origin` + COEP `require-corp` are needed for SharedArrayBuffer
// (clangd LSP and the debugger worker both need crossOriginIsolated = true).
// Firebase Auth iframes and Firestore's Listen channel don't ship CORP
// headers, so they'd normally be blocked under require-corp; public/coep-sw.js
// rewrites those responses with CORP: cross-origin so they pass the gate.
// `credentialless` would let them through natively, but Safari (≤26.5)
// doesn't support it and silently falls back to unsafe-none, killing
// SharedArrayBuffer entirely.
//
// /login stays fully un-isolated (`unsafe-none`) so signInWithPopup can
// postMessage to accounts.google.com directly from the click handler per
// Firebase's docs. Login.tsx forces a hard navigation to /dashboard after
// successful auth so the isolated context is re-established for the
// SharedArrayBuffer-using workers downstream.
//
// Done via middleware instead of `server.headers` because Vite's global
// headers run late in the pipeline and overwrite per-route overrides.
const NON_ISOLATED_PATHS = new Set(['/', '/login'])
function novaSecurityHeaders(): Plugin {
  const middleware = (
    req: { url?: string },
    res: { setHeader(name: string, value: string): void },
    next: () => void,
  ) => {
    const p = req.url ? req.url.split('?')[0] : ''
    if (NON_ISOLATED_PATHS.has(p)) {
      res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
      res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
    } else {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    }
    next()
  }
  return {
    name: 'nova-security-headers',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    // `vite preview` needs the same headers or crossOriginIsolated is false
    // and every SharedArrayBuffer consumer (debugger, clangd) silently dies.
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [
    novaSecurityHeaders(),
    react(),
    tailwindcss(),
    wasm(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'node:buffer': 'buffer',
      'node:events': 'events',
      'node:path': 'path-browserify',
      'node:stream': 'stream-browserify',
    },
    // Local Web IDE development uses a linked package. Dedupe its React peers
    // so tests and the browser share the host application's renderer instance.
    dedupe: ['react', 'react-dom'],
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  optimizeDeps: {
    // debugger-sh is excluded because the optimizer copies its engine_bg.wasm
    // to a stable /node_modules/.vite/deps/ URL served with immutable
    // caching — swapping the package (local tarball bumps) then pairs new JS
    // glue with the browser's stale cached wasm and every wasm-bindgen
    // closure call fails. Serving it unoptimized keeps the wasm URL
    // revalidated like any source file.
    exclude: ['debugger-sh'],
  },
  build: {
    target: 'esnext',
  },
})
