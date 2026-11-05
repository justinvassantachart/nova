import type { WebIDEInstanceHandle } from 'web-ide'

/** One attempt after workspace admission; never compile on edits or execute code. */
export function scheduleInitialWarmup(instance: WebIDEInstanceHandle): () => void {
  let attempted = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancelScheduled = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const inspect = () => {
    const snapshot = instance.snapshot()
    if (snapshot.debug.debugMode !== 'idle') {
      attempted = true
      cancelScheduled()
    }
    if (attempted || timer !== undefined || document.visibilityState === 'hidden'
      || !Object.keys(snapshot.workspace).some(path => /\.(c|cpp|cc|cxx)$/i.test(path))) return
    // Give first paint, workspace restoration, and explicit foreground intent priority.
    timer = setTimeout(() => {
      timer = undefined
      if (document.visibilityState === 'hidden') return
      attempted = true
      void instance.warmup?.().catch(() => { /* Foreground Run remains available. */ })
    }, 750)
  }
  const visibility = () => {
    if (document.visibilityState === 'hidden') {
      cancelScheduled()
      void instance.cancelWarmup?.()
      void instance.releaseCompilerResources?.()
    } else inspect()
  }
  const unsubscribe = instance.subscribe(inspect)
  document.addEventListener('visibilitychange', visibility)
  inspect()
  return () => {
    attempted = true
    cancelScheduled()
    unsubscribe()
    document.removeEventListener('visibilitychange', visibility)
    void instance.cancelWarmup?.()
  }
}
