import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const destination = new URL('../dist/licenses/', import.meta.url)
await mkdir(destination, { recursive: true })
for (const [source, name] of [
  ['web-ide/LICENSE.md', 'web-ide-LICENSE.md'],
  ['web-ide/THIRD_PARTY_LICENSES.txt', 'web-ide-THIRD_PARTY_LICENSES.txt'],
  ['web-ide/THIRD_PARTY_NOTICES.md', 'web-ide-THIRD_PARTY_NOTICES.md'],
  ['debugger-sh/LICENSE', 'debugger-sh-LICENSE'],
]) {
  await copyFile(new URL(`../node_modules/${source}`, import.meta.url), new URL(name, destination))
}

// Keep deployed package identity inspectable without exposing host configuration.
const root = new URL('../', import.meta.url)
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const packageRecord = lock.packages['node_modules/web-ide']
if (!/^https:\/\/github\.com\/justinvassantachart\/web-ide\/releases\/download\/web-ide-v[^/]+\/web-ide-[^/]+\.tgz$/.test(packageRecord.resolved)) {
  throw new Error('Production builds require the immutable public WebIDE package URL')
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const buildInfo = {
  schemaVersion: 1,
  application: 'nova',
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  webIDE: {
    version: packageRecord.version,
    url: packageRecord.resolved,
    integrity: packageRecord.integrity,
  },
}
await writeFile(new URL('dist/build-info.json', root), JSON.stringify(buildInfo, null, 2) + '\n')
