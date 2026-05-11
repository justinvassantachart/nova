import { useEffect, useState } from 'react'
import {
  watchAssignment,
  watchMyAssignments,
  watchPublishedAssignments,
} from '@/shared/firebase/assignments'
import type { Assignment } from '@/shared/types'

export function useMyAssignments(teacherUid: string | undefined) {
  const [list, setList] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!teacherUid) return
    setLoading(true)
    const unsub = watchMyAssignments(teacherUid, (l) => {
      setList(l)
      setLoading(false)
    })
    return unsub
  }, [teacherUid])
  return { list, loading }
}

export function usePublishedAssignments() {
  const [list, setList] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    const unsub = watchPublishedAssignments((l) => {
      setList(l)
      setLoading(false)
    })
    return unsub
  }, [])
  return { list, loading }
}

export function useAssignment(id: string | undefined) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!id) {
      setAssignment(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = watchAssignment(id, (a) => {
      setAssignment(a)
      setLoading(false)
    })
    return unsub
  }, [id])
  return { assignment, loading }
}
