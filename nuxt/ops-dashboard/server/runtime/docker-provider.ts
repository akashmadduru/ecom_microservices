import type Docker from 'dockerode'
import type {
  ContainerDetail,
  ContainerSummary,
  HealthReport,
  ImageDetail,
  ImageHistoryEntry,
  ImageReference,
  ImageSummary,
  LogStreamOptions,
  NetworkContainerAttachment,
  NetworkDetail,
  NetworkSummary,
  RuntimeProvider,
  VolumeDetail,
  VolumeSummary,
} from './types'
import {
  epochSecondsToIso,
  isoOrNull,
  normalizeHealthStatus,
  parseHealthFromStatus,
  stripLeadingSlash,
} from './parse'
import { aggregateHealth } from './health-aggregate'

const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service'
const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'

/**
 * Docker's list/inspect APIs represent an untagged (dangling) image's
 * `RepoTags` inconsistently across engine versions — some return `[]`,
 * others include this literal sentinel entry. Filtering it out before
 * computing `repoTags`/`dangling` keeps `dangling: repoTags.length === 0`
 * true regardless of which shape the connected engine happens to return.
 */
const UNTAGGED_SENTINEL = '<none>:<none>'

/**
 * dockerode-backed, read-only RuntimeProvider. Every method maps raw dockerode
 * payloads into the narrow, stable DTOs the API returns — routers never see
 * dockerode types directly.
 */
