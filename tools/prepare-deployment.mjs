import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const buildInfo = {
  schemaVersion: 3,
  application: 'web-ide',
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  engineBackend: backend,
  webIDE: {
    version: packageRecord.version,
    url: packageRecord.resolved,
    integrity: packageRecord.integrity,
  },
  engine: { version: engine.version, url: engine.resolved, integrity: engine.integrity },
  compiler: {
    compilerDigest: pchManifest.compilerDigest,
    sysrootDigest: pchManifest.sysrootDigest,
    precompiledHeaders: pchManifest.profiles.map(({ filename, sha256 }) => ({ filename, sha256 })),
  },
}
await writeFile(new URL('dist/build-info.json', root), JSON.stringify(buildInfo, null, 2) + '\n')
