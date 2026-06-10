// Pure evaluator for lesson CheckSpecs. No store imports, no React — the
// caller snapshots IDE state into a CheckContext (see use-step-check.ts)
// and this module answers "does the spec hold right now?". Keeping it pure
// makes every check unit-testable without booting the IDE.

import type { CheckSpec } from './types'
import { workspacePath } from './types'
import type { MemorySnapshot, StackFrame, VariableNode } from '@/engine/IIDEEngine'

export type CheckContext = {
    debug: {
        debugMode: string
        currentLine: number | null
        currentFile: string | null
        currentFunc: string | null
        breakpoints: Record<string, number[]>
        callStack: StackFrame[]
        memorySnapshot: MemorySnapshot | null
    }
    rightTab: string
    tests: { name: string; status: 'running' | 'pass' | 'fail' }[]
    // Current workspace files, '/workspace/...'-keyed.
    files: Record<string, string>
    // Terminal output accumulated since the most recent run.
    stdout: string
    // Exit code of the most recent run, or null while running / before any run.
    lastExit: number | null
    // Count of each host event since the lesson page loaded.
    eventCounts: Partial<Record<string, number>>
    // The lesson's default file for anchor resolution.
    primaryFile: string
}

export type CheckPart = { label: string; passed: boolean }
export type CheckResult = { passed: boolean; parts: CheckPart[] }

// Resolve the 1-based line number of the first line whose text contains
// `anchor`. Returns null when the anchor no longer exists (e.g. the learner
// rewrote that line) — callers treat that as "not satisfied", never a crash.
export function resolveAnchorLine(content: string | undefined, anchor: string): number | null {
    if (!content) return null
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(anchor)) return i + 1
    }
    return null
}

function findVariable(
    frames: StackFrame[],
    name: string,
    func?: string,
): VariableNode | null {
    const search = (vars: VariableNode[]): VariableNode | null => {
        for (const v of vars) {
            if (v.name === name) return v
            if (v.members) {
                const hit = search(v.members)
                if (hit) return hit
            }
        }
        return null
    }
    // Active frame first so shadowed names resolve the way the panel shows them.
    const ordered = [...frames].sort((a, b) => Number(b.isActive) - Number(a.isActive))
    for (const frame of ordered) {
        if (func && !frame.funcName.includes(func)) continue
        const hit = search(frame.variables)
        if (hit) return hit
    }
    return null
}

function valueMatches(v: VariableNode, equals?: string, contains?: string): boolean {
    const text = String(v.value).trim()
    if (equals !== undefined) {
        if (text === equals.trim()) return true
        // Numeric fallback so "2" matches 2.0 and friends.
        const a = Number(text)
        const b = Number(equals)
        return Number.isFinite(a) && Number.isFinite(b) && a === b
    }
    if (contains !== undefined) return text.includes(contains)
    return true
}

function fileFor(spec: { file?: string }, ctx: CheckContext): string {
    return workspacePath(spec.file ?? ctx.primaryFile)
}

