import { describe, expect, it } from 'vitest'
import { evaluateCheck, resolveAnchorLine, type CheckContext } from './checks'
import type { CheckSpec } from './types'
import type { StackFrame, VariableNode } from '@/engine/IIDEEngine'

const FILE = '/workspace/main.cpp'
const SOURCE = [
    '#include <iostream>',          // 1
    '',                             // 2
    'int main() {',                 // 3
    '    int total = 0;',           // 4
    '    total += 5;',              // 5
    '    return 0;',                // 6
    '}',                            // 7
].join('\n')

function variable(name: string, value: string | number, members?: VariableNode[]): VariableNode {
    return {
        name, type: 'int', value, rawValue: 0, address: 0, size: 4,
        isPointer: false, members, isStruct: !!members,
    }
}

function frame(funcName: string, variables: VariableNode[], isActive = false): StackFrame {
    return { id: funcName, funcName, line: 1, sp: 0, variables, isActive }
}

function ctx(overrides: Partial<CheckContext> = {}): CheckContext {
    return {
        debug: {
            debugMode: 'idle',
            currentLine: null,
            currentFile: null,
            currentFunc: null,
            breakpoints: {},
            callStack: [],
            memorySnapshot: null,
            ...(overrides.debug ?? {}),
        },
        rightTab: 'variables',
        tests: [],
        files: { [FILE]: SOURCE },
        stdout: '',
        lastExit: null,
        eventCounts: {},
        primaryFile: 'main.cpp',
        ...overrides,
    }
}

describe('resolveAnchorLine', () => {
    it('finds the 1-based line containing the anchor', () => {
        expect(resolveAnchorLine(SOURCE, 'total += 5;')).toBe(5)
    })
    it('returns null when the anchor was edited away', () => {
        expect(resolveAnchorLine(SOURCE, 'no such text')).toBeNull()
        expect(resolveAnchorLine(undefined, 'total')).toBeNull()
    })
})

