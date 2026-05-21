import { create } from 'zustand'
import { NOVA_TEST_DELIM } from './payload'

export type AssertStatus = 'PASS' | 'FAIL'

export interface TestAssert {
    file: string
    line: number
    status: AssertStatus
    actualExpr: string
    expectedExpr: string
    actualVal: string
    expectedVal: string
}

export interface TestCase {
    name: string
    status: 'running' | 'pass' | 'fail'
    asserts: TestAssert[]
}

interface TestState {
    isTesting: boolean
    tests: TestCase[]
    completedCount: number
    totalCount: number

    setTesting: (active: boolean) => void
    reset: () => void
    processEvent: (raw: string) => void
    // Called when the engine exits. If a test was mid-flight (e.g. the
    // program crashed before TEST_END), mark it failed so the UI doesn't
    // leave a spinner running forever.
    finalize: () => void
}

// Inverse of nova_test.h::escape. Order doesn't matter because each escape
// sequence consumes exactly two characters and they don't overlap.
function unescape(s: string): string {
    let out = ''
    for (let i = 0; i < s.length; i++) {
        const c = s[i]
        if (c === '\\' && i + 1 < s.length) {
            const next = s[i + 1]
            if (next === '\\') { out += '\\'; i++; continue }
            if (next === 'n') { out += '\n'; i++; continue }
            if (next === 'r') { out += '\r'; i++; continue }
            if (next === 'p') { out += '|'; i++; continue }
        }
        out += c
    }
    return out
}

export const useTestStore = create<TestState>((set) => ({
    isTesting: false,
    tests: [],
    completedCount: 0,
    totalCount: 0,

    setTesting: (active) => set({ isTesting: active }),
    reset: () => set({ tests: [], completedCount: 0, totalCount: 0, isTesting: false }),

    processEvent: (raw) => set((state) => {
        const parts = raw.split(NOVA_TEST_DELIM)
        const kind = parts[0]

        if (kind === 'SUITE_START') {
            return {
                totalCount: Number.parseInt(parts[1] ?? '0', 10) || 0,
                tests: [],
                completedCount: 0,
                isTesting: true,
            }
        }

        if (kind === 'SUITE_END') {
            return { isTesting: false }
        }

        // Mutating the current test in place keeps every assert append O(1).
        // The slice() above the conditionals gives us a fresh array reference
        // so Zustand triggers a re-render.
        const tests = state.tests.slice()
        const current = tests[tests.length - 1]

        if (kind === 'TEST_START') {
            tests.push({
                name: unescape(parts[1] ?? ''),
                status: 'running',
                asserts: [],
            })
            return { tests }
        }

        if (!current) return state

        if (kind === 'ASSERT') {
            current.asserts.push({
                file: parts[1] ?? '',
                line: Number.parseInt(parts[2] ?? '0', 10) || 0,
                status: parts[3] === 'PASS' ? 'PASS' : 'FAIL',
                actualExpr: unescape(parts[4] ?? ''),
                expectedExpr: unescape(parts[5] ?? ''),
                actualVal: unescape(parts[6] ?? ''),
                expectedVal: unescape(parts[7] ?? ''),
            })
            return { tests }
        }

        if (kind === 'TEST_END') {
            current.status = parts[1] === 'PASS' ? 'pass' : 'fail'
            return { tests, completedCount: state.completedCount + 1 }
        }

        return state
    }),

    finalize: () => set((state) => {
        if (!state.isTesting && state.tests.every((t) => t.status !== 'running')) {
            return state
        }
        const tests = state.tests.map((t) =>
            t.status === 'running' ? { ...t, status: 'fail' as const } : t,
        )
        return { tests, isTesting: false }
    }),
}))
