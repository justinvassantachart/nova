// Pure ordering logic for the assignment list — kept free of Firebase
// imports so it unit-tests without a backend.
//
// Ordering model: teachers arrange assignments in syllabus order via an
// integer `order` field. Documents created before the field existed have
// none; they fall back to their creation time in millis. Mixing small
// integers with epoch millis still yields a deterministic, stable order
// (numbered assignments first, legacy ones after, both internally
// ordered), and the first reorder normalizes every doc to 0..n-1 (see
// reorderAssignments), after which the fallback never fires again.

type Orderable = {
  order?: number
  createdAt?: { toMillis(): number } | null
}

export function effectiveOrder(a: Orderable): number {
  if (typeof a.order === 'number') return a.order
  return a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
}

// Ascending syllabus order. Ties (e.g. two legacy docs in the same
// millisecond, or untimestamped drafts) break by id for stability.
export function sortAssignments<T extends Orderable & { id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const d = effectiveOrder(a) - effectiveOrder(b)
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })
}

// Position for a newly created assignment: after everything that exists.
export function nextOrder(list: Orderable[]): number {
  if (list.length === 0) return 0
  return Math.max(...list.map(effectiveOrder)) + 1
}

// The id sequence after moving list[index] one step. Returns null for
// no-op moves (already at the edge) so callers can skip the write.
export function movedIds<T extends Orderable & { id: string }>(
  sorted: T[],
  index: number,
  direction: 'up' | 'down',
): string[] | null {
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || index >= sorted.length) return null
  if (target < 0 || target >= sorted.length) return null
  const ids = sorted.map((a) => a.id)
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  return ids
}
