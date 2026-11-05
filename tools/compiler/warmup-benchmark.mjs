import { writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const [faster, warm] of [[false, false], [true, false], [true, true]]) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(process.env.BENCHMARK_URL || 'http://localhost:5173/tools/compiler/warmup-benchmark.html')
    await page.waitForFunction(() => Boolean(window.measureCompiler), undefined, { timeout: 120_000 })
    const result = await page.evaluate(([faster, warm]) => window.measureCompiler(faster, warm), [faster, warm])
    results.push(result)
    console.log(JSON.stringify(result))
    await context.close()
  }
  await writeFile(process.env.BENCHMARK_OUTPUT || '/tmp/nova-warmup-benchmark.json', JSON.stringify({
    environment: { browser: browser.version(), node: process.version, platform: process.platform,
      architecture: process.arch, cpu: cpus()[0]?.model }, results,
  }, null, 2) + '\n')
} finally { await browser.close() }
