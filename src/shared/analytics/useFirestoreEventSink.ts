import { useEffect, useMemo, useRef } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { getDb } from '@/shared/firebase/client'
import type { EventType } from '@/ide-host'

type Pending = {
  uid: string
  sessionId: string
  assignmentId?: string
  submissionId?: string
  type: EventType
  payload: Record<string, unknown>
  ts: number
}

const FLUSH_MS = 5000
// One Firestore writeBatch can hold up to 500 ops; cap below that.
const BATCH_CAP = 400

// Returns an onEvent function suitable for IDEHost.onEvent. Buffers events
// in memory and flushes them every 5s and on beforeunload via a single
// writeBatch. No-op when uid is missing.
//
// sessionId is generated once per hook lifetime so a single visit forms one
// contiguous trace, even across assignment switches.
export function useFirestoreEventSink(opts: {
  uid: string | undefined
  assignmentId?: string
  submissionId?: string
}) {
  const sessionIdRef = useRef<string>(crypto.randomUUID())
  const buffer = useRef<Pending[]>([])
  const ctx = useRef(opts)
  ctx.current = opts

  const flush = useMemo(() => {
    return async () => {
      const pending = buffer.current
      if (pending.length === 0) return
      const uid = ctx.current.uid
      if (!uid) {
        buffer.current = []
        return
      }
      // Drain in chunks of BATCH_CAP.
      buffer.current = []
      try {
        for (let i = 0; i < pending.length; i += BATCH_CAP) {
          const slice = pending.slice(i, i + BATCH_CAP)
          const batch = writeBatch(getDb())
          const col = collection(getDb(), 'events')
          for (const ev of slice) {
            const ref = doc(col)
            batch.set(ref, {
              uid: ev.uid,
              sessionId: ev.sessionId,
              assignmentId: ev.assignmentId ?? null,
              submissionId: ev.submissionId ?? null,
              type: ev.type,
              payload: ev.payload,
              clientTs: ev.ts,
              ts: serverTimestamp(),
            })
          }
          await batch.commit()
        }
      } catch (e) {
        console.warn('[event-sink] flush failed; events dropped', e)
      }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(flush, FLUSH_MS)
    const onUnload = () => { void flush() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', onUnload)
      void flush()
    }
  }, [flush])

  const onEvent = useMemo(() => {
    return (type: EventType, payload: Record<string, unknown>) => {
      const { uid, assignmentId, submissionId } = ctx.current
      if (!uid) return
      buffer.current.push({
        uid,
        sessionId: sessionIdRef.current,
        assignmentId,
        submissionId,
        type,
        payload,
        ts: Date.now(),
      })
    }
  }, [])

  return onEvent
}
