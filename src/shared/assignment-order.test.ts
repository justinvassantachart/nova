import { describe, expect, it } from 'vitest'
import { effectiveOrder, movedIds, nextOrder, sortAssignments } from './assignment-order'

const ts = (ms: number) => ({ toMillis: () => ms })

describe('effectiveOrder', () => {
    it('prefers the explicit order field', () => {
        expect(effectiveOrder({ order: 3, createdAt: ts(999) })).toBe(3)
        expect(effectiveOrder({ order: 0, createdAt: ts(999) })).toBe(0)
    })
    it('falls back to createdAt millis, then to MAX_SAFE_INTEGER', () => {
        expect(effectiveOrder({ createdAt: ts(1234) })).toBe(1234)
        expect(effectiveOrder({})).toBe(Number.MAX_SAFE_INTEGER)
        expect(effectiveOrder({ createdAt: null })).toBe(Number.MAX_SAFE_INTEGER)
    })
})

describe('sortAssignments', () => {
    it('sorts ascending by effective order without mutating the input', () => {
        const input = [
            { id: 'b', order: 2 },
            { id: 'a', order: 0 },
            { id: 'c', order: 1 },
        ]
        const out = sortAssignments(input)
        expect(out.map((a) => a.id)).toEqual(['a', 'c', 'b'])
        expect(input.map((a) => a.id)).toEqual(['b', 'a', 'c'])
    })
    it('puts numbered assignments before legacy createdAt-only ones', () => {
        const out = sortAssignments([
            { id: 'legacy', createdAt: ts(1_700_000_000_000) },
            { id: 'new', order: 5 },
        ])
        expect(out.map((a) => a.id)).toEqual(['new', 'legacy'])
    })
    it('breaks ties by id for stability', () => {
        const out = sortAssignments([
            { id: 'z', order: 1 },
            { id: 'a', order: 1 },
        ])
        expect(out.map((a) => a.id)).toEqual(['a', 'z'])
    })
})

describe('nextOrder', () => {
    it('is 0 for an empty class', () => {
        expect(nextOrder([])).toBe(0)
    })
    it('lands after the largest effective order, including legacy docs', () => {
        expect(nextOrder([{ order: 0 }, { order: 4 }])).toBe(5)
        expect(nextOrder([{ createdAt: ts(100) }, { order: 1 }])).toBe(101)
    })
})

describe('movedIds', () => {
    const sorted = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    it('swaps with the neighbor in the given direction', () => {
        expect(movedIds(sorted, 1, 'up')).toEqual(['b', 'a', 'c'])
        expect(movedIds(sorted, 1, 'down')).toEqual(['a', 'c', 'b'])
    })
    it('returns null at the edges', () => {
        expect(movedIds(sorted, 0, 'up')).toBeNull()
        expect(movedIds(sorted, 2, 'down')).toBeNull()
        expect(movedIds(sorted, 5, 'up')).toBeNull()
    })
})
