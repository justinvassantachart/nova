import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const destination = new URL('dist/licenses/', root)
await mkdir(destination, { recursive: true })
for (const [source, name] of [
  ['packages/web-ide/LICENSE.md', 'web-ide-LICENSE.md'],
  ['packages/web-ide/THIRD_PARTY_LICENSES.txt', 'web-ide-THIRD_PARTY_LICENSES.txt'],
  ['packages/web-ide/THIRD_PARTY_NOTICES.md', 'web-ide-THIRD_PARTY_NOTICES.md'],
  ['public/third-party/debugger-sh/LICENSE.txt', 'debugger-sh-LICENSE'],
]) {
  await copyFile(new URL(source, root), new URL(name, destination))
}

// Keep the deployed source and actual local workbench identity inspectable.
// This demo includes workbench changes beyond the original 0.3.1 source tag.
const workbench = JSON.parse(await readFile(new URL('packages/web-ide/package.json', root), 'utf8'))
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const engine = Object.entries(lock.packages).find(([path]) => path.endsWith('/debugger-sh'))?.[1]
if (!engine?.version || !engine.resolved || !engine.integrity) {
  throw new Error('Deployment metadata requires a pinned debugger engine')
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const buildInfo = {
  schemaVersion: 2,
  application: 'web-ide',
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  selectedPreviewCommit: '98e1f244fa018e85b58a52c07ece0fbaed6a40f7',
  webIDE: {
    version: workbench.version,
    source: 'workspace:packages/web-ide',
    customized: true,
  },
  engine: { version: engine.version, url: engine.resolved, integrity: engine.integrity },
}
await writeFile(new URL('dist/build-info.json', root), JSON.stringify(buildInfo, null, 2) + '\n')
