import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Strip COOP/COEP from the /auth.html bridge so its child OAuth popup
// (accounts.google.com → firebaseapp.com handler) can postMessage back.
// Production gets the same exemption via netlify.toml [[headers]].
function authBridgeHeaders(): Plugin {
  return {
    name: 'nova-auth-bridge-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/auth.html') {
          res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
          res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    authBridgeHeaders(),
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
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  optimizeDeps: {
    exclude: ['@yowasp/clang'],
  },
})
