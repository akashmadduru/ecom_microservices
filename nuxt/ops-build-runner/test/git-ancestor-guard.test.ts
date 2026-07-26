import { describe, expect, it } from 'vitest'
import { NotImplementedGitAncestorGuard } from '../src/git-ancestor-guard.ts'

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
