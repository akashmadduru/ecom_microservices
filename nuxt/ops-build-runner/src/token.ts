import { createHash, timingSafeEqual } from 'node:crypto'

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

/**
 * Constant-time string comparison. Ported from nuxt/ops-dashboard's
 * server/runtime/token.ts (`constantTimeEquals`) -- same rationale applies
 * here verbatim, so it is restated rather than imported (this service shares
 * no dependency with ops-dashboard by design; see docs/apps/ops-build-runner/DecisionLog.md).
 *
 * Both inputs are hashed to fixed 32-byte SHA-256 digests before comparison,
 * so `timingSafeEqual` always sees equal-length buffers and never throws on a
 * length mismatch -- an exception path that would itself leak the compared
 * value's length.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b))
}

/** Same construction, used for approval-code hash storage/verification. */
export function sha256Hex(value: string): string {
  return sha256(value).toString('hex')
}
