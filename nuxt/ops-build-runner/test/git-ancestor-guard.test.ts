import { describe, expect, it, vi } from 'vitest'
import { NotImplementedGitAncestorGuard, RealGitAncestorGuard } from '../src/git-ancestor-guard.ts'
import type { GitCheckoutManager } from '../src/git-checkout.ts'

describe('NotImplementedGitAncestorGuard', () => {
  it('always rejects -- this is a Phase 1 placeholder, never a permissive stub', async () => {
    const guard = new NotImplementedGitAncestorGuard()

    const result1 = await guard.verifyAncestor('main')
    const result2 = await guard.verifyAncestor('deadbeef')
    const result3 = await guard.verifyAncestor('')

    for (const result of [result1, result2, result3]) {
      expect(result.ok).toBe(false)
      expect(result.reason.length).toBeGreaterThan(0)
      expect(result.resolvedSha).toBeUndefined()
    }
  })
})

function makeFakeCheckout(overrides: Partial<GitCheckoutManager> = {}): GitCheckoutManager {
  return {
    fetchLatest: vi.fn(async () => undefined),
    resolveRef: vi.fn(async () => 'deadbeef'.repeat(5)),
    isAncestorOfMain: vi.fn(async () => true),
    prepareBuildContext: vi.fn(async () => '/tmp/whatever'),
    cleanupBuildContext: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as GitCheckoutManager
}

describe('RealGitAncestorGuard', () => {
  it('always fetches fresh state before resolving/verifying -- never trusts a stale cache', async () => {
    const checkout = makeFakeCheckout()
    const guard = new RealGitAncestorGuard(checkout)

    await guard.verifyAncestor('main')

    expect(checkout.fetchLatest).toHaveBeenCalledTimes(1)
  })

  it('rejects with a specific reason when the ref cannot be resolved at all', async () => {
    const checkout = makeFakeCheckout({ resolveRef: vi.fn(async () => null) })
    const guard = new RealGitAncestorGuard(checkout)

    const result = await guard.verifyAncestor('does-not-exist')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/could not be resolved/)
    expect(result.resolvedSha).toBeUndefined()
    expect(checkout.isAncestorOfMain).not.toHaveBeenCalled()
  })

  it('rejects with the specific "not an ancestor of main" reason when it resolves but is not an ancestor', async () => {
    const checkout = makeFakeCheckout({
      resolveRef: vi.fn(async () => 'abc123'),
      isAncestorOfMain: vi.fn(async () => false),
    })
    const guard = new RealGitAncestorGuard(checkout)

    const result = await guard.verifyAncestor('some-untrusted-branch')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not an ancestor of main/)
  })

  it('returns ok:true with the resolved sha when the ref resolves and is an ancestor of main', async () => {
    const checkout = makeFakeCheckout({
      resolveRef: vi.fn(async () => 'cafef00d'),
      isAncestorOfMain: vi.fn(async () => true),
    })
    const guard = new RealGitAncestorGuard(checkout)

    const result = await guard.verifyAncestor('main')

    expect(result.ok).toBe(true)
    expect(result.resolvedSha).toBe('cafef00d')
  })

  it('propagates infrastructure-level errors (e.g. fetchLatest failing) rather than masking them as a normal rejection', async () => {
    const checkout = makeFakeCheckout({
      fetchLatest: vi.fn(async () => {
        throw new Error('GIT_REMOTE_URL is not configured')
      }),
    })
    const guard = new RealGitAncestorGuard(checkout)

    await expect(guard.verifyAncestor('main')).rejects.toThrow(/GIT_REMOTE_URL/)
  })
})
