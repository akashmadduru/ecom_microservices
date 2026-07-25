import { createError } from 'h3'

/**
 * Docker container IDs are 64-char hex (or a truncated prefix); container
 * *names* (also accepted everywhere a container ref is) follow
 * `/?[a-zA-Z0-9][a-zA-Z0-9_.-]+`. This allowlist covers both. Docker network
 * ids/names and volume names draw from this exact same charset, so
 * `assertValidResourceId` below reuses this pattern rather than copy-pasting
 * a near-identical one that could quietly drift out of sync.
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

/**
 * Kubernetes-mode image ids are a base64url-encoded synthetic string (see
 * `ImageSummary.id`'s doc comment in `types.ts`) when no clean digest is
 * extractable, or a real Docker digest otherwise. base64url's own alphabet
 * (`[A-Za-z0-9_-]`) is disjoint from `CONTAINER_ID_PATTERN`'s leading-alnum
 * requirement in one respect (a base64url string may legitimately start with
 * `_` or `-`), so image ids get their own pattern rather than reusing
 * `CONTAINER_ID_PATTERN` as-is.
 */
const IMAGE_ID_PATTERN = /^(sha256:[a-f0-9]{64}|[A-Za-z0-9_-]{1,512})$/

function assertMatchesPattern(id: string | undefined | null, pattern: RegExp, label: string): string {
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Missing ${label} id.` })
  }
  if (!pattern.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid ${label} id.` })
  }
  return id
}

/** Extract and validate the `id` route param for a container, or throw a 400. */
export function assertValidContainerId(id: string | undefined | null): string {
  return assertMatchesPattern(id, CONTAINER_ID_PATTERN, 'container')
}

/**
 * Extract and validate the `id` route param for a network or volume, or throw
 * a 400. Same underlying charset/injection rationale as
 * `assertValidContainerId` above — dockerode builds `/networks/<id>/json` and
 * `/volumes/<name>/json` via the same unescaped string concatenation, so an
 * unvalidated id is exactly as dangerous here.
 */
export function assertValidResourceId(id: string | undefined | null): string {
  return assertMatchesPattern(id, CONTAINER_ID_PATTERN, 'network/volume')
}

/**
 * Extract and validate the `id` route param for an image, or throw a 400. See
 * `IMAGE_ID_PATTERN`'s doc comment for why images get their own pattern
 * instead of reusing `CONTAINER_ID_PATTERN`. The injection rationale is the
 * same: dockerode builds `/images/<id>/json` and `/images/<id>/history` by
 * unescaped concatenation too.
 */
export function assertValidImageId(id: string | undefined | null): string {
  return assertMatchesPattern(id, IMAGE_ID_PATTERN, 'image')
}

/**
 * Translate a "not found" error from either backend into a 404, rethrowing
 * anything else unchanged. The two backends report it differently:
 *   - dockerode: an error object with a `statusCode` property.
 *   - @kubernetes/client-node: an `ApiException` with a `code` property
 *     (NOT `statusCode`) — missed in the initial Phase 3 pass, since a
 *     not-found pod would otherwise fall through to a generic rethrown 500
 *     instead of a proper 404.
 *
 * `resource` labels the 404 message (defaults to "container" so every
 * pre-Phase-4 call site is unaffected); Phase 4's image/network/volume routes
 * pass their own label so the message doesn't misleadingly say "container".
 */
export function translateDockerNotFound(err: unknown, id: string, resource: string = 'container'): never {
  const status = (err as { statusCode?: number; code?: number })?.statusCode
    ?? (err as { statusCode?: number; code?: number })?.code
  if (status === 404) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `No such ${resource}: ${id}` })
  }
  throw err as Error
}
