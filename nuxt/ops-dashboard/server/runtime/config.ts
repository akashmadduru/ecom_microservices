/**
 * Central resolution of operator-facing environment variables: OPS_API_TOKEN,
 * DOCKER_HOST / DOCKER_PORT (read-only proxy), MUTATE_DOCKER_HOST /
 * MUTATE_DOCKER_PORT (separate container-mutate-only proxy), the Phase 2
 * mutation gates OPS_ALLOW_MUTATIONS / OPS_MANAGED_SERVICES, the Phase 3
 * backend switch RUNTIME_MODE / K8S_NAMESPACE, and the Phase 5 image/volume/
 * network mutation gates OPS_ALLOW_RESOURCE_MUTATIONS / OPS_MANAGED_VOLUMES /
 * OPS_MANAGED_NETWORKS / RESOURCE_MUTATE_DOCKER_HOST / RESOURCE_MUTATE_DOCKER_PORT
 * (a THIRD, separate mutate-only proxy).
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
  /**
   * Phase 5 GLOBAL kill switch for image/volume/network named-remove + prune.
   * True ONLY when `OPS_ALLOW_RESOURCE_MUTATIONS` is exactly the string
   * `"true"` — same fail-closed strictness as `mutationsAllowed`, and
   * deliberately a SEPARATE switch from it: an operator may want container
   * lifecycle mutations without ever allowing image/volume/network deletion
   * (or vice versa), and a single shared switch would remove that choice.
   */
  resourceMutationsAllowed: boolean
  /**
   * Phase 5 per-volume allowlist: the values of the `com.docker.compose.volume`
   * label that MAY be a named-remove target. Parsed from the comma-separated
   * `OPS_MANAGED_VOLUMES`. Empty by default. A volume with no such label can
   * never appear here and is never removable — mirrors `managedServices`
   * exactly, just for a different resource type.
   */
  managedVolumes: string[]
  /**
   * Phase 5 per-network allowlist: the values of the `com.docker.compose.network`
   * label that MAY be a named-remove target. Parsed from the comma-separated
   * `OPS_MANAGED_NETWORKS`. Empty by default. Same shape as `managedVolumes`.
   */
  managedNetworks: string[]
  /**
   * Hostname of a THIRD, dedicated docker-socket-proxy, separate from BOTH
   * `dockerHost` (read-only) and `mutateDockerHost` (container lifecycle
   * mutate). Images/volumes/networks have no per-verb proxy carve-out the way
   * containers do (see docker-compose.ops.yml's residual-risk comment) — the
   * only way to admit named-remove/prune for these resource types through
   * `tecnativa/docker-socket-proxy` is `IMAGES`/`VOLUMES`/`NETWORKS`=1 plus
   * `POST`=1 together, which also technically admits pull/create/connect at
   * the proxy layer. Keeping this on its OWN proxy/network path (never shared
   * with `mutateDockerHost`) means a compromised path to one mutate proxy
   * does not also grant the other's blast radius.
   */
  resourceMutateDockerHost: string
  /** TCP port of the dedicated image/volume/network mutate-only socket proxy. */
  resourceMutateDockerPort: number
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
    // Strict equality with "true": anything else fails closed. Deliberately
    // independent of `mutationsAllowed` above — see the doc comment on
    // `resourceMutationsAllowed` in OpsConfig.
    resourceMutationsAllowed: process.env.OPS_ALLOW_RESOURCE_MUTATIONS === 'true',
    managedVolumes: parseServiceList(process.env.OPS_MANAGED_VOLUMES),
    managedNetworks: parseServiceList(process.env.OPS_MANAGED_NETWORKS),
    resourceMutateDockerHost: process.env.RESOURCE_MUTATE_DOCKER_HOST ?? 'docker-socket-proxy-mutate-resources',
    resourceMutateDockerPort: parsePort(process.env.RESOURCE_MUTATE_DOCKER_PORT, 2375),
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
