import { useEffect, useState } from 'react'
import {
  watchAssignment,
  watchClassAssignments,
} from '@/shared/firebase/assignments'
import type { Assignment } from '@/shared/types'

export function useClassAssignments(
  classId: string | undefined,
  opts: { publishedOnly?: boolean } = {},
) {
  const [list, setList] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!classId) return
    setLoading(true)
    return watchClassAssignments(classId, opts, (l) => {
      setList(l)
      setLoading(false)
    })
    // We want to re-watch when publishedOnly flips, but otherwise keep stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, opts.publishedOnly])
  return { list, loading }
}

export function useAssignment(
  classId: string | undefined,
  assignmentId: string | undefined,
) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!classId || !assignmentId) {
      setAssignment(null)
      setLoading(false)
      return
    }
    setLoading(true)
    return watchAssignment(classId, assignmentId, (a) => {
      setAssignment(a)
      setLoading(false)
    })
  }, [classId, assignmentId])
  return { assignment, loading }
}
