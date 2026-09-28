import { gunzipSync } from 'fflate'
import type { IDEPlugin, RuntimeExecutionPlan, RuntimeProvider } from 'web-ide'
import { cppRuntimeProvider } from 'web-ide/runtimes'
import { CPP_TEST_IMPL_PATH, CPP_TEST_SUPPORT_FILES } from 'web-ide/testing'
import { pchProfiles } from './generated/pch-profiles'

type PchProfile = typeof pchProfiles[number]
type Artifacts = Pick<RuntimeExecutionPlan, 'binaryFiles' | 'cppArtifacts'>
const pending = new Map<string, Promise<Artifacts | undefined>>()

/** Only unconditional standard includes at the very start may be precompiled. */
export function leadingStandardIncludes(source: string): string[] {
  // Do not interpret escaped newlines, BOMs, trigraphs or other preprocessing syntax.
  // Conservative rejection always retains the normal compiler path.
  if (source.includes('\\\n') || source.includes('\\\r\n') || source.includes('??/')) return []
  const result: string[] = []
  let rest = source
  while (rest.length) {
    const trivia = /^(?:[ \t\r\n]+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)/.exec(rest)
    if (trivia) { rest = rest.slice(trivia[0].length); continue }
    const include = /^#[ \t]*include[ \t]+<([a-z0-9_]+)>[ \t]*(?:\r?\n|$)/.exec(rest)
    if (!include) break
    result.push(include[1])
    rest = rest.slice(include[0].length)
  }
  return result
}

export function selectPchProfile(files: RuntimeExecutionPlan['files']): PchProfile | undefined {
  const sources = Object.entries(files).filter(([path]) => /\.(?:c|cc|cp|cpp|cxx|c\+\+)$/i.test(path))
  if (!sources.length) return undefined
  // Engine flattens /workspace and /sysroot into /. Never shadow user files.
  if (Object.keys(files).some(path => /(?:^|\/)__web_ide_pch(?:\.h|\.pch)(?:\/|$)/.test(path))) return undefined
  // Testing V2 adds its own fixed implementation to lesson Run/Debug plans.
  // Its standard-only includes are compatible with these profiles. Exempt only
  // the exact provider-owned bytes, never a similarly named workspace source.
  const userSources = sources.filter(([path, source]) =>
    path !== CPP_TEST_IMPL_PATH || source !== CPP_TEST_SUPPORT_FILES[CPP_TEST_IMPL_PATH])
  if (!userSources.length) return undefined
  const prefixes = userSources.map(([, source]) => leadingStandardIncludes(source))
  return [...pchProfiles].reverse().find(profile => prefixes.every(headers =>
    profile.headers.every((header, index) => headers[index] === header)))
}

async function loadProfile(profile: PchProfile): Promise<Artifacts | undefined> {
  let loading = pending.get(profile.sha256)
  if (!loading) {
    loading = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}compiler/${profile.filename}`, {
        cache: 'force-cache', signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error(`PCH HTTP ${response.status}`)
      const bytes = gunzipSync(new Uint8Array(await response.arrayBuffer()))
      if (bytes.byteLength !== profile.bytes) throw new Error('PCH size mismatch')
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('')
      if (digest !== profile.sha256) throw new Error('PCH digest mismatch')
      return {
        binaryFiles: {
          '/sysroot/__web_ide_pch.pch': bytes,
          '/sysroot/__web_ide_pch.h': new TextEncoder().encode(profile.prelude),
        },
        cppArtifacts: { precompiledHeader: '/sysroot/__web_ide_pch.pch', fallbackToSource: true },
      }
    })().catch(() => {
      // Optimization only: missing/corrupt assets, offline access, restricted
      // storage/crypto or a timeout all retain the ordinary source compiler.
      pending.delete(profile.sha256)
      return undefined
    })
    pending.set(profile.sha256, loading)
  }
  return loading
}

export const precompiledCppRuntimeProvider: RuntimeProvider = {
  ...cppRuntimeProvider,
  createSession() {
    const session = cppRuntimeProvider.createSession()
    const prepare = session.prepare.bind(session)
    session.prepare = async plan => {
      if (plan.cppArtifacts || plan.binaryFiles) return prepare(plan)
      const snapshot = { ...plan, files: { ...plan.files } }
      const profile = selectPchProfile(snapshot.files)
      const artifacts = profile ? await loadProfile(profile) : undefined
      return prepare({ ...snapshot, ...artifacts })
    }
    return session
  },
}

export const precompiledCppRuntimePlugin: IDEPlugin = {
  id: 'web-ide.runtime.cpp.plugin',
  contributes: { runtimeProviders: [precompiledCppRuntimeProvider] },
}
