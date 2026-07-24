import { createHash, timingSafeEqual } from 'node:crypto'

const sha256 = (value: string): Buffer =>
  createHash('sha256').update(value, 'utf8').digest()

/**
 * Constant-time token comparison.
 *
 * Both inputs are hashed to fixed 32-byte SHA-256 digests before comparison, so
 * timingSafeEqual always sees equal-length buffers and never throws on a length
 * mismatch — an exception path that would itself leak the token length.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b))
}
