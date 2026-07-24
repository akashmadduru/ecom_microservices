/**
 * Runtime abstraction over a container engine.
 *
 * READ-ONLY BY DESIGN. There are deliberately no stop/restart/rebuild/remove/
 * disable methods here — Phase 1 scope is strictly observability, and an
 * interface exposing mutating methods (even unimplemented) would misrepresent
 * that guarantee. Do not add them.
 */

export type HealthState = 'healthy' | 'unhealthy' | 'starting' | 'none'

export interface ContainerSummary {
  id: string
  /** Human name with dockerode's leading `/` stripped. */
  name: string
  image: string
  /** Docker `State` field, e.g. `running` / `exited`. */
  state: string
  /** Human status string, e.g. `Up 3 hours (healthy)`. */
  status: string
  /**
   * Parsed from the `status` text for the list endpoint, because dockerode's
   * `listContainers()` summary payload has no structured health object.
   */
  health: HealthState
  /** Compose service name (label `com.docker.compose.service`) or null. */
  service: string | null
  /** Compose project name (label `com.docker.compose.project`) or null. */
  project: string | null
  /** True when the container carries a compose service label. */
  managed: boolean
  /** Names of the networks the container is attached to. */
  networks: string[]
  /** Creation time as an ISO-8601 string. */
  createdAt: string
}

export interface ContainerPort {
  privatePort: number
  publicPort: number | null
  type: string
  ip: string | null
}

export interface ContainerMount {
  type: string
  source: string
  destination: string
  mode: string
  readWrite: boolean
}

/**
 * Detail view, backed by a per-container `inspect()` call — which, unlike the
 * list summary, DOES expose `State.Health.Status` structurally.
 */
export interface ContainerDetail {
  id: string
  name: string
  image: string
  state: string
  /**
   * Same value as `state` (Docker inspect has no separate human-readable
   * status string the way the list summary's `Status` field does — that
   * "Up 3 hours (healthy)" text is synthesized by the CLI/daemon only for
   * `docker ps`, not present in `inspect()`). Kept as its own field for
   * response-shape parity with `ContainerSummary`, not because it carries
   * different information.
   */
  status: string
  health: HealthState
  service: string | null
  project: string | null
  managed: boolean
  createdAt: string
  /** Whether the process is currently running. */
  running: boolean
  /** Non-zero exit code / OOM info surfaced from inspect. */
  exitCode: number | null
  restartCount: number
  command: string
  networks: string[]
  ports: ContainerPort[]
  mounts: ContainerMount[]
  /** All raw labels, useful for operators debugging metadata. */
  labels: Record<string, string>
  /** Environment variable *names* only — values are redacted (secrets). */
  envKeys: string[]
}

export interface NetworkSummary {
  id: string
  name: string
  driver: string
  scope: string
  internal: boolean
  attachable: boolean
  ipamSubnets: string[]
  /** Names of containers attached to this network. */
  containers: string[]
  createdAt: string | null
}

export interface VolumeSummary {
  name: string
  driver: string
  mountpoint: string
  scope: string
  createdAt: string | null
  labels: Record<string, string>
}

export interface HealthServiceRollup {
  service: string
  project: string | null
  total: number
  running: number
  healthy: number
  unhealthy: number
  starting: number
}

export interface HealthReport {
  /** Whether the engine responded to a ping at report time. */
  engineReachable: boolean
  totals: {
    containers: number
    running: number
    healthy: number
    unhealthy: number
    starting: number
    noHealthcheck: number
    stopped: number
  }
  /** Per-compose-service breakdown; unmanaged containers are excluded. */
  services: HealthServiceRollup[]
  generatedAt: string
}

export interface LogStreamOptions {
  tail: number
  follow: boolean
  timestamps: boolean
}

export interface RuntimeProvider {
  ping(): Promise<boolean>
  listContainers(): Promise<ContainerSummary[]>
  inspectContainer(id: string): Promise<ContainerDetail>
  listNetworks(): Promise<NetworkSummary[]>
  listVolumes(): Promise<VolumeSummary[]>
  getHealth(): Promise<HealthReport>
  streamLogs(id: string, opts: LogStreamOptions): Promise<NodeJS.ReadableStream>
}
