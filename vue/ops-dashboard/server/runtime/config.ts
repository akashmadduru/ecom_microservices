/**
 * Central resolution of operator-facing environment variables: OPS_API_TOKEN,
 * DOCKER_HOST / DOCKER_PORT (read-only proxy), MUTATE_DOCKER_HOST /
 * MUTATE_DOCKER_PORT (separate mutate-only proxy), and the Phase 2 mutation
 * gates OPS_ALLOW_MUTATIONS / OPS_MANAGED_SERVICES.
 *
 * Read from `process.env` directly (not just useRuntimeConfig) so these exact
 * documented names are honored at *runtime*, even for a production
 * `node .output/server/index.mjs` start where Nuxt would otherwise only
 * re-read NUXT_-prefixed vars.
 */

export interface OpsConfig {
  /** The expected operator bearer token. Empty string means "unset". */
  opsApiToken: string
  /** Hostname of the read-only docker-socket-proxy. */
  dockerHost: string
  /** TCP port of the read-only socket proxy. */
  dockerPort: number
  /**
   * Hostname of the SEPARATE, dedicated mutate-only docker-socket-proxy.
   * Deliberately a different proxy instance/container than `dockerHost` — see
   * docker-compose.ops.yml for why one proxy config can't safely do both:
   * this image's CONTAINERS toggle matches the broad `/containers` prefix
   * (GET *and* POST) with no way to carve out just start/stop/restart, so a
   * proxy with CONTAINERS=1 (needed for reads) + POST=1 (needed for
   * mutations) would ALSO admit POST /containers/create and /containers/prune.
   * The mutate proxy instead runs with CONTAINERS=0 and only the independent,
   * path-specific ALLOW_START/ALLOW_STOP/ALLOW_RESTARTS rules enabled, so it
   * can reach *only* /containers/{id}/(start|stop|restart|kill) — nothing else.
   */
  mutateDockerHost: string
  /** TCP port of the dedicated mutate-only socket proxy. */
  mutateDockerPort: number
  /**
   * Phase 2 GLOBAL kill switch for mutating container controls. True ONLY when
   * `OPS_ALLOW_MUTATIONS` is exactly the string `"true"` — every other value
   * (unset, empty, `"1"`, `"TRUE"`, `"yes"`) is treated as disabled. Fails
   * closed by design: a mutation endpoint must reject with 403 unless this is
   * explicitly, unambiguously enabled.
   */
  mutationsAllowed: boolean
  /**
   * Phase 2 per-service allowlist: the compose service names
   * (`com.docker.compose.service` label values) that MAY be a mutation target.
   * Parsed from the comma-separated `OPS_MANAGED_SERVICES`. Empty by default,
   * i.e. nothing is mutable even when the global switch is on. A container with
   * no compose service label can never appear here and is never mutable.
   */
  managedServices: string[]
}

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export function getOpsConfig(): OpsConfig {
  return {
    opsApiToken: process.env.OPS_API_TOKEN ?? '',
    dockerHost: process.env.DOCKER_HOST ?? 'docker-socket-proxy',
    dockerPort: parsePort(process.env.DOCKER_PORT, 2375),
    mutateDockerHost: process.env.MUTATE_DOCKER_HOST ?? 'docker-socket-proxy-mutate',
    mutateDockerPort: parsePort(process.env.MUTATE_DOCKER_PORT, 2375),
    // Strict equality with "true": anything else fails closed.
    mutationsAllowed: process.env.OPS_ALLOW_MUTATIONS === 'true',
    managedServices: parseServiceList(process.env.OPS_MANAGED_SERVICES),
  }
}

/** Split a comma-separated service list, trimming blanks and empty entries. */
function parseServiceList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
