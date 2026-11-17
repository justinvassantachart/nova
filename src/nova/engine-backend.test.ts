import { describe, expect, it } from 'vitest'
import { validateEngineBackend } from './engine-backend'

describe('deployment engine backend', () => {
  it('defaults to upstream and supports an explicit legacy rollback', () => {
    expect(validateEngineBackend(undefined)).toBe('upstream')
    expect(validateEngineBackend('')).toBe('upstream')
    expect(validateEngineBackend('upstream')).toBe('upstream')
    expect(validateEngineBackend('legacy')).toBe('legacy')
  })
  it('rejects a misspelled or workspace-supplied backend value', () => {
    for (const value of ['UPSTREAM', ' legacy', 'default', 'other']) {
      expect(() => validateEngineBackend(value)).toThrow('Unsupported VITE_ENGINE_BACKEND')
    }
  })
})
