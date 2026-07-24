import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The limiter holds process-wide module state (an in-closure counter), so
 * each test resets modules and re-imports to start from a clean count of 0.
 */
async function freshLimiter() {
  vi.resetModules()
  return import('../server/runtime/log-stream-limiter')
}

describe('log stream limiter', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows acquiring slots up to the limit', async () => {
    const { acquireLogStreamSlot } = await freshLimiter()
    // 10 is the documented limit; all of these must succeed without throwing.
    for (let i = 0; i < 10; i += 1) {
      expect(() => acquireLogStreamSlot()).not.toThrow()
    }
  })

  it('rejects the 11th concurrent stream with 429', async () => {
    const { acquireLogStreamSlot } = await freshLimiter()
    for (let i = 0; i < 10; i += 1) acquireLogStreamSlot()
    expect(() => acquireLogStreamSlot()).toThrowError(expect.objectContaining({ statusCode: 429 }))
  })

  it('releasing a slot makes room for another acquire', async () => {
    const { acquireLogStreamSlot, releaseLogStreamSlot } = await freshLimiter()
    for (let i = 0; i < 10; i += 1) acquireLogStreamSlot()
    expect(() => acquireLogStreamSlot()).toThrow()

    releaseLogStreamSlot()
    expect(() => acquireLogStreamSlot()).not.toThrow()
  })

  it('releasing more times than acquired never goes negative (no free extra capacity)', async () => {
    const { acquireLogStreamSlot, releaseLogStreamSlot } = await freshLimiter()
    releaseLogStreamSlot()
    releaseLogStreamSlot()
    releaseLogStreamSlot()

    for (let i = 0; i < 10; i += 1) acquireLogStreamSlot()
    expect(() => acquireLogStreamSlot()).toThrowError(expect.objectContaining({ statusCode: 429 }))
  })
})
