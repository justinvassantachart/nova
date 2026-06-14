import { useEffect, useMemo, useRef } from 'react'
import { collection, doc, serverTimestamp, writeBatch, type CollectionReference, type DocumentData } from 'firebase/firestore'
import { getDb } from '@/shared/firebase/client'

// The sink is a passthrough: `type` is whatever vocabulary the caller uses.
// IDE hosts forward the IDEHost EventType strings; hosts may also log their
// own domain events into the same trace (e.g. the lesson runner's
// 'lesson_step_complete'), keyed to the same sessionId.
//
// WHERE EVENTS LAND
// - With classId + assignmentId + submissionId (a student working on an
//   assignment): classes/{c}/assignments/{a}/submissions/{s}/events — the
//   submission's own replayable trace. Locality buys the teacher read
//   access via the class rules and a plain orderBy(clientTs) query with no
//   composite index.
// - Otherwise (lessons, teacher-edit): the top-level events collection.
// Research queries that want everything use a collectionGroup('events')
// query, which spans both locations.
type Pending = {
  uid: string
  sessionId: string
  classId?: string
  assignmentId?: string
  submissionId?: string
  type: string
  payload: Record<string, unknown>
  ts: number
}

const FLUSH_MS = 5000
// One Firestore writeBatch can hold up to 500 ops; cap below that.
const BATCH_CAP = 400

function targetCollection(ev: Pending): CollectionReference<DocumentData> {
  const db = getDb()
  if (ev.classId && ev.assignmentId && ev.submissionId) {
    return collection(
      db,
      'classes', ev.classId,
      'assignments', ev.assignmentId,
      'submissions', ev.submissionId,
      'events',
    )
  }
  return collection(db, 'events')
}

// Returns an onEvent function suitable for IDEHost.onEvent. Buffers events
// in memory and flushes them every 5s and on beforeunload via a single
// writeBatch. No-op when uid is missing.
//
// sessionId is generated once per hook lifetime so a single visit forms one
// contiguous trace, even across assignment switches.
export function useFirestoreEventSink(opts: {
  uid: string | undefined
  classId?: string
  assignmentId?: string
  submissionId?: string
}) {
  const sessionIdRef = useRef<string>(crypto.randomUUID())
  const buffer = useRef<Pending[]>([])
  // Latest-value ref so the stable onEvent/flush closures read current ids
  // without re-subscribing; updated in an effect because refs must not be
  // written during render.
  const ctx = useRef(opts)
  useEffect(() => {
    ctx.current = opts
  })

  const flush = useMemo(() => {
    return async () => {
      const pending = buffer.current
      if (pending.length === 0) return
      // Each buffered event was stamped with the uid that was signed in
      // when it happened (onEvent guards on uid), so flushing doesn't
      // depend on the CURRENT auth state — a sign-out between buffer and
      // flush must not silently drop an authenticated trace. If auth has
      // truly lapsed, the rules reject the batch and we warn below.
      // Drain in chunks of BATCH_CAP.
      buffer.current = []
      try {
        for (let i = 0; i < pending.length; i += BATCH_CAP) {
          const slice = pending.slice(i, i + BATCH_CAP)
          const batch = writeBatch(getDb())
          for (const ev of slice) {
            const ref = doc(targetCollection(ev))
            batch.set(ref, {
              uid: ev.uid,
              sessionId: ev.sessionId,
              classId: ev.classId ?? null,
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
    // Best-effort: beforeunload won't wait for Firestore's async commits,
    // so up to the final FLUSH_MS window of events can be lost on tab
    // close. Acceptable for telemetry; a sendBeacon path would need a
    // server endpoint, which this Firebase-only deployment avoids.
    const onUnload = () => { void flush() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', onUnload)
      void flush()
    }
  }, [flush])

  const onEvent = useMemo(() => {
    return (type: string, payload: Record<string, unknown>) => {
      const { uid, classId, assignmentId, submissionId } = ctx.current
      if (!uid) return
      buffer.current.push({
        uid,
        sessionId: sessionIdRef.current,
        classId,
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
