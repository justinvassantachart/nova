// Service worker that:
//   1. Caches the debugger-sh runtime resources (llvm.core.wasm,
//      llvm-resources.tar.gz, engine_bg.wasm) in Cache Storage so debug
//      runs hit a same-origin lookup instead of round-tripping to
//      fabioibanez.github.io / jsdelivr (both serve short max-age headers,
//      so every run otherwise revalidates or re-downloads multi-MB blobs).
//   2. Injects `Cross-Origin-Resource-Policy: cross-origin` onto responses
//      from trusted Google/Firebase hosts.
//
// The app sets COEP: require-corp on isolated routes so clangd and the
// debugger get SharedArrayBuffer. Firebase Auth's iframe (firebaseapp.com)
// and Firestore's Listen channel (firestore.googleapis.com) don't ship
// CORP headers, so the browser blocks them. This SW intercepts those
// responses and adds the missing CORP header so they pass the gate.
//
// COEP credentialless would have solved this natively, but Safari (≤26.5)
// doesn't support it.

const LLVM_CACHE = 'debugger-sh-llvm-v1'

// debugger-sh's Rust worker hard-codes the llvm.* URLs (src/worker/mod.rs).
// engine_bg.wasm is fetched at module init by the wasm-pack glue and by
// the dedicated worker — version is embedded in the path, so a debugger-sh
// bump produces a new cache entry naturally.
const LLVM_URLS = new Set([
    'https://fabioibanez.github.io/website/llvm.core.wasm',
    'https://fabioibanez.github.io/website/llvm-resources.tar.gz',
])
const ENGINE_WASM_RE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/debugger-sh@[^/]+\/dist\/engine_bg\.wasm$/

function shouldCacheLlvm(url) {
    return LLVM_URLS.has(url) || ENGINE_WASM_RE.test(url)
}

const TRUSTED_HOSTS = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'firebaseapp.com',          // matched as suffix → covers *.firebaseapp.com
    'apis.google.com',
    'accounts.google.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'gstatic.com',              // for ssl.gstatic.com, www.gstatic.com
]

function isTrusted(hostname) {
    for (const host of TRUSTED_HOSTS) {
        if (hostname === host || hostname.endsWith('.' + host)) return true
    }
    return false
}

self.addEventListener('install', () => {
    // Take over as soon as installed so the first navigation under this SW
    // gets the rewrites without a manual reload.
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Drop old LLVM cache versions on upgrade so we don't leak storage.
        const names = await caches.keys()
        await Promise.all(
            names
                .filter((n) => n.startsWith('debugger-sh-llvm-') && n !== LLVM_CACHE)
                .map((n) => caches.delete(n)),
        )
        await self.clients.claim()
    })())
})

// Returns a cached LLVM response, fetching + caching on miss. Subsequent
// calls within the same SW process share the in-flight network fetch so
// the prefetch on debugger-sh import and the worker's later fetch don't
// duplicate the download.
const inFlight = new Map()
async function serveLlvm(url) {
    const cache = await caches.open(LLVM_CACHE)
    const cached = await cache.match(url)
    if (cached) return cached

    if (inFlight.has(url)) return (await inFlight.get(url)).clone()

    const promise = (async () => {
        const response = await fetch(url, { cache: 'force-cache' })
        if (response.ok && response.status === 200) {
            // Best-effort cache write: a quota-exceeded rejection here must
            // not poison the in-flight response. Subsequent runs simply
            // re-fetch and try again.
            cache.put(url, response.clone()).catch(() => {})
        }
        return response
    })()
    inFlight.set(url, promise)
    try {
        const response = await promise
        return response.clone()
    } finally {
        inFlight.delete(url)
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request

    let url
    try {
        url = new URL(request.url)
    } catch {
        return
    }

    if (shouldCacheLlvm(request.url)) {
        event.respondWith(serveLlvm(request.url))
        return
    }

    // Same-origin → already passes require-corp, nothing to do.
    if (url.origin === self.location.origin) return
    if (!isTrusted(url.hostname)) return

    // `only-if-cached` requests with cross-origin mode would throw if we
    // tried to refetch; leave them alone.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

    event.respondWith((async () => {
        let response
        try {
            response = await fetch(request)
        } catch (err) {
            // Network failure — let the page see the same error it would
            // have seen without us.
            throw err
        }

        // Opaque responses (no-cors) can't be rewritten — but they also
        // don't need our help; opaque-no-cors loads under require-corp
        // succeed when the response was loaded with cors. Pass through.
        if (response.type === 'opaque' || response.type === 'opaqueredirect') return response

        const headers = new Headers(response.headers)
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin')

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        })
    })())
})