function evaluateLeaf(spec: CheckSpec, ctx: CheckContext): CheckPart {
    switch (spec.kind) {
        case 'manual':
            return { label: 'Read, then press Next', passed: true }

        case 'event': {
            const n = ctx.eventCounts[spec.event] ?? 0
            const need = spec.count ?? 1
            return { label: spec.label ?? `Perform the action (${spec.event})`, passed: n >= need }
        }

        case 'breakpoint': {
            const file = fileFor(spec, ctx)
            const line = resolveAnchorLine(ctx.files[file], spec.anchor)
            const passed = line !== null && (ctx.debug.breakpoints[file] ?? []).includes(line)
            return {
                label: spec.label ?? `Set a breakpoint on the \`${spec.anchor.trim()}\` line`,
                passed,
            }
        }

        case 'paused': {
            const paused = ctx.debug.debugMode === 'paused'
            let passed = paused
            if (passed && spec.anchor) {
                const file = fileFor(spec, ctx)
                const line = resolveAnchorLine(ctx.files[file], spec.anchor)
                passed = line !== null
                    && ctx.debug.currentLine === line
                    && (ctx.debug.currentFile === null || ctx.debug.currentFile === file)
            }
            if (passed && spec.func) {
                passed = (ctx.debug.currentFunc ?? '').includes(spec.func)
            }
            const where = spec.anchor
                ? `on the \`${spec.anchor.trim()}\` line`
                : spec.func
                    ? `inside ${spec.func}()`
                    : 'at a breakpoint'
            return { label: spec.label ?? `Pause the program ${where}`, passed }
        }

        case 'variable': {
            const frames = ctx.debug.memorySnapshot?.frames ?? []
            const v = ctx.debug.debugMode === 'paused'
                ? findVariable(frames, spec.name, spec.func)
                : null
            const passed = v !== null && valueMatches(v, spec.equals, spec.contains)
            const expect = spec.equals !== undefined
                ? ` reach ${spec.equals}`
                : spec.contains !== undefined ? ` contain ${spec.contains}` : ' appear'
            return { label: spec.label ?? `Watch \`${spec.name}\`${expect}`, passed }
        }

        case 'call-stack': {
            const n = ctx.debug.callStack.filter((f) => f.funcName.includes(spec.func)).length
            return {
                label: spec.label ?? `Get ${spec.minCount} ${spec.func}() frames on the call stack`,
                passed: n >= spec.minCount,
            }
        }

        case 'heap': {
            const n = ctx.debug.memorySnapshot?.heapAllocations.length ?? 0
            return {
                label: spec.label ?? `See ${spec.minAllocations} allocations on the heap`,
                passed: n >= spec.minAllocations,
            }
        }

        case 'stdout': {
            let passed = false
            if (spec.includes !== undefined) passed = ctx.stdout.includes(spec.includes)
            else if (spec.matches !== undefined) {
                try {
                    passed = new RegExp(spec.matches, spec.flags ?? 'm').test(ctx.stdout)
                } catch {
                    passed = false
                }
            }
            return { label: spec.label ?? 'Produce the expected program output', passed }
        }

        case 'program-exit': {
            const passed = ctx.lastExit !== null && (spec.code === undefined || ctx.lastExit === spec.code)
            return { label: spec.label ?? 'Run the program to the end', passed }
        }

        case 'code': {
            const file = fileFor(spec, ctx)
            const content = ctx.files[file]
            let matched = false
            if (content !== undefined) {
                try {
                    matched = new RegExp(spec.matches, spec.flags ?? 'm').test(content)
                } catch {
                    matched = false
                }
            }
            const passed = spec.absent ? content !== undefined && !matched : matched
            return { label: spec.label ?? 'Apply the fix in the code', passed }
        }

        case 'tests': {
            const total = ctx.tests.length
            const failed = ctx.tests.filter((t) => t.status === 'fail').length
            const done = ctx.tests.every((t) => t.status !== 'running')
            let passed = total >= (spec.minTotal ?? 0)
            if (passed && spec.minFailed !== undefined) passed = failed >= spec.minFailed
            if (passed && spec.allPass) passed = total > 0 && done && failed === 0
            return { label: spec.label ?? 'Run the test suite', passed }
        }

        case 'right-tab':
            return {
                label: spec.label ?? `Open the ${spec.tab.charAt(0).toUpperCase() + spec.tab.slice(1)} tab`,
                passed: ctx.rightTab === spec.tab,
            }

        case 'all':
        case 'any':
            throw new Error('composite spec passed to evaluateLeaf')
    }
}

export function evaluateCheck(spec: CheckSpec, ctx: CheckContext): CheckResult {
    if (spec.kind === 'all') {
        const parts = spec.of.map((s) => {
            const r = evaluateCheck(s, ctx)
            // Nested composites collapse to a single part; lessons keep
            // composites one level deep so this stays readable.
            return r.parts.length === 1 ? r.parts[0] : { label: 'Complete the sub-steps', passed: r.passed }
        })
        return { passed: parts.every((p) => p.passed), parts }
    }
    if (spec.kind === 'any') {
        const results = spec.of.map((s) => evaluateCheck(s, ctx))
        const passed = results.some((r) => r.passed)
        return { passed, parts: [{ label: spec.label ?? results[0]?.parts[0]?.label ?? 'Complete one option', passed }] }
    }
    const part = evaluateLeaf(spec, ctx)
    return { passed: part.passed, parts: [part] }
}

// Steps whose check is satisfiable only transiently (a pause at a line, a
// momentary variable value) must stay completed once seen — progress is
// sticky. The store records completion; the UI never "un-completes" a step.
