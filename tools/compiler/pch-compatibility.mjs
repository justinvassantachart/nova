import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const browsers = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const results = []
for (const browserName of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await browsers[browserName].launch({ headless: true })
  try {
    for (const backend of (process.env.BACKENDS || 'upstream,legacy').split(',')) {
      const context = await browser.newContext()
      const errors = []
      await context.addInitScript(() => {
        window.novaCompilerJobs = []
        const original = Worker.prototype.postMessage
        Worker.prototype.postMessage = function (message, ...args) {
          if (message?.type === 'run' && message?.job?.name === 'clang' && message?.job?.args?.includes('-cc1')) {
            window.novaCompilerJobs.push({ type: message.type, name: message.job.name, args: [...message.job.args] })
          }
          return original.call(this, message, ...args)
        }
      })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(process.env.BENCHMARK_URL || 'http://127.0.0.1:4187/tools/compiler/pch-compatibility.html')
      await page.waitForFunction(() => Boolean(window.novaPchCheck), undefined, { timeout: 120_000 })
      const started = new Date().toISOString()
      const cases = await page.evaluate(backend => window.novaPchCheck(backend), backend)
      await writeFile(process.env.BENCHMARK_OUTPUT || '/tmp/nova-pch-compatibility.json', JSON.stringify({ results, current: { browser: browserName, version: browser.version(), backend, started, cases, errors } }, null, 2) + '\n')
      assert.deepEqual(errors, [])
      if (backend === 'upstream') for (const test of cases) {
        const editJobs = test.runs.find(run => run.label === 'edit').jobs
        assert.equal(editJobs.length, 1, 'Exactly one edited translation unit must compile')
        assert.ok(editJobs[0].args.includes('-include-pch'), 'The real clang command must use PCH')
        assert.ok(editJobs[0].args.includes('/__web_ide_pch.pch'))
        const debugJobs = test.runs.find(run => run.label === 'debug').jobs
        assert.equal(debugJobs.length, 1, 'Restoring the original source for Debug must compile it once')
        assert.ok(debugJobs[0].args.includes('-include-pch'), 'Debug must also compile with the PCH')
        for (const run of test.runs.filter(run => ['first', 'unchanged'].includes(run.label))) {
          assert.equal(run.jobs.length, 0, 'Completed warmup and unchanged runs must reuse their compiled object')
        }
      }
      results.push({ browser: browserName, version: browser.version(), backend, started, ended: new Date().toISOString(), cases, errors })
      await writeFile(process.env.BENCHMARK_OUTPUT || '/tmp/nova-pch-compatibility.json', JSON.stringify({ results }, null, 2) + '\n')
      console.log(`${browserName}/${backend}: both PCH profiles passed warmup, Run, unchanged, edit and breakpoint/step/Continue`)
      await context.close()
    }
  } finally { await browser.close() }
}
