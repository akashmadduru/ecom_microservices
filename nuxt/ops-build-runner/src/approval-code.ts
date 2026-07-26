import { randomBytes } from 'node:crypto'
import { constantTimeEquals, sha256Hex } from './token.js'

export interface IssuedApprovalCode {
  /** Plaintext code -- hand this to the notifier, then discard. Never persist it. */
  plaintext: string
  /** SHA-256 hex digest -- the only form that is ever stored. */
  hash: string
}

/**
 * Issue a new approval code: cryptographically random, returned once as
 * plaintext (for the caller to hand to `ApprovalNotifier.sendApprovalCode`)
 * and as a SHA-256 hash (the only form persisted to `build_requests`). The
 * plaintext is never logged and never written to the database -- callers
 * must not retain it beyond the notifier call.
 */
export function issueApprovalCode(): IssuedApprovalCode {
  const plaintext = randomBytes(16).toString('hex')
  return { plaintext, hash: sha256Hex(plaintext) }
}

/**
 * Verify a presented approval code against the stored hash AND expiry.
 * `issuedAt` is the timestamp the code was issued at (created_at for the
 * initial approval code, launch_requested_at for the launch-approval code --
 * see migrations/0001_build_requests.sql's comment on why there is no
 * separate expiry column). Both the hash match and the expiry check must
 * pass; a stored hash of `null` (no code ever issued, or already consumed by
 * a state that no longer accepts this action) always fails closed.
 */
export function verifyApprovalCode(params: {
  presented: string
  storedHash: string | null
  issuedAt: Date | null
  ttlMinutes: number
  now?: Date
}): boolean {
  const { presented, storedHash, issuedAt, ttlMinutes } = params
  const now = params.now ?? new Date()

  if (!presented || !storedHash || !issuedAt) return false

  // constantTimeEquals hashes both sides again before comparing (see
  // token.ts) -- deliberately NOT a plain `===` or a length-check-then-compare
  // short circuit, both of which would leak timing/shape information about
  // the stored hash.
  const hashesMatch = constantTimeEquals(sha256Hex(presented), storedHash)

  const expiresAt = new Date(issuedAt.getTime() + ttlMinutes * 60_000)
  const notExpired = now.getTime() <= expiresAt.getTime()

  return hashesMatch && notExpired
}
