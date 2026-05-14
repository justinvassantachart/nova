import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// COOP `same-origin` + COEP `credentialless` give crossOriginIsolated = true
// (required for SharedArrayBuffer — the clangd LSP and the debugger worker
// both need it) while still letting Firebase Auth's iframe and Firestore's
// Listen channel load. `require-corp` previously broke both because Google's
// endpoints don't ship CORP headers; `credentialless` permits cross-origin
// no-cors fetches without requiring CORP, at the cost of stripping credentials.
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
  return {
    name: 'nova-security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = req.url ? req.url.split('?')[0] : ''
        if (NON_ISOLATED_PATHS.has(p)) {
          res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
          res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
        } else {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    novaSecurityHeaders(),
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['buffer', 'process', 'stream', 'path', 'events'],
      globals: { Buffer: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  optimizeDeps: {
    exclude: ['@yowasp/clang'],
  },
  build: {
    target: 'esnext',
  },
})
