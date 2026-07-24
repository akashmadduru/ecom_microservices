import { getOpsConfig } from '../runtime/config'
import { constantTimeEquals } from '../runtime/token'

/**
 * Read a request header robustly across the h3 v2 event shapes we see at
 * runtime: `event.req.headers` may be a web `Headers` (with `.get`) in some
 * runtimes and a plain object in the Nitro node build. Reading it directly (vs.
 * the auto-imported `getRequestHeader`, which assumes web `Headers` and throws
 * on the plain-object shape) keeps the middleware working in both.
 */
function readHeader(event: { req: { headers: unknown } }, name: string): string {
  const headers: unknown = event.req.headers
  if (headers instanceof Headers) {
    return headers.get(name) ?? ''
  }
  if (headers && typeof headers === 'object') {
    const record = headers as Record<string, string | string[] | undefined>
    const value = record[name] ?? record[name.toLowerCase()]
    if (Array.isArray(value)) return value[0] ?? ''
    return value ?? ''
  }
  return ''
}

/**
 * Bearer-token guard for the API surface.
 *
 * - Guards ONLY paths starting with `/api/`. Static assets / the SPA bundle are
 *   served openly; the token lives in sessionStorage at runtime, never in the
 *   build.
 * - Fails CLOSED: if OPS_API_TOKEN is unset the whole API returns 503 (never a
 *   silent bypass).
 * - Compares SHA-256 digests of both tokens with timingSafeEqual. Hashing first
 *   guarantees equal-length (32-byte) buffers, so timingSafeEqual can't throw on
 *   a length mismatch — an exception path that would itself leak token length.
 *
 * This is a SEPARATE, minimal trust domain. It deliberately shares nothing with
 * the platform's auth_service / JWT system.
 */

export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) {
    return
  }

  const { opsApiToken } = getOpsConfig()
  if (!opsApiToken) {
    // Fail closed: misconfiguration must not open the API.
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'OPS_API_TOKEN is not configured; the API is disabled.',
    })
  }

  const header = readHeader(event, 'authorization')
  const match = header.match(/^Bearer\s+(.+)$/i)
  const presented = match?.[1]?.trim() ?? ''

  if (!presented || !constantTimeEquals(presented, opsApiToken)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Missing or invalid operator token.',
    })
  }
})
