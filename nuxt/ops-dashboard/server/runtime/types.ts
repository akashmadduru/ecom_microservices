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
  /**
   * Names of containers attached to this network. Docker: populated directly
   * from the list payload. Kubernetes: always empty here — resolving backing
   * pods would need an N+1 labelSelector query per Service, deliberately
   * skipped at list scale (see `inspectNetwork`'s doc comment, which does pay
   * that one extra query for a single requested network).
   */
  containers: string[]
  createdAt: string | null
}

/** A single container/pod's endpoint attachment to a network, from a real inspect. */
export interface NetworkContainerAttachment {
  id: string
  name: string
  ipv4Address: string | null
  ipv6Address: string | null
  macAddress: string | null
}

/**
 * Detail view, backed by a per-network `inspect()` call (Docker) or the
 * equivalent single-Service scan (Kubernetes) — richer than the list summary,
 * matching how `ContainerDetail` is richer than `ContainerSummary`.
 */
export interface NetworkDetail extends NetworkSummary {
  /**
   * Per-attachment endpoint detail. Docker: dockerode's `Containers` map from a
   * real network inspect (IPs/MAC per attached container). Kubernetes: pod
   * names resolved via a labelSelector query scoped to this one Service (see
   * `inspectNetwork`'s doc comment for why this one extra query is worth it at
   * single-resource scale but not at list scale) — `ipv4Address`/`ipv6Address`/
   * `macAddress` are always null there, since Services have no per-pod
   * endpoint record the way a Docker network attachment does.
   */
  containerDetails: NetworkContainerAttachment[]
  /** Docker: raw network `Options` (driver-specific tuning knobs). {} in kubernetes mode. */
  options: Record<string, string>
  /**
   * Raw network labels (Docker: `Labels`; Kubernetes: the Service's
   * `metadata.labels`). Added in Phase 5 — not needed by any Phase 4 read-only
   * view, but the Phase 5 mutation guard needs the `com.docker.compose.network`
   * label value to re-derive a network's allowlist eligibility server-side
   * (see `resource-mutation-guard.ts`), and `inspectNetwork` is the one place
   * that already does a real per-network inspect, so it's the natural place to
   * surface this rather than adding a second inspect call just for the guard.
   */
  labels: Record<string, string>
}

export interface VolumeSummary {
  /**
   * Docker: identical to `name` — a Docker volume name IS its identity, there
   * is no separate id. Kubernetes: `namespace_name` (the same encoding scheme
   * `k8s-parse.ts` uses for pod ids), because a PVC name is only unique WITHIN
   * its namespace — with the default "all namespaces" scope
   * (`K8S_NAMESPACE` unset), two different namespaces can otherwise produce two
   * `VolumeSummary` rows with the same `name`, a real collision the `/volumes/:id`
   * detail route would otherwise be unable to disambiguate.
   */
  id: string
  name: string
  driver: string
  mountpoint: string
  scope: string
  createdAt: string | null
  labels: Record<string, string>
}

/**
 * Detail view, backed by a per-volume `inspect()` call (Docker) or the
 * equivalent PVC read (Kubernetes).
 */
export interface VolumeDetail extends VolumeSummary {
  /** Docker: raw volume `Options` (driver-specific mount options). {} in kubernetes mode. */
  options: Record<string, string>
  /**
   * Docker: opaque, driver-specific status blob from a real volume inspect
   * (only some drivers populate this). null in kubernetes mode — a PVC has no
   * equivalent free-form status map.
   */
  status: Record<string, string> | null
}

export interface ImageSummary {
  /**
   * Docker: full `sha256:<64hex>` digest. Kubernetes: the same digest, when
   * cleanly extractable from a pod's `containerStatus.imageID`; otherwise a
   * synthetic base64url id derived from the raw image reference string (a raw
   * reference like `repo/name:tag` contains characters — `/`, `:` — that don't
   * fit the id charset every route id must satisfy, so it's base64url-encoded
   * rather than used verbatim; see `assertValidImageId` and `k8s-parse.ts`).
   */
  id: string
  /** Docker: `RepoTags` (empty = dangling). Kubernetes: the pod-spec image
   * reference(s) seen for this group — not a true repo-tag list, just the
   * closest available analog. */
  repoTags: string[]
  /** Docker: image size in bytes. null in kubernetes mode (no equivalent exposed). */
  size: number | null
  /** Docker: image `Created`. null in kubernetes mode. */
  createdAt: string | null
  /** Docker: `repoTags.length === 0`. Always false in kubernetes mode. */
  dangling: boolean
  /**
   * How many currently-listed containers/pods reference this image, computed
   * by cross-referencing the corresponding `listContainers()` output. Same
   * derivation in both backends.
   */
  containerCount: number
}

export interface ImageReference {
  containerId: string
  containerName: string
  service: string | null
}

export interface ImageHistoryEntry {
  id: string | null
  createdAt: string | null
  createdBy: string
  size: number
}

export interface ImageDetail extends ImageSummary {
  /** Docker: image `Config.Labels`. {} in kubernetes mode. */
  labels: Record<string, string>
  /**
   * Docker: `RootFS.Layers` digests. null in kubernetes mode — a documented
   * gap, not an oversight: no Kubernetes API surfaces per-image layer data.
   */
  layers: string[] | null
  /**
   * Docker: the `docker history` equivalent. null in kubernetes mode, for the
   * same structural reason as `layers`.
   */
  history: ImageHistoryEntry[] | null
  /** Containers/pods currently referencing this image. */
  referencedBy: ImageReference[]
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
  inspectNetwork(id: string): Promise<NetworkDetail>
  listVolumes(): Promise<VolumeSummary[]>
  inspectVolume(id: string): Promise<VolumeDetail>
  listImages(): Promise<ImageSummary[]>
  inspectImage(id: string): Promise<ImageDetail>
  getHealth(): Promise<HealthReport>
  streamLogs(id: string, opts: LogStreamOptions): Promise<NodeJS.ReadableStream>
}
