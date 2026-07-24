import type {
  ContainerDetail,
  ContainerSummary,
  HealthReport,
  NetworkSummary,
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

  return {
    ping: () => get<{ ok: boolean }>('/api/ping'),
    getHealth: () => get<HealthReport>('/api/health'),
    listContainers: () => get<{ containers: ContainerSummary[] }>('/api/containers'),
    inspectContainer: (id: string) => get<ContainerDetail>(`/api/containers/${encodeURIComponent(id)}`),
    listNetworks: () => get<{ networks: NetworkSummary[] }>('/api/networks'),
    listVolumes: () => get<{ volumes: VolumeSummary[] }>('/api/volumes'),
    /** Build the SSE URL for a container's logs (auth goes in the header, added by the consumer). */
    logsUrl: (id: string, opts: { tail: number; timestamps: boolean }) =>
      `/api/containers/${encodeURIComponent(id)}/logs?tail=${opts.tail}&timestamps=${opts.timestamps}`,
    authHeaders,
  }
}
