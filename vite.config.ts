import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// COOP/COEP are needed everywhere EXCEPT /auth.html (the sign-in bridge).
// Done via middleware instead of `server.headers` because Vite's global
// headers run late in the pipeline and overwrite per-route overrides.
function novaSecurityHeaders(): Plugin {
  return {
    name: 'nova-security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = req.url ? req.url.split('?')[0] : ''
        if (p === '/auth.html') {
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
