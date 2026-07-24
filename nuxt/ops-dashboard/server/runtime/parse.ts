import type { HealthState } from './types'

/**
 * Derive a structured health state from Docker's human-readable status string,
 * e.g. `"Up 3 hours (healthy)"` -> `'healthy'`.
 *
 * This exists because dockerode's `listContainers()` summary payload does NOT
 * carry a structured health object; only a per-container `inspect()` does. For
 * the list endpoint we parse the text to avoid N extra inspect calls per
 * refresh. The detail endpoint uses the structured `State.Health.Status`
 * instead (see normalizeHealthStatus).
 */
export function parseHealthFromStatus(status: string | undefined): HealthState {
  if (!status) return 'none'
  const lowered = status.toLowerCase()
  if (lowered.includes('(healthy)')) return 'healthy'
  if (lowered.includes('(unhealthy)')) return 'unhealthy'
  if (lowered.includes('(health: starting)') || lowered.includes('(starting)')) {
    return 'starting'
  }
  return 'none'
}

/** Normalize the structured `State.Health.Status` from inspect() output. */
export function normalizeHealthStatus(raw: string | undefined | null): HealthState {
  switch (raw) {
    case 'healthy':
      return 'healthy'
    case 'unhealthy':
      return 'unhealthy'
    case 'starting':
      return 'starting'
    default:
      return 'none'
  }
}

/** Strip dockerode's leading `/` from a container name. */
export function stripLeadingSlash(name: string | undefined): string {
  if (!name) return ''
  return name.startsWith('/') ? name.slice(1) : name
}

/** Coerce a Docker unix-epoch-seconds timestamp into an ISO string. */
export function epochSecondsToIso(created: number | undefined): string {
  if (!created || Number.isNaN(created)) return new Date(0).toISOString()
  return new Date(created * 1000).toISOString()
}

/** Coerce a Docker RFC3339/ISO timestamp string into an ISO string, or null. */
export function isoOrNull(value: string | undefined | null): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}
