import type Docker from 'dockerode'
import type {
  ContainerDetail,
  ContainerSummary,
  HealthReport,
  LogStreamOptions,
  NetworkSummary,
  RuntimeProvider,
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

  async listVolumes(): Promise<VolumeSummary[]> {
    const result = await this.docker.listVolumes()
    const volumes = result.Volumes ?? []
    return volumes.map((v) => ({
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
}