describe('evaluateCheck leaves', () => {
    it('manual always passes', () => {
        expect(evaluateCheck({ kind: 'manual' }, ctx()).passed).toBe(true)
    })

    it('event counts against the threshold', () => {
        const spec: CheckSpec = { kind: 'event', event: 'debug_step_over', count: 2 }
        expect(evaluateCheck(spec, ctx({ eventCounts: { debug_step_over: 1 } })).passed).toBe(false)
        expect(evaluateCheck(spec, ctx({ eventCounts: { debug_step_over: 2 } })).passed).toBe(true)
    })

    it('breakpoint resolves the anchor against current file content', () => {
        const spec: CheckSpec = { kind: 'breakpoint', anchor: 'total += 5;' }
        expect(evaluateCheck(spec, ctx()).passed).toBe(false)
        const withBp = ctx()
        withBp.debug = { ...withBp.debug, breakpoints: { [FILE]: [5] } }
        expect(evaluateCheck(spec, withBp).passed).toBe(true)
    })

    it('breakpoint survives edits above the anchor line', () => {
        const edited = '// new comment line\n' + SOURCE // anchor shifts 5 -> 6
        const c = ctx({ files: { [FILE]: edited } })
        c.debug = { ...c.debug, breakpoints: { [FILE]: [6] } }
        expect(evaluateCheck({ kind: 'breakpoint', anchor: 'total += 5;' }, c).passed).toBe(true)
        c.debug = { ...c.debug, breakpoints: { [FILE]: [5] } }
        expect(evaluateCheck({ kind: 'breakpoint', anchor: 'total += 5;' }, c).passed).toBe(false)
    })

    it('paused matches anchor line, file and function', () => {
        const c = ctx()
        c.debug = {
            ...c.debug, debugMode: 'paused',
            currentLine: 5, currentFile: FILE, currentFunc: 'main',
        }
        expect(evaluateCheck({ kind: 'paused', anchor: 'total += 5;' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'paused', anchor: 'int total = 0;' }, c).passed).toBe(false)
        expect(evaluateCheck({ kind: 'paused', func: 'main' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'paused', func: 'factorial' }, c).passed).toBe(false)
        c.debug = { ...c.debug, debugMode: 'running' }
        expect(evaluateCheck({ kind: 'paused' }, c).passed).toBe(false)
    })

    it('variable matches by trimmed string and numeric equality, searching members', () => {
        const c = ctx()
        c.debug = {
            ...c.debug, debugMode: 'paused',
            memorySnapshot: {
                frames: [
                    frame('main', [variable('count', 5)], false),
                    frame('helper', [variable('node', 0, [variable('value', '42')])], true),
                ],
                heapAllocations: [],
            },
        }
        expect(evaluateCheck({ kind: 'variable', name: 'count', equals: '5' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'variable', name: 'count', equals: '5.0' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'variable', name: 'value', equals: '42' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'variable', name: 'count', equals: '6' }, c).passed).toBe(false)
        expect(evaluateCheck({ kind: 'variable', name: 'count', equals: '5', func: 'helper' }, c).passed).toBe(false)
        // Not paused -> never passes, even with a stale snapshot.
        c.debug = { ...c.debug, debugMode: 'idle' }
        expect(evaluateCheck({ kind: 'variable', name: 'count', equals: '5' }, c).passed).toBe(false)
    })

    it('call-stack counts matching frames', () => {
        const c = ctx()
        c.debug = {
            ...c.debug,
            callStack: [
                frame('factorial(int)', []), frame('factorial(int)', []), frame('main', []),
            ],
        }
        expect(evaluateCheck({ kind: 'call-stack', func: 'factorial', minCount: 2 }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'call-stack', func: 'factorial', minCount: 3 }, c).passed).toBe(false)
    })

    it('stdout supports includes and regex', () => {
        const c = ctx({ stdout: 'Before: 1 2 3 4 \nAfter:  1 \n' })
        expect(evaluateCheck({ kind: 'stdout', includes: 'Before: 1' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'stdout', matches: 'After:\\s+1\\s*$' }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'stdout', matches: 'After:\\s+4 3 2 1' }, c).passed).toBe(false)
    })

    it('program-exit requires a recorded exit, optionally matching the code', () => {
        expect(evaluateCheck({ kind: 'program-exit' }, ctx()).passed).toBe(false)
        expect(evaluateCheck({ kind: 'program-exit' }, ctx({ lastExit: 0 })).passed).toBe(true)
        expect(evaluateCheck({ kind: 'program-exit', code: 0 }, ctx({ lastExit: 1 })).passed).toBe(false)
    })

    it('code matches and absent-matches current file content', () => {
        expect(evaluateCheck({ kind: 'code', matches: 'total \\+= 5;' }, ctx()).passed).toBe(true)
        expect(evaluateCheck({ kind: 'code', matches: 'return prev;' }, ctx()).passed).toBe(false)
        expect(evaluateCheck({ kind: 'code', matches: 'return prev;', absent: true }, ctx()).passed).toBe(true)
    })

    it('tests gates on totals, failures and all-pass', () => {
        const twoOneFail = ctx({
            tests: [
                { name: 'a', status: 'pass' as const },
                { name: 'b', status: 'fail' as const },
            ],
        })
        expect(evaluateCheck({ kind: 'tests', minTotal: 2, minFailed: 1 }, twoOneFail).passed).toBe(true)
        expect(evaluateCheck({ kind: 'tests', minTotal: 2, allPass: true }, twoOneFail).passed).toBe(false)
        const allGreen = ctx({
            tests: [
                { name: 'a', status: 'pass' as const },
                { name: 'b', status: 'pass' as const },
            ],
        })
        expect(evaluateCheck({ kind: 'tests', minTotal: 2, allPass: true }, allGreen).passed).toBe(true)
        expect(evaluateCheck({ kind: 'tests', minTotal: 3, allPass: true }, allGreen).passed).toBe(false)
        // Still-running tests are not "all passing".
        const running = ctx({ tests: [{ name: 'a', status: 'running' as const }] })
        expect(evaluateCheck({ kind: 'tests', minTotal: 1, allPass: true }, running).passed).toBe(false)
    })

    it('right-tab matches the active panel tab', () => {
        expect(evaluateCheck({ kind: 'right-tab', tab: 'graph' }, ctx()).passed).toBe(false)
        expect(evaluateCheck({ kind: 'right-tab', tab: 'graph' }, ctx({ rightTab: 'graph' })).passed).toBe(true)
    })

    it('heap counts allocations from the paused snapshot', () => {
        const c = ctx()
        c.debug = {
            ...c.debug,
            memorySnapshot: {
                frames: [],
                heapAllocations: [
                    { ptr: 1, size: 8, typeName: 'Node', label: 'n1', members: [] },
                    { ptr: 2, size: 8, typeName: 'Node', label: 'n2', members: [] },
                ],
            },
        }
        expect(evaluateCheck({ kind: 'heap', minAllocations: 2 }, c).passed).toBe(true)
        expect(evaluateCheck({ kind: 'heap', minAllocations: 3 }, c).passed).toBe(false)
    })
})

describe('composite checks', () => {
    it('all requires every part and reports each as a checklist entry', () => {
        const spec: CheckSpec = {
            kind: 'all',
            of: [
                { kind: 'event', event: 'run' },
                { kind: 'stdout', includes: 'hello' },
            ],
        }
        const half = evaluateCheck(spec, ctx({ eventCounts: { run: 1 } }))
        expect(half.passed).toBe(false)
        expect(half.parts).toHaveLength(2)
        expect(half.parts[0].passed).toBe(true)
        expect(half.parts[1].passed).toBe(false)
        const full = evaluateCheck(spec, ctx({ eventCounts: { run: 1 }, stdout: 'hello world' }))
        expect(full.passed).toBe(true)
    })

    it('any passes when one option passes', () => {
        const spec: CheckSpec = {
            kind: 'any',
            of: [
                { kind: 'stdout', includes: 'x' },
                { kind: 'event', event: 'run' },
            ],
        }
        expect(evaluateCheck(spec, ctx()).passed).toBe(false)
        expect(evaluateCheck(spec, ctx({ eventCounts: { run: 1 } })).passed).toBe(true)
    })
})