export class DockerProvider implements RuntimeProvider {
  constructor(private readonly docker: Docker) {}

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping()
      return true
    } catch {
      // Readiness-style probe: must never throw, false means "not reachable".
      return false
    }
  }

  async listContainers(): Promise<ContainerSummary[]> {
    const raw = await this.docker.listContainers({ all: true })
    return raw.map((c) => this.mapSummary(c))
  }

  async inspectContainer(id: string): Promise<ContainerDetail> {
    const info = await this.docker.getContainer(id).inspect()
    const labels = info.Config?.Labels ?? {}
    const service = labels[COMPOSE_SERVICE_LABEL] ?? null
    const networks = Object.keys(info.NetworkSettings?.Networks ?? {})

    const ports = Object.entries(info.NetworkSettings?.Ports ?? {}).flatMap(
      ([spec, bindings]) => {
        const [portStr, type] = spec.split('/')
        const privatePort = Number.parseInt(portStr ?? '0', 10)
        if (!bindings || bindings.length === 0) {
          return [{ privatePort, publicPort: null, type: type ?? 'tcp', ip: null }]
        }
        return bindings.map((b) => ({
          privatePort,
          publicPort: b.HostPort ? Number.parseInt(b.HostPort, 10) : null,
          type: type ?? 'tcp',
          ip: b.HostIp || null,
        }))
      },
    )

    const mounts = (info.Mounts ?? []).map((m) => ({
      type: m.Type ?? 'unknown',
      source: m.Source ?? '',
      destination: m.Destination ?? '',
      mode: m.Mode ?? '',
      readWrite: m.RW ?? false,
    }))

    const envKeys = (info.Config?.Env ?? []).map((entry) => {
      const eq = entry.indexOf('=')
      return eq === -1 ? entry : entry.slice(0, eq)
    })

    const health = normalizeHealthStatus(info.State?.Health?.Status)

    return {
      id: info.Id,
      name: stripLeadingSlash(info.Name),
      image: info.Config?.Image ?? '',
      state: info.State?.Status ?? 'unknown',
      status: info.State?.Status ?? 'unknown',
      health,
      service,
      project: labels[COMPOSE_PROJECT_LABEL] ?? null,
      managed: service !== null,
      createdAt: isoOrNull(info.Created) ?? new Date(0).toISOString(),
      running: info.State?.Running ?? false,
      exitCode: typeof info.State?.ExitCode === 'number' ? info.State.ExitCode : null,
      restartCount: info.RestartCount ?? 0,
      command: [info.Path, ...(info.Args ?? [])].filter(Boolean).join(' '),
      networks,
      ports,
      mounts,
      labels,
      envKeys,
    }
  }

  async listNetworks(): Promise<NetworkSummary[]> {
    const raw = await this.docker.listNetworks()
    return raw.map((n) => {
      const ipamSubnets = (n.IPAM?.Config ?? [])
        .map((cfg) => cfg.Subnet)
        .filter((s): s is string => Boolean(s))
      const containers = Object.values(n.Containers ?? {})
        .map((c) => stripLeadingSlash(c.Name))
        .filter(Boolean)
      return {
        id: n.Id,
        name: n.Name,
        driver: n.Driver ?? 'unknown',
        scope: n.Scope ?? 'unknown',
        internal: n.Internal ?? false,
        attachable: n.Attachable ?? false,
        ipamSubnets,
        containers,
        createdAt: isoOrNull(n.Created),
      }
    })
  }

  /**
   * Real per-network inspect — richer than slicing `listNetworks()`'s summary,
   * matching how `inspectContainer` does a real inspect rather than reusing
   * `listContainers()`'s summary shape (see `NetworkDetail`'s doc comment).
   */
  async inspectNetwork(id: string): Promise<NetworkDetail> {
    const info = await this.docker.getNetwork(id).inspect()
    const ipamSubnets = (info.IPAM?.Config ?? [])
      .map((cfg) => cfg.Subnet)
      .filter((s): s is string => Boolean(s))
    const containerEntries = Object.entries(info.Containers ?? {})
    const containers = containerEntries
      .map(([, c]) => stripLeadingSlash(c.Name))
      .filter(Boolean)
    const containerDetails: NetworkContainerAttachment[] = containerEntries.map(
      ([containerId, c]) => ({
        id: containerId,
        name: stripLeadingSlash(c.Name),
        ipv4Address: c.IPv4Address || null,
        ipv6Address: c.IPv6Address || null,
        macAddress: c.MacAddress || null,
      }),
    )
    return {
      id: info.Id,
      name: info.Name,
      driver: info.Driver ?? 'unknown',
      scope: info.Scope ?? 'unknown',
      internal: info.Internal ?? false,
      attachable: info.Attachable ?? false,
      ipamSubnets,
      containers,
      createdAt: isoOrNull(info.Created),
      containerDetails,
      options: info.Options ?? {},
      labels: info.Labels ?? {},
    }
  }

  async listVolumes(): Promise<VolumeSummary[]> {
    const result = await this.docker.listVolumes()
    const volumes = result.Volumes ?? []
    return volumes.map((v) => ({
      // Docker volume names ARE their identity — no separate id exists (see
      // VolumeSummary.id's doc comment in types.ts).
      id: v.Name,
      name: v.Name,
      driver: v.Driver ?? 'unknown',
      mountpoint: v.Mountpoint ?? '',
      scope: v.Scope ?? 'unknown',
      // CreatedAt is present on the list payload at runtime but absent from
      // dockerode's VolumeInspectInfo type; read it defensively.
      createdAt: isoOrNull((v as { CreatedAt?: string }).CreatedAt),
      labels: v.Labels ?? {},
    }))
  }

  /**
   * Real per-volume inspect — richer than slicing `listVolumes()`'s summary
   * (surfaces driver `Options` and the opaque, driver-specific `Status` blob
   * neither of which the list payload exposes), matching how `inspectContainer`
   * does a real inspect rather than reusing the list summary shape.
   */
  async inspectVolume(id: string): Promise<VolumeDetail> {
    const info = await this.docker.getVolume(id).inspect()
    return {
      id: info.Name,
      name: info.Name,
      driver: info.Driver ?? 'unknown',
      mountpoint: info.Mountpoint ?? '',
      scope: info.Scope ?? 'unknown',
      createdAt: isoOrNull((info as { CreatedAt?: string }).CreatedAt),
      labels: info.Labels ?? {},
      options: info.Options ?? {},
      status: info.Status ?? null,
    }
  }

  async listImages(): Promise<ImageSummary[]> {
    const [images, containers] = await Promise.all([
      this.docker.listImages(),
      this.docker.listContainers({ all: true }),
    ])
    const counts = this.countContainersByImageId(containers)
    return images.map((img) => {
      const repoTags = (img.RepoTags ?? []).filter((t) => t !== UNTAGGED_SENTINEL)
      return {
        id: img.Id,
        repoTags,
        size: img.Size,
        createdAt: epochSecondsToIso(img.Created),
        dangling: repoTags.length === 0,
        containerCount: counts.get(img.Id) ?? 0,
      }
    })
  }

  async inspectImage(id: string): Promise<ImageDetail> {
    const image = this.docker.getImage(id)
    const [info, rawHistory, containers] = await Promise.all([
      image.inspect(),
      image.history(),
      this.docker.listContainers({ all: true }),
    ])
    const repoTags = (info.RepoTags ?? []).filter((t) => t !== UNTAGGED_SENTINEL)
    const referencedBy = this.referencesFor(info.Id, containers)
    return {
      id: info.Id,
      repoTags,
      size: info.Size,
      createdAt: isoOrNull(info.Created),
      dangling: repoTags.length === 0,
      containerCount: referencedBy.length,
      labels: info.Config?.Labels ?? {},
      layers: info.RootFS?.Layers ?? null,
      history: this.mapHistory(rawHistory),
      referencedBy,
    }
  }

  async getHealth(): Promise<HealthReport> {
    const engineReachable = await this.ping()
    const containers = await this.listContainers()
    return aggregateHealth(containers, engineReachable)
  }

  streamLogs(id: string, opts: LogStreamOptions): Promise<NodeJS.ReadableStream> {
    // We always follow here, which dockerode types as resolving to a Node
    // stream (the non-follow overload resolves to a Buffer). Pin `follow: true`
    // to select that overload.
    return this.docker.getContainer(id).logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: opts.tail,
      timestamps: opts.timestamps,
    }) as Promise<NodeJS.ReadableStream>
  }

  private mapSummary(c: Docker.ContainerInfo): ContainerSummary {
    const labels = c.Labels ?? {}
    const service = labels[COMPOSE_SERVICE_LABEL] ?? null
    const networks = Object.keys(c.NetworkSettings?.Networks ?? {})
    return {
      id: c.Id,
      name: stripLeadingSlash(c.Names?.[0]),
      image: c.Image,
      state: c.State,
      status: c.Status,
      health: parseHealthFromStatus(c.Status),
      service,
      project: labels[COMPOSE_PROJECT_LABEL] ?? null,
      managed: service !== null,
      networks,
      createdAt: epochSecondsToIso(c.Created),
    }
  }

  /**
   * `containerCount` for `listImages()`: cross-reference each container's
   * resolved `ImageID` (the full digest, always populated by the engine, as
   * opposed to `Image`, which may just be the tag the container was created
   * with) against each image's own `Id` — the two are the same value space.
   */
  private countContainersByImageId(containers: Docker.ContainerInfo[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const c of containers) {
      counts.set(c.ImageID, (counts.get(c.ImageID) ?? 0) + 1)
    }
    return counts
  }

  /** `referencedBy` for `inspectImage()` — same cross-reference as above, with full reference objects. */
  private referencesFor(imageId: string, containers: Docker.ContainerInfo[]): ImageReference[] {
    const labelsOf = (c: Docker.ContainerInfo): Record<string, string> => c.Labels ?? {}
    return containers
      .filter((c) => c.ImageID === imageId)
      .map((c) => ({
        containerId: c.Id,
        containerName: stripLeadingSlash(c.Names?.[0]),
        service: labelsOf(c)[COMPOSE_SERVICE_LABEL] ?? null,
      }))
  }

  /**
   * `docker.getImage(id).history()` is typed `Promise<any>` by @types/dockerode
   * (the underlying Engine API response has no first-class TS shape upstream),
   * so this maps it defensively field-by-field rather than trusting the type.
   * A layer with no tag of its own reports `Id: "<missing>"`; normalized to
   * `null` here rather than leaking that Docker-internal sentinel string.
   */
  private mapHistory(raw: unknown): ImageHistoryEntry[] {
    const entries = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
    return entries.map((h) => ({
      id: typeof h.Id === 'string' && h.Id !== '<missing>' ? h.Id : null,
      createdAt: typeof h.Created === 'number' ? epochSecondsToIso(h.Created) : null,
      createdBy: typeof h.CreatedBy === 'string' ? h.CreatedBy : '',
      size: typeof h.Size === 'number' ? h.Size : 0,
    }))
  }
}
