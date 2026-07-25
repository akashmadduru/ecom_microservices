import type {
  ContainerDetail,
  ContainerSummary,
  HealthReport,
  ImageDetail,
  ImageSummary,
  NetworkDetail,
  NetworkSummary,
  VolumeDetail,
  VolumeSummary,
} from '~~/server/runtime/types'

/**
 * Thin typed client over the /api surface. Attaches `Authorization: Bearer
 * <token>` (read from sessionStorage via useApiToken) to every request. The
 * token is NEVER put in a query string.
 */
export function useApiClient() {
  const { token } = useApiToken()

  const authHeaders = (): Record<string, string> =>
    token.value ? { Authorization: `Bearer ${token.value}` } : {}

  // The cast is required, not redundant: $fetch<T>()'s actual return type is
  // Promise<TypedInternalResponse<NitroFetchRequest, T, "get">>, which nuxt's
  // typegen does not structurally narrow to Promise<T> on its own.
  const get = <T>(path: string): Promise<T> =>
    $fetch<T>(path, { headers: authHeaders() }) as Promise<T>

  const post = <T>(path: string): Promise<T> =>
    $fetch<T>(path, { method: 'POST', headers: authHeaders() }) as Promise<T>

  return {
    ping: () => get<{ ok: boolean }>('/api/ping'),
    getHealth: () => get<HealthReport>('/api/health'),
    listContainers: () => get<{ containers: ContainerSummary[] }>('/api/containers'),
    inspectContainer: (id: string) => get<ContainerDetail>(`/api/containers/${encodeURIComponent(id)}`),
    listNetworks: () => get<{ networks: NetworkSummary[] }>('/api/networks'),
    getNetwork: (id: string) => get<NetworkDetail>(`/api/networks/${encodeURIComponent(id)}`),
    listVolumes: () => get<{ volumes: VolumeSummary[] }>('/api/volumes'),
    getVolume: (id: string) => get<VolumeDetail>(`/api/volumes/${encodeURIComponent(id)}`),
    // Phase 4: read-only image listing/inspect.
    listImages: () => get<{ images: ImageSummary[] }>('/api/images'),
    inspectImage: (id: string) => get<ImageDetail>(`/api/images/${encodeURIComponent(id)}`),
    /** Build the SSE URL for a container's logs (auth goes in the header, added by the consumer). */
    logsUrl: (id: string, opts: { tail: number; timestamps: boolean }) =>
      `/api/containers/${encodeURIComponent(id)}/logs?tail=${opts.tail}&timestamps=${opts.timestamps}`,
    // Phase 2 mutating controls. Each is gated server-side by the global kill
    // switch + per-service allowlist; the client mirrors that gate via
    // getMutationsConfig() so it only ever renders controls that can succeed.
    getMutationsConfig: () => get<MutationsConfig>('/api/mutations-config'),
    stopContainer: (id: string) => post<MutationResult>(`/api/containers/${encodeURIComponent(id)}/stop`),
    startContainer: (id: string) => post<MutationResult>(`/api/containers/${encodeURIComponent(id)}/start`),
    restartContainer: (id: string) => post<MutationResult>(`/api/containers/${encodeURIComponent(id)}/restart`),
    // Phase 5 image/volume/network mutating controls (named remove + prune).
    // Gated server-side by the resource-mutation kill switch + (for volumes/
    // networks) the OPS_MANAGED_VOLUMES/OPS_MANAGED_NETWORKS allowlists, or
    // (for images) a fresh zero-references check — the client mirrors that
    // gate via getResourceMutationsConfig() so it only ever renders controls
    // that can succeed.
    getResourceMutationsConfig: () => get<ResourceMutationsConfig>('/api/resource-mutations-config'),
    removeImage: (id: string) =>
      post<ResourceMutationResult>(`/api/images/${encodeURIComponent(id)}/remove`),
    pruneImages: () => post<ImagePruneResult>('/api/images/prune'),
    removeVolume: (id: string) =>
      post<ResourceMutationResult>(`/api/volumes/${encodeURIComponent(id)}/remove`),
    pruneVolumes: () => post<VolumePruneResult>('/api/volumes/prune'),
    removeNetwork: (id: string) =>
      post<ResourceMutationResult>(`/api/networks/${encodeURIComponent(id)}/remove`),
    pruneNetworks: () => post<NetworkPruneResult>('/api/networks/prune'),
    authHeaders,
  }
}

/** Shape of GET /api/mutations-config. */
export interface MutationsConfig {
  allowed: boolean
  managedServices: string[]
}

/** Shape returned by the stop/start/restart endpoints. */
export interface MutationResult {
  ok: boolean
  action: 'stop' | 'start' | 'restart'
  id: string
}

/** Shape of GET /api/resource-mutations-config. */
export interface ResourceMutationsConfig {
  allowed: boolean
  managedVolumes: string[]
  managedNetworks: string[]
}

/** Shape returned by the image/volume/network remove endpoints. */
export interface ResourceMutationResult {
  ok: boolean
  action: 'remove'
  resourceType: 'image' | 'volume' | 'network'
  id: string
}

export interface ImagePruneResult {
  ok: boolean
  action: 'prune'
  resourceType: 'image'
  imagesDeleted: string[]
  spaceReclaimed: number
}

export interface VolumePruneResult {
  ok: boolean
  action: 'prune'
  resourceType: 'volume'
  volumesDeleted: string[]
  spaceReclaimed: number
}

export interface NetworkPruneResult {
  ok: boolean
  action: 'prune'
  resourceType: 'network'
  networksDeleted: string[]
}
