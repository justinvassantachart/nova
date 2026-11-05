import { precompiledCppRuntimeProvider, createFastCppRuntimePlugin } from '../../src/nova/precompiled-runtime'
import { linkedListExample } from '../../src/lessons/showcase-example'

const fast = createFastCppRuntimePlugin({ projectId: 'benchmark', accountId: 'anonymous' }).contributes!.runtimeProviders![0]!
Object.assign(window, { async measureCompiler(faster: boolean, warm: boolean) {
  const session = (faster ? fast : precompiledCppRuntimeProvider).createSession()
  const plan = { files: { '/workspace/main.cpp': linkedListExample }, mode: 'run' as const }
  const samples = []
  let output = ''
  session.events.stdout.subscribe(text => { output += text })
  const started = performance.now()
  const warmup = warm ? await session.warmup!(plan) : undefined
  const warmupMs = performance.now() - started
  try {
    for (let i = 0; i < 3; i++) {
      output = ''
      const start = performance.now()
      const preparation = await session.prepare(plan)
      if (!preparation.success) throw new Error(preparation.errors.join('\n'))
      await session.start({ mode: 'run' })
      const outcome = await session.waitForSettlement!()
      if (!output.includes('10 + 20 + 30 = 60')) throw new Error('Incorrect linked-list output: ' + output)
      samples.push({ elapsedMs: performance.now() - start, outcome, statistics: session.compilationStatistics?.() })
    }
    return { faster, warm, warmupMs, warmup, samples }
  } finally { await session.disposeAndWait?.() }
} })
