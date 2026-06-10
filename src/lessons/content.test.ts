// Content invariants for the lesson registry. These tests are what makes
// lesson authoring safe: every anchor must identify exactly one line of the
// starter code, every code-check regex must compile and must NOT already
// match the starter files (otherwise a "fix it" step would auto-pass), and
// ids/slugs must be unique and routable.

import { describe, expect, it } from 'vitest'
import { LESSONS } from './content'
import type { CheckSpec, Lesson } from './types'
import { workspacePath } from './types'

function* walkChecks(spec: CheckSpec): Generator<CheckSpec> {
    yield spec
    if (spec.kind === 'all' || spec.kind === 'any') {
        for (const child of spec.of) yield* walkChecks(child)
    }
}

function lessonFile(lesson: Lesson, file?: string): string | undefined {
    const target = workspacePath(file ?? lesson.primaryFile)
    for (const [path, content] of Object.entries(lesson.files)) {
        if (workspacePath(path) === target) return content
    }
    return undefined
}

describe('lesson registry', () => {
    it('contains exactly six lessons', () => {
        expect(LESSONS).toHaveLength(6)
    })

    it('has unique, URL-safe ids and slugs', () => {
        const ids = LESSONS.map((l) => l.id)
        const slugs = LESSONS.map((l) => l.slug)
        expect(new Set(ids).size).toBe(LESSONS.length)
        expect(new Set(slugs).size).toBe(LESSONS.length)
        for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
    })

    it('includes at least one AI-debugging lesson and a linked-list lesson', () => {
        expect(LESSONS.filter((l) => l.tags.includes('AI-generated code')).length).toBeGreaterThanOrEqual(3)
        expect(LESSONS.some((l) => l.tags.includes('linked lists'))).toBe(true)
    })
})

describe.each(LESSONS.map((l) => [l.title, l] as const))('%s', (_title, lesson) => {
    it('has a primary file present in its starter files', () => {
        expect(lessonFile(lesson)).toBeDefined()
    })

    it('has unique step ids and a substantial step count', () => {
        const ids = lesson.steps.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(lesson.steps.length).toBeGreaterThanOrEqual(6)
    })

    it('starts with a manual orientation step', () => {
        expect(lesson.steps[0].check.kind).toBe('manual')
    })

    it('resolves every anchor to exactly one line of the starter code', () => {
        for (const step of lesson.steps) {
            for (const check of walkChecks(step.check)) {
                const anchor =
                    check.kind === 'breakpoint' ? check.anchor
                        : check.kind === 'paused' ? check.anchor
                            : undefined
                if (!anchor) continue
                const content = lessonFile(lesson, 'file' in check ? check.file : undefined)
                expect(content, `step "${step.id}" anchor file`).toBeDefined()
                const hits = content!
                    .split('\n')
                    .filter((line) => line.includes(anchor)).length
                expect(hits, `step "${step.id}" anchor "${anchor}" must match exactly one line`).toBe(1)
            }
        }
    })

    it('has code-check regexes that compile and do not match the unfixed starter code', () => {
        for (const step of lesson.steps) {
            for (const check of walkChecks(step.check)) {
                if (check.kind !== 'code') continue
                const re = new RegExp(check.matches, check.flags ?? 'm') // throws on bad pattern
                const content = lessonFile(lesson, check.file)
                expect(content, `step "${step.id}" code-check file`).toBeDefined()
                if (!check.absent) {
                    expect(
                        re.test(content!),
                        `step "${step.id}" pattern /${check.matches}/ already matches the starter code — the fix step would auto-pass`,
                    ).toBe(false)
                }
            }
        }
    })

    it('has stdout regex checks that compile', () => {
        for (const step of lesson.steps) {
            for (const check of walkChecks(step.check)) {
                if (check.kind === 'stdout' && check.matches !== undefined) {
                    expect(() => new RegExp(check.matches!, check.flags ?? 'm')).not.toThrow()
                    expect(check.includes).toBeUndefined()
                }
            }
        }
    })
})
