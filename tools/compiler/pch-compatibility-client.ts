import type { DebugPauseState, RuntimeExecutionPlan } from 'web-ide'
import { createFastCppRuntimePlugin, selectPchProfile } from '../../src/nova/precompiled-runtime'
import type { EngineBackend } from '../../src/nova/engine-backend'

type CompilerJob = { type: string; name?: string; args?: string[] }
declare global { interface Window { novaPchCheck: typeof check; novaCompilerJobs: CompilerJob[] } }

async function check(backend: EngineBackend) {
  const results = []
  for (const vector of [false, true]) {
    const provider = createFastCppRuntimePlugin({ accountId: 'synthetic-pch-test', projectId: `profile-${vector}` }, backend).contributes!.runtimeProviders![0]!
    const session = provider.createSession()
    const source = `#include <iostream>\n${vector ? '#include <vector>\n' : ''}int main() {\n  ${vector ? 'std::vector<int> values{3, 4}; int value = values[0] + values[1];' : 'int value = 7;'}\n  std::cout << value << "\\n";\n  std::cout << "done\\n";\n  return 0;\n}\n`
    const plan: RuntimeExecutionPlan = { files: { '/workspace/main.cpp': source }, mode: 'run' }
    const profile = selectPchProfile(plan.files, backend)!
    const printLine = vector ? 5 : 4
    let stdout = '', stderr = ''
    const pauses: DebugPauseState[] = []
    const releases = [session.events.stdout.subscribe(text => { stdout += text }),
      session.events.stderr.subscribe(text => { stderr += text }),
      session.events.debugPaused.subscribe(state => {
        pauses.push(state)
        setTimeout(() => { void (pauses.length === 1 ? session.stepOver!() : session.continueExecution!()) }, 0)
      })]
    const runs = []
    try {
      const warmup = await session.warmup!(plan)
      if (warmup.status !== 'completed' || stdout || stderr) throw new Error(`Unexpected warmup: ${JSON.stringify({ warmup, stdout, stderr })}`)
      for (const [label, mode, text, expected] of [
        ['first', 'run', source, '7\ndone\n'], ['unchanged', 'run', source, '7\ndone\n'],
        ['edit', 'run', source.replace('<< value <<', '<< value + 1 <<'), '8\ndone\n'],
        ['debug', 'debug', source, '7\ndone\n'],
      ] as const) {
        stdout = ''; stderr = ''
        const beforeJobs = window.novaCompilerJobs?.length ?? 0
        const prepared = await session.prepare({ ...plan, mode, files: { '/workspace/main.cpp': text } })
        if (!prepared.success) throw new Error(`Preparation failed: ${prepared.errors.join('\n')}`)
        if (mode === 'debug') await session.setBreakpoints!('/workspace/main.cpp', [printLine])
        await session.start({ mode })
        const outcome = await session.waitForSettlement!()
        const jobs = (window.novaCompilerJobs ?? []).slice(beforeJobs)
        // Preserve raw output; strip only the two host-owned status lines and terminal ANSI/CRLF.
        const guestStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n').replace(/\n\[build\] compiler loaded from cache\n$/, '')
          .split('\n').filter(line => line !== 'Execution environment ready' && line !== '[build] Building main.cpp…').join('\n')
        if (guestStdout !== expected || stderr || outcome.type !== 'completed' || outcome.exitCode !== 0) {
          throw new Error(`Incorrect ${backend}/${profile.filename}/${label}: ${JSON.stringify({ stdout, stderr, outcome })}`)
        }
        runs.push({ label, stdout, guestStdout, stderr, outcome, jobs, statistics: session.compilationStatistics?.() })
      }
      if (pauses.length !== 2 || pauses[0]!.line !== printLine || pauses[1]!.line !== printLine + 1) {
        throw new Error(`Incorrect breakpoint/step: ${JSON.stringify(pauses.map(p => ({ file: p.file, line: p.line })))}`)
      }
      results.push({ backend, profile, warmup, runs, pauses })
    } finally {
      await session.disposeAndWait?.()
      releases.forEach(release => release())
    }
  }
  return results
}
window.novaPchCheck = check
