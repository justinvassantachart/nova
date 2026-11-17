export type EngineBackend = 'upstream' | 'legacy'

/** Build-time rollback switch; never select a backend from workspace contents. */
export function validateEngineBackend(value: string | undefined): EngineBackend {
  if (value === undefined || value === '') return 'upstream'
  if (value === 'upstream' || value === 'legacy') return value
  throw new Error(`Unsupported VITE_ENGINE_BACKEND: ${value}`)
}

export const engineBackend = validateEngineBackend(import.meta.env.VITE_ENGINE_BACKEND)
