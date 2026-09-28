import { Engine } from 'debugger-sh'
import { gunzipSync } from 'fflate'
import { pchProfiles } from '../../src/nova/generated/pch-profiles'

const programs = {
  iostream: '#include <iostream>\nint main() { std::cout << "hello\\n"; }',
  vector: '#include <iostream>\n#include <vector>\nint main() { std::vector<int> v{72,95,88,64}; int total=0; for (int n:v) total+=n; std::cout << total << "\\n"; }',
}
const engine = await Engine.create('c')
let stdout = '', stderr = ''
const decoder = new TextDecoder()
engine.stdout.on('data', bytes => { stdout += decoder.decode(bytes) })
engine.stderr.on('data', bytes => { stderr += decoder.decode(bytes) })
async function run(source: string, pch = false, debug = false) {
  engine.fs = { 'main.cpp': source }
  engine.binaryFiles = {}
  engine.cppArtifacts = undefined
  if (pch) {
    const profile = pchProfiles.find(profile => profile.headers.length === (source.includes('<vector>') ? 2 : 1))!
    const bytes = gunzipSync(new Uint8Array(await (await fetch('/compiler/' + profile.filename)).arrayBuffer()))
    engine.binaryFiles = { '/__web_ide_pch.pch': bytes, '/__web_ide_pch.h': new TextEncoder().encode(profile.prelude) }
    engine.cppArtifacts = { precompiledHeader: '/__web_ide_pch.pch' }
  }
  engine.debugger.enabled = debug
  stdout = ''; stderr = ''
  const running = engine.run()
  if (debug) engine.debugger.send({ type: 'request', seq: 1, command: 'initialize', arguments: {} })
  const result = await running
  return { result, stdout, stderr }
}
Object.assign(window, { compilerBenchmark: { run, programs, engine } })
