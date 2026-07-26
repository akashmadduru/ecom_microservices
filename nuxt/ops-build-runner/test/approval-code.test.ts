import { describe, expect, it } from 'vitest'
import { issueApprovalCode, verifyApprovalCode } from '../src/approval-code.ts'

describe('approval codes', () => {
  it('issues a random plaintext code and a distinct, fixed-length hash', () => {
    const a = issueApprovalCode()
    const b = issueApprovalCode()

    expect(a.plaintext).not.toEqual(b.plaintext)
    expect(a.hash).not.toEqual(b.hash)
    expect(a.plaintext).toHaveLength(32) // randomBytes(16).toString('hex')
    expect(a.hash).toHaveLength(64) // sha256 hex digest
    expect(a.hash).not.toEqual(a.plaintext)
  })

  it('verifies a correct, unexpired code', () => {
    const { plaintext, hash } = issueApprovalCode()
    const issuedAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T00:10:00Z') // 10 minutes later

    const ok = verifyApprovalCode({ presented: plaintext, storedHash: hash, issuedAt, ttlMinutes: 15, now })
    expect(ok).toBe(true)
  })

  it('rejects an incorrect code', () => {
    const { hash } = issueApprovalCode()
    const issuedAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T00:01:00Z')

    const ok = verifyApprovalCode({
      presented: 'not-the-right-code',
      storedHash: hash,
      issuedAt,
      ttlMinutes: 15,
      now,
    })
    expect(ok).toBe(false)
  })

  it('rejects a correct code once the TTL has elapsed', () => {
    const { plaintext, hash } = issueApprovalCode()
    const issuedAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T00:15:01Z') // 15 minutes + 1 second later

    const ok = verifyApprovalCode({ presented: plaintext, storedHash: hash, issuedAt, ttlMinutes: 15, now })
    expect(ok).toBe(false)
  })

  it('accepts exactly at the TTL boundary', () => {
    const { plaintext, hash } = issueApprovalCode()
    const issuedAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T00:15:00Z') // exactly 15 minutes later

    const ok = verifyApprovalCode({ presented: plaintext, storedHash: hash, issuedAt, ttlMinutes: 15, now })
    expect(ok).toBe(true)
  })

  it('fails closed when no code was ever issued (null hash/issuedAt)', () => {
    expect(
      verifyApprovalCode({ presented: 'anything', storedHash: null, issuedAt: new Date(), ttlMinutes: 15 }),
    ).toBe(false)
    expect(
      verifyApprovalCode({ presented: 'anything', storedHash: 'deadbeef', issuedAt: null, ttlMinutes: 15 }),
    ).toBe(false)
  })

  it('fails closed on an empty presented code', () => {
    const { hash } = issueApprovalCode()
    expect(
      verifyApprovalCode({ presented: '', storedHash: hash, issuedAt: new Date(), ttlMinutes: 15 }),
    ).toBe(false)
  })
})
