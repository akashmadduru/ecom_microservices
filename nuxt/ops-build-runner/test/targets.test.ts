import { describe, expect, it } from 'vitest'
import { BUILD_TARGETS, isBuildTarget } from '../src/targets.ts'

describe('BUILD_TARGETS allowlist', () => {
  it('has exactly 7 entries', () => {
    expect(Object.keys(BUILD_TARGETS)).toHaveLength(7)
  })

  it('contains exactly the 7 approved targets', () => {
    expect(Object.keys(BUILD_TARGETS).sort()).toEqual(
      [
        'ops-dashboard',
        'api-gateway',
        'auth-service',
        'inventory-service',
        'product-service',
        'ecom-admin',
        'ecom-web',
      ].sort(),
    )
  })

  it('isBuildTarget accepts every allowlisted key', () => {
    for (const key of Object.keys(BUILD_TARGETS)) {
      expect(isBuildTarget(key)).toBe(true)
    }
  })

  it('isBuildTarget rejects anything not on the allowlist', () => {
    expect(isBuildTarget('not-a-real-target')).toBe(false)
    expect(isBuildTarget('')).toBe(false)
    expect(isBuildTarget('ops-dashboard; rm -rf /')).toBe(false)
    // Case sensitivity matters -- no fuzzy/normalized matching.
    expect(isBuildTarget('OPS-DASHBOARD')).toBe(false)
  })

  it('every entry has a dockerfilePath and buildContext', () => {
    for (const target of Object.values(BUILD_TARGETS)) {
      expect(typeof target.dockerfilePath).toBe('string')
      expect(target.dockerfilePath.length).toBeGreaterThan(0)
      expect(typeof target.buildContext).toBe('string')
      expect(target.buildContext.length).toBeGreaterThan(0)
    }
  })
})
