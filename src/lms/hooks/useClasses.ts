import { useEffect, useState } from 'react'
import {
  watchClass,
  watchClassMembers,
  watchMyMemberships,
  watchTeachingClasses,
} from '@/shared/firebase/classes'
import type { Class, ClassMember, Membership } from '@/shared/types'

export function useTeachingClasses(uid: string | undefined) {
  const [list, setList] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!uid) return
    setLoading(true)
    return watchTeachingClasses(uid, (l) => {
      setList(l)
      setLoading(false)
    })
  }, [uid])
  return { list, loading }
}

export function useMyMemberships(uid: string | undefined) {
  const [list, setList] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!uid) return
    setLoading(true)
    return watchMyMemberships(uid, (l) => {
      setList(l)
      setLoading(false)
    })
  }, [uid])
  return { list, loading }
}

export function useClass(classId: string | undefined) {
  const [klass, setKlass] = useState<Class | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!classId) {
      setKlass(null)
      setLoading(false)
      return
    }
    setLoading(true)
    return watchClass(classId, (c) => {
      setKlass(c)
      setLoading(false)
    })
  }, [classId])
  return { klass, loading }
}

export function useClassMembers(classId: string | undefined) {
  const [list, setList] = useState<ClassMember[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!classId) return
    setLoading(true)
    return watchClassMembers(classId, (l) => {
      setList(l)
      setLoading(false)
    })
  }, [classId])
  return { list, loading }
}
