// Minimal ESM loader that resolves the `@/` path alias to `src/` — Node's
// default resolver doesn't understand TS path aliases, but our test scripts
// import files that use them.

import { pathToFileURL } from 'node:url'
import { resolve as resolvePath, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

import { existsSync } from 'node:fs'

function withTsExtension(absPath) {
    if (existsSync(absPath)) return absPath
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const candidate = absPath + ext
        if (existsSync(candidate)) return candidate
    }
    return absPath
}

export function resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
        const abs = withTsExtension(resolvePath(ROOT, 'src', specifier.slice(2)))
        return next(pathToFileURL(abs).href, context)
    }
    return next(specifier, context)
}
