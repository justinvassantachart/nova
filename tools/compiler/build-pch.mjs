import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { WASI } from 'node:wasi'
import { gzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '../..')
const backend = process.argv[2] ?? '--backend=upstream'
if (!['--backend=upstream', '--backend=legacy'].includes(backend) || process.argv.length > 3) {
  throw new Error('Usage: node tools/compiler/build-pch.mjs [--backend=upstream|--backend=legacy]')
}
const upstream = backend === '--backend=upstream'
const cache = join(root, `node_modules/.cache/web-ide-toolchain${upstream ? '-upstream' : ''}`)
const sysroot = join(cache, 'sysroot')
const output = join(root, 'public/compiler', upstream ? 'upstream' : '')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const engine = upstream ? JSON.parse(await readFile(new URL(import.meta.resolve('web-ide/upstream-engine.json')))) : undefined
const engineVersion = engine?.version ?? '0.3.15-webide.0.9.0.1'
const compilerDigest = upstream ? '8da7e06bf24341e85e0261bc727c65f0ff4b1f191a71f2af431e44f345bc6bd6' : '24fbed474c7b5b4968fd73fc4827440b93fb351c1b6264516130300eff3e7bf5'
const sysrootDigest = upstream ? 'c549ba2c715645298ddec4609859b6982188ab4662326ad023a4568a289f3a7b' : '8745c6af23fd841fa507d0c73f6b6b8e8da1b4ec216a6339739a28b38ff7227b'
// Verify compiler bytes against the pinned tuple before generating any PCH.
const toolchain = upstream ? JSON.parse(await readFile(new URL(import.meta.resolve('web-ide/upstream-toolchains.json')))).toolchains.cpp : undefined
if (upstream && (toolchain.sha256.llvm !== compilerDigest || toolchain.sha256.sysroot !== sysrootDigest)) {
  throw new Error('Installed upstream toolchain changed; review and rebuild the PCH tuple explicitly')
}
// Keep these in sync with the selected Engine release's clang frontend flags.
const flags = ['-cc1', '-triple', 'wasm32-wasip1', '-Werror', '-disable-free', '-isysroot', '/',
  '-internal-isystem', '/include/c++/v1', '-internal-isystem', '/include',
  '-internal-isystem', '/include/wasm32-wasip1', ...(upstream ? ['-I/', '-std=c++23', '-O0'] : ['-std=c++23']),
  '-fexceptions', '-fcxx-exceptions', '-exception-model=wasm', '-target-feature', '+exception-handling',
  '-mllvm', '-wasm-enable-eh', '-mllvm', '-wasm-use-legacy-eh=true']
const pchFlags = ['-emit-pch', '-fno-pch-timestamp', '-fvalidate-ast-input-files-content', '-x', 'c++-header']
await mkdir(cache, { recursive: true })
await mkdir(output, { recursive: true })
async function asset(name, digest, url) {
  const path = join(cache, name)
  let bytes = await readFile(path).catch(() => undefined)
  if (!bytes || hash(bytes) !== digest) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Cannot fetch ${name}: ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    if (hash(bytes) !== digest) throw new Error(`Unexpected toolchain digest: ${name}`)
    await writeFile(path, bytes)
  }
  return bytes
}
const compiler = await asset(upstream ? 'llvm.wasm' : 'llvm.core.wasm', compilerDigest,
  toolchain?.artifacts.llvm ?? 'https://fabioibanez.github.io/website/llvm.core.wasm')
const sysrootName = upstream ? 'sysroot.tar.zst' : 'llvm-resources.tar.gz'
await asset(sysrootName, sysrootDigest, toolchain?.artifacts.sysroot ?? 'https://fabioibanez.github.io/website/llvm-resources.tar.gz')
await rm(sysroot, { recursive: true, force: true })
await mkdir(sysroot, { recursive: true })
execFileSync('tar', ['-xf', join(cache, sysrootName), '-C', sysroot])
const module = await WebAssembly.compile(compiler)
const profiles = []
for (const headers of JSON.parse(await readFile(join(import.meta.dirname, 'profiles.json'), 'utf8'))) {
  const prelude = headers.map(header => `#include <${header}>\n`).join('')
  const headerPath = '/__web_ide_pch.h'
  await writeFile(join(sysroot, headerPath), prelude)
  const args = ['clang', ...flags, ...pchFlags, '-o', '/headers.pch', headerPath]
  const wasi = new WASI({ version: 'preview1', args, env: {}, preopens: { '/': sysroot }, returnOnExit: true })
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject())
  const code = wasi.start(instance)
  if (code) throw new Error(`PCH build failed (${code}): ${headers}`)
  const bytes = await readFile(join(sysroot, 'headers.pch'))
  const sha256 = hash(bytes)
  const filename = `${headers.join('-')}-${sha256.slice(0, 16)}.pch.bin`
  const compressed = gzipSync(bytes, { level: 9 })
  await writeFile(join(output, filename), compressed)
  profiles.push({ headers, prelude, filename, sha256, bytes: bytes.length, compressedBytes: compressed.length,
    ...(upstream ? { compressedSha256: hash(compressed) } : {}) })
  console.log(`${headers.join(', ')}: ${bytes.length} bytes (${compressed.length} compressed)`)
}
const requiredToolchain = { compilerSha256: compilerDigest, sysrootSha256: sysrootDigest,
  // The upstream exception runtime lives in this same verified sysroot container.
  exceptionsSha256: sysrootDigest }
const manifest = { engineVersion, compilerDigest, sysrootDigest, flags, profiles,
  ...(upstream ? { schemaVersion: 1, backend: 'upstream', engineSource: engine.gitHead,
    toolchain, pchFlags, requiredToolchain, recipeSha256: hash(await readFile(import.meta.filename)),
    environment: { env: {}, argv0: 'clang', cwd: '/', target: 'wasm32-wasip1' } } : {}) }
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await writeFile(join(root, `src/nova/generated/${upstream ? 'upstream-' : ''}pch-profiles.ts`),
  '// Generated by tools/compiler/build-pch.mjs; regenerate after changing the engine or profiles.\n' +
  `export const ${upstream ? 'upstreamPchProfiles' : 'pchProfiles'} = ${JSON.stringify(profiles, null, 2)} as const\n` +
  (upstream ? `export const upstreamRequiredToolchain = ${JSON.stringify(requiredToolchain, null, 2)} as const\n` : ''))
