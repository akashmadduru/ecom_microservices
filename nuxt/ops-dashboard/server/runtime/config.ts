/**
 * Central resolution of operator-facing environment variables: OPS_API_TOKEN,
 * DOCKER_HOST / DOCKER_PORT (read-only proxy), MUTATE_DOCKER_HOST /
 * MUTATE_DOCKER_PORT (separate mutate-only proxy), the Phase 2 mutation gates
 * OPS_ALLOW_MUTATIONS / OPS_MANAGED_SERVICES, and the Phase 3 backend switch
 * RUNTIME_MODE / K8S_NAMESPACE.
 *
 * Read from `process.env` directly (not just useRuntimeConfig) so these exact
 * documented names are honored at *runtime*, even for a production
 * `node .output/server/index.mjs` start where Nuxt would otherwise only
 * re-read NUXT_-prefixed vars.
 */

/**
 * Which container runtime the dashboard observes. `docker` (the default, so
 * nothing changes for existing deployments) talks to the Docker Engine API via
 * the read-only socket proxy; `kubernetes` talks to a Kubernetes API server via
 * the standard `@kubernetes/client-node` ambient kubeconfig resolution. The two
 * modes are mutually exclusive per process.
 */
export type RuntimeMode = 'docker' | 'kubernetes'

export interface OpsConfig {
  /**
   * Selected runtime backend. Parsed from `RUNTIME_MODE`; ONLY the exact string
   * `"kubernetes"` selects the Kubernetes provider — every other value (unset,
   * empty, `"docker"`, anything else) resolves to `docker`, so the default and
   * all pre-Phase-3 deployments keep their exact existing behavior.
   */
  runtimeMode: RuntimeMode
  /**
   * Kubernetes namespace scope (only meaningful when `runtimeMode` is
   * `kubernetes`). Empty/unset means "all namespaces" — parity with Docker mode
   * seeing the whole engine. A specific value scopes pod/service/PVC listings to
   * just that namespace. Parsed from `K8S_NAMESPACE`.
   */
  k8sNamespace: string
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
    // Strict equality with "kubernetes": anything else resolves to docker, so
    // the default path is unchanged for every existing deployment.
    runtimeMode: process.env.RUNTIME_MODE === 'kubernetes' ? 'kubernetes' : 'docker',
    k8sNamespace: (process.env.K8S_NAMESPACE ?? '').trim(),
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
