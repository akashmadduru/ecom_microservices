import { describe, expect, it } from 'vitest'
import { constantTimeEquals } from '../server/runtime/token'

describe('constantTimeEquals', () => {
  it('returns true for identical tokens (happy path)', () => {
    expect(constantTimeEquals('s3cr3t-token', 's3cr3t-token')).toBe(true)
  })

  it('returns false for different tokens of equal length', () => {
    expect(constantTimeEquals('aaaaaa', 'bbbbbb')).toBe(false)
  })

  it('returns false — and does NOT throw — for different-length tokens (edge case)', () => {
    // The whole point of hashing first: unequal lengths must not throw.
    expect(() => constantTimeEquals('short', 'a-much-longer-token')).not.toThrow()
    expect(constantTimeEquals('short', 'a-much-longer-token')).toBe(false)
  })

  it('returns false when the presented token is empty', () => {
    expect(constantTimeEquals('', 'expected')).toBe(false)
  })
})
