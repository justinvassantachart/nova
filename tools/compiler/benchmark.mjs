import { writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('pageerror', error => console.error(error.message))
await page.goto(process.env.BENCHMARK_URL || 'http://localhost:5173/tools/compiler/benchmark.html')
await page.waitForFunction(() => Boolean(window.compilerBenchmark), undefined, { timeout: 120_000 })
const results = []
const environment = { browser: browser.version(), node: process.version,
  platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model }
// Cold toolchain and first asset fetch separated from paired warm build samples.
for (const [program, pch] of [['iostream', false], ['iostream', true], ['vector', false], ['vector', true],
  ['iostream', false], ['iostream', true], ['vector', false], ['vector', true],
  ['iostream', false], ['iostream', true], ['vector', false], ['vector', true]]) {
  const started = Date.now()
  const sample = await page.evaluate(async ([program, pch]) => {
    const benchmark = window.compilerBenchmark
    return benchmark.run(benchmark.programs[program], pch)
  }, [program, pch])
  const record = { program, pch, elapsedMs: Date.now() - started, ...sample }
  results.push(record)
  console.log(JSON.stringify(record))
  if (sample.result.type !== 'completed' || sample.result.exitCode !== 0 || sample.stderr !== ''
    || sample.stdout !== (program === 'iostream' ? 'hello\n' : '319\n')) {
    await browser.close()
    throw new Error('Benchmark program did not produce the expected result')
  }
  await writeFile(process.env.BENCHMARK_OUTPUT || '/tmp/web-ide-compiler-benchmark.json',
    JSON.stringify({ environment, samples: results }, null, 2) + '\n')
}
await browser.close()
