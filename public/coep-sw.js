// Service worker that injects `Cross-Origin-Resource-Policy: cross-origin`
// onto responses from trusted Google/Firebase hosts.
//
// The app sets COEP: require-corp on isolated routes so clangd and the
// debugger get SharedArrayBuffer. Firebase Auth's iframe (firebaseapp.com)
// and Firestore's Listen channel (firestore.googleapis.com) don't ship
// CORP headers, so the browser blocks them. This SW intercepts those
// responses and adds the missing CORP header so they pass the gate.
//
// COEP credentialless would have solved this natively, but Safari (≤26.5)
// doesn't support it.

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
    event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
    const request = event.request

    // Same-origin → already passes require-corp, nothing to do.
    let url
    try {
        url = new URL(request.url)
    } catch {
        return
    }
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
