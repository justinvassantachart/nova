import { describe, expect, it } from 'vitest'
import {
    dueLabel,
    editedAfterSubmit,
    fromLocalInputValue,
    isLate,
    isPastDue,
    toLocalInputValue,
} from './format'

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) })

describe('dueLabel', () => {
    it('is empty without a due date', () => {
        expect(dueLabel(null)).toBe('')
        expect(dueLabel(undefined)).toBe('')
    })
    it('prefixes Due', () => {
        expect(dueLabel(ts(Date.UTC(2026, 5, 12, 12, 0)))).toMatch(/^Due /)
    })
})

describe('isPastDue', () => {
    it('compares against the supplied clock', () => {
        expect(isPastDue(ts(1000), 2000)).toBe(true)
        expect(isPastDue(ts(3000), 2000)).toBe(false)
        expect(isPastDue(null, 2000)).toBe(false)
    })
})

describe('isLate', () => {
    it('is late only when submitted after the due date', () => {
        expect(isLate(ts(2000), ts(1000))).toBe(true)
        expect(isLate(ts(500), ts(1000))).toBe(false)
    })
    it('never late without both timestamps', () => {
        expect(isLate(null, ts(1000))).toBe(false)
        expect(isLate(ts(2000), null)).toBe(false)
    })
})

describe('editedAfterSubmit', () => {
    it('ignores edits inside the autosave slack window', () => {
        expect(editedAfterSubmit(ts(10_000), ts(5_000))).toBe(false)
    })
    it('flags edits well after submission', () => {
        expect(editedAfterSubmit(ts(60_000), ts(5_000))).toBe(true)
    })
    it('false when either side is missing', () => {
        expect(editedAfterSubmit(null, ts(5_000))).toBe(false)
        expect(editedAfterSubmit(ts(60_000), null)).toBe(false)
    })
})

describe('datetime-local round trip', () => {
    it('formats local wall-clock time as YYYY-MM-DDTHH:mm', () => {
        const d = new Date(2026, 5, 12, 23, 59) // local time
        expect(toLocalInputValue(ts(d.getTime()))).toBe('2026-06-12T23:59')
    })
    it('is empty for missing timestamps', () => {
        expect(toLocalInputValue(null)).toBe('')
    })
    it('parses back to the same local instant', () => {
        const d = new Date(2026, 5, 12, 23, 59)
        const round = fromLocalInputValue(toLocalInputValue(ts(d.getTime())))
        expect(round?.getTime()).toBe(d.getTime())
    })
    it('rejects empty and garbage input', () => {
        expect(fromLocalInputValue('')).toBeNull()
        expect(fromLocalInputValue('not-a-date')).toBeNull()
    })
})
