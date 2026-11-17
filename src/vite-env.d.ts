/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Build-time runtime selection; defaults to the verified upstream build. */
    readonly VITE_ENGINE_BACKEND?: 'upstream' | 'legacy'
    readonly VITE_FIREBASE_API_KEY?: string
    readonly VITE_FIREBASE_AUTH_DOMAIN?: string
    readonly VITE_FIREBASE_PROJECT_ID?: string
    readonly VITE_FIREBASE_STORAGE_BUCKET?: string
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
    readonly VITE_FIREBASE_APP_ID?: string

    /** Override the URL clangd's wasm is fetched from (default: upstream CDN). */
    readonly VITE_CLANGD_WASM_URL?: string
    /** Override the URL clangd's emscripten loader is fetched from. */
    readonly VITE_CLANGD_JS_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
