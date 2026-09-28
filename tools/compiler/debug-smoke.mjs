import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  page.on('pageerror', error => console.error(error.message))
  await page.goto(process.env.BENCHMARK_URL || 'http://localhost:5173/tools/compiler/benchmark.html')
  await page.waitForFunction(() => Boolean(window.compilerBenchmark), undefined, { timeout: 120_000 })
  const report = await page.evaluate(async () => {
    const { engine, run } = window.compilerBenchmark
    let sequence = 2
    const stops = []
    const frames = []
    const send = (command, args = {}) => engine.debugger.send({ type: 'request', seq: sequence++, command, arguments: args })
    engine.debugger.on('event', message => {
      if (message.type !== 'event') return
      setTimeout(() => {
        if (message.event === 'initialized') {
          send('setBreakpoints', { source: { path: '/main.cpp' }, breakpoints: [{ line: 4 }] })
          send('configurationDone')
        } else if (message.event === 'stopped') {
          stops.push(message.body?.reason)
          frames.push(send('stackTrace', { threadId: 1 }).body?.stackFrames)
          send(stops.length === 1 ? 'next' : 'continue', { threadId: 1 })
        }
      }, 0)
    })
    const source = '#include <iostream>\nint main() {\n  int value = 7;\n  std::cout << value << "\\n";\n  return 0;\n}\n'
    const result = await run(source, true, true)
    return { ...result, stops, frames }
  })
  console.log(JSON.stringify(report, null, 2))
  assert.equal(report.result.type, 'completed')
  assert.equal(report.result.exitCode, 0)
  assert.equal(report.stdout, '7\n')
  assert.equal(report.stderr, '')
  assert.ok(report.stops.length >= 2, 'Expected breakpoint and step stops')
  assert.equal(report.frames[0][0].line, 4)
  assert.equal(report.frames[1][0].line, 5)
} finally {
  await browser.close()
}
