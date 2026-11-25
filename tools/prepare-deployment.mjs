import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { loadEnv } from 'vite'

const root = new URL('../', import.meta.url)
const destination = new URL('dist/licenses/', root)
await mkdir(destination, { recursive: true })
for (const [source, name] of [
  ['node_modules/web-ide/LICENSE.md', 'web-ide-LICENSE.md'],
  ['node_modules/web-ide/THIRD_PARTY_LICENSES.txt', 'web-ide-THIRD_PARTY_LICENSES.txt'],
  ['node_modules/web-ide/THIRD_PARTY_NOTICES.md', 'web-ide-THIRD_PARTY_NOTICES.md'],
  ['public/third-party/debugger-sh/LICENSE.txt', 'debugger-sh-LICENSE'],
  ['node_modules/debugger-sh-upstream/LICENSE', 'debugger-sh-upstream-LICENSE'],
]) {
  await copyFile(new URL(source, root), new URL(name, destination))
}

// Keep the deployed source and immutable public package identity inspectable.
const workbench = JSON.parse(await readFile(new URL('node_modules/web-ide/package.json', root), 'utf8'))
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const packageRecord = lock.packages['node_modules/web-ide']
if (!/^https:\/\/github\.com\/justinvassantachart\/web-ide\/releases\/download\/web-ide-v[^/]+\/web-ide-[^/]+\.tgz$/.test(packageRecord.resolved)
  || workbench.version !== packageRecord.version || !packageRecord.integrity) {
  throw new Error('Production builds require the pinned immutable public Web IDE package')
}
const environment = loadEnv('production', fileURLToPath(root), 'VITE_')
const backend = environment.VITE_ENGINE_BACKEND || 'upstream'
if (backend !== 'upstream' && backend !== 'legacy') {
  throw new Error(`Unsupported VITE_ENGINE_BACKEND: ${backend}`)
}
const enginePackage = backend === 'upstream' ? 'debugger-sh-upstream' : 'debugger-sh'
const engine = lock.packages[`node_modules/${enginePackage}`]
if (!engine?.version || !engine.resolved || !engine.integrity) {
  throw new Error(`Deployment metadata requires a pinned ${enginePackage}`)
}
const pchManifest = JSON.parse(await readFile(new URL(
  backend === 'upstream' ? 'public/compiler/upstream/manifest.json' : 'public/compiler/manifest.json', root,
), 'utf8'))
const officialEngine = JSON.parse(await readFile(new URL(import.meta.resolve('web-ide/upstream-engine.json')), 'utf8'))
const toolchains = JSON.parse(await readFile(new URL(import.meta.resolve('web-ide/upstream-toolchains.json')), 'utf8'))
const upstreamRecord = lock.packages['node_modules/debugger-sh-upstream']
if (workbench.dependencies['debugger-sh-upstream'] !== `npm:debugger-sh@${officialEngine.version}`
  || upstreamRecord?.name !== officialEngine.packageName
  || upstreamRecord.version !== officialEngine.version
  || upstreamRecord.resolved !== officialEngine.tarball
  || upstreamRecord.integrity !== officialEngine.integrity) {
  throw new Error('Installed upstream Engine must match the official package pinned by Web IDE')
}
for (const file of officialEngine.files) {
  const bytes = await readFile(new URL(`node_modules/debugger-sh-upstream/${file.path}`, root))
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`Installed upstream Engine file differs from its pinned package: ${file.path}`)
  }
}
const upstreamPch = JSON.parse(await readFile(new URL('public/compiler/upstream/manifest.json', root), 'utf8'))
if (upstreamPch.compilerDigest !== toolchains.toolchains.cpp.sha256.llvm
  || upstreamPch.sysrootDigest !== toolchains.toolchains.cpp.sha256.sysroot) {
  throw new Error('Nova precompiled headers require a different upstream compiler or sysroot')
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const buildInfo = {
  schemaVersion: 4,
  application: 'web-ide',
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  engineBackend: backend,
  webIDE: {
    version: packageRecord.version,
    url: packageRecord.resolved,
    integrity: packageRecord.integrity,
  },
  engine: { version: engine.version, url: engine.resolved, integrity: engine.integrity,
    ...(backend === 'upstream' ? { sourceCommit: officialEngine.gitHead,
      sha256: officialEngine.sha256, wasmUrl: officialEngine.wasmUrl, workerMode: officialEngine.workerMode } : {}),
  },
  compiler: {
    compilerDigest: pchManifest.compilerDigest,
    sysrootDigest: pchManifest.sysrootDigest,
    precompiledHeaders: pchManifest.profiles.map(({ filename, sha256 }) => ({ filename, sha256 })),
  },
}
await writeFile(new URL('dist/build-info.json', root), JSON.stringify(buildInfo, null, 2) + '\n')
