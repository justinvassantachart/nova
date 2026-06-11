// Date/timestamp presentation helpers for the LMS. Accepts structural
// Timestamp-likes ({ toDate, toMillis }) so the pure logic unit-tests
// without the Firebase SDK.

export type TimestampLike = { toDate(): Date; toMillis(): number }

function valid(ts: TimestampLike | null | undefined): ts is TimestampLike {
  return !!ts && typeof ts.toDate === 'function' && typeof ts.toMillis === 'function'
}

export function fmtDateTime(ts: TimestampLike | null | undefined): string {
  if (!valid(ts)) return '—'
  return ts.toDate().toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// "Due Jun 12, 11:59 PM" / '' when no due date is set.
export function dueLabel(dueDate: TimestampLike | null | undefined): string {
  if (!valid(dueDate)) return ''
  return `Due ${fmtDateTime(dueDate)}`
}

export function isPastDue(
  dueDate: TimestampLike | null | undefined,
  now: number = Date.now(),
): boolean {
  return valid(dueDate) && dueDate.toMillis() < now
}

// A submission is late when it was submitted after the due date.
export function isLate(
  submittedAt: TimestampLike | null | undefined,
  dueDate: TimestampLike | null | undefined,
): boolean {
  return valid(submittedAt) && valid(dueDate) && submittedAt.toMillis() > dueDate.toMillis()
}

// Files kept changing after the student pressed Submit — flagged to the
// teacher because autosave continues after submission in this model.
// A small slack window absorbs the submit-click's own autosave flush.
const EDIT_AFTER_SUBMIT_SLACK_MS = 15_000
export function editedAfterSubmit(
  updatedAt: TimestampLike | null | undefined,
  submittedAt: TimestampLike | null | undefined,
): boolean {
  return valid(updatedAt) && valid(submittedAt)
    && updatedAt.toMillis() > submittedAt.toMillis() + EDIT_AFTER_SUBMIT_SLACK_MS
}

// <input type="datetime-local"> wants local-time 'YYYY-MM-DDTHH:mm'.
export function toLocalInputValue(ts: TimestampLike | null | undefined): string {
  if (!valid(ts)) return ''
  const d = ts.toDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Parses the input's value back to a Date (local time), or null when empty.
export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
