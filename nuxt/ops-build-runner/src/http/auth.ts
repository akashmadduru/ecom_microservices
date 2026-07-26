import { ServiceUnavailableError, UnauthorizedError } from '../errors.js'
import { constantTimeEquals } from '../token.js'

/**
 * Bearer-token check for every route. Mirrors nuxt/ops-dashboard's
 * server/middleware/auth.ts convention exactly (hash-then-`timingSafeEqual`,
 * fail closed 503 if the token is unconfigured) -- but this is a NEW,
 * separate credential (`BUILD_RUNNER_TOKEN`). Never reuse `OPS_API_TOKEN`;
 * this is a structurally separate subsystem, not an extension of
 * ops-dashboard, and a compromise of one credential must not also compromise
 * the other.
 */
export function assertAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string | undefined,
): void {
  if (!expectedToken) {
    throw new ServiceUnavailableError('BUILD_RUNNER_TOKEN is not configured; the API is disabled.')
  }

  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i)
  const presented = match?.[1]?.trim() ?? ''

  if (!presented || !constantTimeEquals(presented, expectedToken)) {
    throw new UnauthorizedError('Missing or invalid bearer token.')
  }
}
