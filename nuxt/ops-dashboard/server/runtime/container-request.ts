import { createError } from 'h3'

/**
 * Docker container IDs are 64-char hex (or a truncated prefix); container
 * *names* (also accepted everywhere a container ref is) follow
 * `/?[a-zA-Z0-9][a-zA-Z0-9_.-]+`. This allowlist covers both.
 *
 * Why this matters: dockerode builds Docker Engine API request paths by raw
 * string concatenation (e.g. `/containers/' + id + '/json`), with no
 * encoding. A route param containing `/` or `?` can inject additional path
 * segments/query params into the request the proxy receives. The read-only
 * proxy allowlist bounds the damage today (no mutating endpoint is reachable
 * regardless), but an input this far upstream of a host-root-adjacent API
 * must be validated at the boundary — never rely solely on a downstream
 * allowlist to make an unvalidated input safe.
 */
const CONTAINER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/

/** Extract and validate the `id` route param, or throw a 400. */
export function assertValidContainerId(id: string | undefined | null): string {
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing container id.' })
  }
  if (!CONTAINER_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid container id.' })
  }
  return id
}

/**
 * Translate a "not found" error from either backend into a 404, rethrowing
 * anything else unchanged. The two backends report it differently:
 *   - dockerode: an error object with a `statusCode` property.
 *   - @kubernetes/client-node: an `ApiException` with a `code` property
 *     (NOT `statusCode`) — missed in the initial Phase 3 pass, since a
 *     not-found pod would otherwise fall through to a generic rethrown 500
 *     instead of a proper 404.
 */
export function translateDockerNotFound(err: unknown, id: string): never {
  const status = (err as { statusCode?: number; code?: number })?.statusCode
    ?? (err as { statusCode?: number; code?: number })?.code
  if (status === 404) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `No such container: ${id}` })
  }
  throw err as Error
}
