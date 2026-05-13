import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// COOP `same-origin` + COEP `require-corp` are needed for SharedArrayBuffer
// (the debugger). They also break Firebase's signInWithPopup though, because
// the isolated context severs cross-origin postMessage from accounts.google.com.
//
// Resolution: serve /login (and / which redirects to it) WITHOUT isolation
// so signInWithPopup can be called directly from the click handler, matching
// Firebase's docs. Every other route stays isolated.
//
// Login.tsx forces a hard navigation to /dashboard after successful auth so
// the new page load picks up the isolated headers. On the other end, if
// /login mounts in an already-isolated document (e.g. signed-out from
// /dashboard via client-side navigation), it reloads itself to flip back.
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
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
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
