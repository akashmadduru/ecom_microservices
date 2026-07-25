import { PassThrough } from 'node:stream'
import { createError } from 'h3'
import type {
  CoreV1Api,
  Log,
  V1Container,
  V1Pod,
  V1Service,
  V1PersistentVolumeClaim,
  VersionApi,
} from '@kubernetes/client-node'
import type {
  ContainerDetail,
  ContainerMount,
  ContainerPort,
  ContainerSummary,
  HealthReport,
  ImageDetail,
  ImageSummary,
  LogStreamOptions,
  NetworkDetail,
  NetworkSummary,
  RuntimeProvider,
  VolumeDetail,
  VolumeSummary,
} from './types'
import {
  decodePodId,
  decodeVolumeId,
  derivePodHealth,
  encodePodId,
  groupPodImages,
  k8sTimestampToIso,
  podIps,
  resolvePodService,
} from './k8s-parse'
import type { PodImageGroup } from './k8s-parse'
import { aggregateHealth } from './health-aggregate'

/**
 * READ-ONLY, generic Kubernetes-backed RuntimeProvider (Phase 3).
 *
 * Implements the SAME `RuntimeProvider` interface as `DockerProvider`, so routes
 * and the frontend are unchanged — the provider is swapped in singleton.ts based
 * on `RUNTIME_MODE`. It uses the standard `@kubernetes/client-node` ambient
 * kubeconfig resolution (no AWS/EKS-specific code), which is why it works against
 * any conformant cluster, EKS included, once the operator has pointed their
 * kubeconfig at it.
 *
 * Kubernetes has no exact analog to Docker's containers/networks/volumes, so
 * each mapping is a deliberate, documented approximation:
 *   - listContainers / inspectContainer -> Pods
 *   - listNetworks                      -> Services
 *   - listVolumes                       -> PersistentVolumeClaims
 * See the per-method comments and k8s-parse.ts for the exact decisions.
 *
 * This provider is strictly read-only: there is no Kubernetes equivalent of the
 * Docker Phase 2 mutating surface, by design (see mutation-guard.ts, which
 * rejects mutation routes outright in kubernetes mode).
 */
export class KubernetesProvider implements RuntimeProvider {
  /**
   * @param namespace Empty string == all namespaces (parity with Docker mode
   * seeing the whole engine); a specific value scopes every list call.
   */
  constructor(
    private readonly core: CoreV1Api,
    private readonly log: Log,
    private readonly version: VersionApi,
    private readonly namespace: string,
  ) {}

  /** Whether the namespace scope is "all namespaces". */
  private get allNamespaces(): boolean {
    return this.namespace === ''
  }

  async ping(): Promise<boolean> {
    try {
      // GET /version — a cheap, un-privileged discovery endpoint. Never throws
      // upward: false means "API server not reachable", matching Docker's ping.
      await this.version.getCode()
      return true
    } catch {
      return false
    }
  }

  async listContainers(): Promise<ContainerSummary[]> {
    const list = this.allNamespaces
      ? await this.core.listPodForAllNamespaces()
      : await this.core.listNamespacedPod({ namespace: this.namespace })
    return (list.items ?? []).map((pod) => this.mapPodSummary(pod))
  }

  async inspectContainer(id: string): Promise<ContainerDetail> {
    const { namespace, name } = decodePodId(id)
    const pod = await this.core.readNamespacedPod({ name, namespace })
    return this.mapPodDetail(pod)
  }

  async listNetworks(): Promise<NetworkSummary[]> {
    const list = this.allNamespaces
      ? await this.core.listServiceForAllNamespaces()
      : await this.core.listNamespacedService({ namespace: this.namespace })
    return (list.items ?? []).map((svc) => this.mapService(svc))
  }

  /**
   * `listNetworks()` deliberately leaves `containers: []` — resolving backing
   * pods per Service would be an N+1 labelSelector query per Service, not
   * worth it at list scale (see `mapService`'s comment). At SINGLE-resource
   * scale, that cost doesn't apply, so the detail route pays the one extra
   * query here — exactly the follow-up flagged in FutureWork.md when this gap
   * was first identified ("If a /networks/:id detail view is ever added...
   * this would be the natural place to do the one extra query per-Service
   * instead of N-per-list").
   */
  async inspectNetwork(id: string): Promise<NetworkDetail> {
    const { namespace, name } = decodePodId(id)
    const svc = await this.core.readNamespacedService({ name, namespace })
    const summary = this.mapService(svc)
    const containers = await this.resolveServiceContainers(svc, namespace)
    return {
      ...summary,
      containers,
      // No per-pod endpoint record (IP/MAC) the way a Docker network
      // attachment has one — containerDetails carries names only.
      containerDetails: containers.map((podName) => ({
        id: podName,
        name: podName,
        ipv4Address: null,
        ipv6Address: null,
        macAddress: null,
      })),
      options: {},
      // Phase 5: Service's own labels — closest analog to a Docker network's
      // `Labels`. Kubernetes mutations are rejected upstream (mutations are
      // Docker-only), so nothing in this codebase reads this in kubernetes
      // mode today, but the field is populated for shape parity with the
      // Docker branch rather than left as a silent {} that would look wrong.
      labels: svc.metadata?.labels ?? {},
    }
  }

  async listVolumes(): Promise<VolumeSummary[]> {
    const list = this.allNamespaces
      ? await this.core.listPersistentVolumeClaimForAllNamespaces()
      : await this.core.listNamespacedPersistentVolumeClaim({ namespace: this.namespace })
    return (list.items ?? []).map((pvc) => this.mapPvc(pvc))
  }

  /**
   * `readNamespacedPersistentVolumeClaim` via the decoded `namespace_name` id
   * (see `VolumeSummary.id`'s doc comment in types.ts for why a PVC needs a
   * namespace-qualified id at all). `decodeVolumeId` throws its own actionable
   * 400 for a bare, separator-less name — genuinely ambiguous in "all
   * namespaces" mode, not just malformed input.
   */
  async inspectVolume(id: string): Promise<VolumeDetail> {
    const { namespace, name } = decodeVolumeId(id)
    const pvc = await this.core.readNamespacedPersistentVolumeClaim({ name, namespace })
    const summary = this.mapPvc(pvc)
    // No Kubernetes analog to Docker's driver Options / opaque Status blob.
    return { ...summary, options: {}, status: null }
  }

  /**
   * Shared pod scan behind both `listImages()` and `inspectImage()` — there is
   * no per-image Kubernetes API to call, so both methods need the exact same
   * "list every pod in scope, group by reported image" work; factored here so
   * it exists in exactly one place rather than two copies that could drift.
   * See `groupPodImages`'s doc comment in k8s-parse.ts for the grouping/id
   * derivation rules.
   */
  private async scanImageGroups(): Promise<Map<string, PodImageGroup>> {
    const list = this.allNamespaces
      ? await this.core.listPodForAllNamespaces()
      : await this.core.listNamespacedPod({ namespace: this.namespace })
    return groupPodImages(list.items ?? [])
  }

  /**
   * Documented approximation (Phase 4): `size`/`createdAt` stay null and
   * `dangling` stays false — neither has a Kubernetes equivalent.
   */
  async listImages(): Promise<ImageSummary[]> {
    const groups = await this.scanImageGroups()
    return [...groups.values()].map((g) => ({
      id: g.id,
      repoTags: [...g.refs],
      size: null,
      createdAt: null,
      dangling: false,
      containerCount: g.referencedBy.length,
    }))
  }

  /**
   * `labels: {}`, `layers: null`, `history: null` are all structural gaps, not
   * oversights: Kubernetes exposes no per-image label map, no filesystem layer
   * digests, and no `docker history` equivalent for a bare image reference —
   * none of that data exists anywhere in the Kubernetes API surface to fetch.
   * `referencedBy` IS real, computed from which pods/containers matched
   * during the scan.
   */
  async inspectImage(id: string): Promise<ImageDetail> {
    const groups = await this.scanImageGroups()
    const group = groups.get(id)
    if (!group) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `No such image: ${id}` })
    }
    return {
      id: group.id,
      repoTags: [...group.refs],
      size: null,
      createdAt: null,
      dangling: false,
      containerCount: group.referencedBy.length,
      labels: {},
      layers: null,
      history: null,
      referencedBy: group.referencedBy,
    }
  }

  async getHealth(): Promise<HealthReport> {
    // Shared with DockerProvider (health-aggregate.ts) — it operates purely on
    // the ContainerSummary shape both providers already normalize to, so there
    // was nothing backend-specific left to duplicate. Note on semantics: `state`
    // here is the lowercased pod phase, and only `running` counts as running —
    // Succeeded (Completed), Failed, Pending and Unknown pods all tally as
    // `stopped` (a Completed pod as stopped+noHealthcheck, a Failed pod as
    // stopped+unhealthy — see derivePodHealth in k8s-parse.ts).
    const engineReachable = await this.ping()
    const containers = await this.listContainers()
    return aggregateHealth(containers, engineReachable)
  }

  async streamLogs(id: string, opts: LogStreamOptions): Promise<NodeJS.ReadableStream> {
    const decoded = decodePodId(id)
    // A multi-container pod requires a specific container name; a 2-part id (the
    // form listContainers emits) carries none, so default to the pod's FIRST
    // container. An explicit 3-part id addresses a specific container directly.
    const container = decoded.container ?? (await this.firstContainerName(decoded.namespace, decoded.name))

    // client-node's Log.log writes into a Writable and resolves to an
    // AbortController once the request is live. Bridge it to the
    // Promise<ReadableStream> the interface requires via a PassThrough, and abort
    // the underlying request when the consumer destroys/closes the stream (the
    // logs route calls .destroy() on client disconnect) so no request leaks.
    const passthrough = new PassThrough()
    const controller = await this.log.log(
      decoded.namespace,
      decoded.name,
      container,
      passthrough,
      {
        follow: opts.follow,
        tailLines: opts.tail,
        timestamps: opts.timestamps,
      },
    )
    passthrough.once('close', () => controller.abort())
    return passthrough
  }

  /** Read a pod's first container name (for the default-container log case). */
  private async firstContainerName(namespace: string, name: string): Promise<string> {
    const pod = await this.core.readNamespacedPod({ name, namespace })
    return pod.spec?.containers?.[0]?.name ?? ''
  }

  private mapPodSummary(pod: V1Pod): ContainerSummary {
    const namespace = pod.metadata?.namespace ?? ''
    const name = pod.metadata?.name ?? ''
    const service = resolvePodService(pod)
    return {
      id: encodePodId(namespace, name),
      name,
      image: this.imagesOf(pod.spec?.containers ?? []),
      state: (pod.status?.phase ?? 'Unknown').toLowerCase(),
      status: this.statusText(pod),
      health: derivePodHealth(pod),
      service,
      // Namespace is the closest analog to a Compose project.
      project: namespace || null,
      managed: service !== null,
      // Pod IP(s) as informational strings — Kubernetes has no Docker-style
      // named networks, so this is a deliberate approximation, not a full analog.
      networks: podIps(pod),
      createdAt: k8sTimestampToIso(pod.metadata?.creationTimestamp) ?? new Date(0).toISOString(),
    }
  }

  private mapPodDetail(pod: V1Pod): ContainerDetail {
    const namespace = pod.metadata?.namespace ?? ''
    const name = pod.metadata?.name ?? ''
    const service = resolvePodService(pod)
    const containers = pod.spec?.containers ?? []
    const statuses = pod.status?.containerStatuses ?? []

    const ports: ContainerPort[] = containers.flatMap((ctr) =>
      (ctr.ports ?? []).map((p) => ({
        privatePort: p.containerPort,
        publicPort: typeof p.hostPort === 'number' ? p.hostPort : null,
        type: (p.protocol ?? 'TCP').toLowerCase(),
        ip: p.hostIP ?? null,
      })),
    )

    const mounts: ContainerMount[] = containers.flatMap((ctr) =>
      (ctr.volumeMounts ?? []).map((m) => ({
        type: 'volume',
        source: m.name,
        destination: m.mountPath,
        mode: m.readOnly ? 'ro' : 'rw',
        readWrite: !m.readOnly,
      })),
    )

    // Env var NAMES only — values (including any valueFrom secret refs) are never
    // read, preserving the same redaction guarantee as the Docker provider.
    const seenEnv = new Set<string>()
    const envKeys: string[] = []
    for (const ctr of containers) {
      for (const e of ctr.env ?? []) {
        if (!seenEnv.has(e.name)) {
          seenEnv.add(e.name)
          envKeys.push(e.name)
        }
      }
    }

    const firstTerminated = statuses.find((s) => s.state?.terminated)?.state?.terminated
    const first = containers[0]

    return {
      id: encodePodId(namespace, name),
      name,
      image: this.imagesOf(containers),
      state: (pod.status?.phase ?? 'Unknown').toLowerCase(),
      status: this.statusText(pod),
      health: derivePodHealth(pod),
      service,
      project: namespace || null,
      managed: service !== null,
      createdAt: k8sTimestampToIso(pod.metadata?.creationTimestamp) ?? new Date(0).toISOString(),
      running: pod.status?.phase === 'Running',
      exitCode: typeof firstTerminated?.exitCode === 'number' ? firstTerminated.exitCode : null,
      // Aggregate restarts across the pod's containers (Docker's count is
      // per-container; a pod can have several).
      restartCount: statuses.reduce((sum, s) => sum + (s.restartCount ?? 0), 0),
      // k8s only exposes an explicit command/args override, not the image's
      // resolved entrypoint; empty when the manifest doesn't set one.
      command: [...(first?.command ?? []), ...(first?.args ?? [])].join(' '),
      networks: podIps(pod),
      ports,
      mounts,
      labels: pod.metadata?.labels ?? {},
      envKeys,
    }
  }

  private mapService(svc: V1Service): NetworkSummary {
    const namespace = svc.metadata?.namespace ?? ''
    const name = svc.metadata?.name ?? ''
    const type = svc.spec?.type ?? 'ClusterIP'
    // clusterIPs as informational addresses (an approximation — a Service has a
    // stable IP, not a Docker-style subnet). Headless services report `None`.
    const clusterIps = (svc.spec?.clusterIPs ?? [svc.spec?.clusterIP])
      .filter((ip): ip is string => Boolean(ip) && ip !== 'None')
    return {
      // Phase 4 correction: this USED to be `svc.metadata?.uid ?? encodePodId(...)`,
      // with a comment noting it was "never fed through decodePodId anywhere
      // (there is no networks/[id] route)". Now that a `/networks/:id` route
      // exists, a bare UID is actually unusable for a lookup — the Kubernetes
      // API has no "get Service by UID" call (field selectors don't index
      // `metadata.uid`), only get-by-namespace+name. So the id is now always
      // the namespace-qualified, decodable `namespace_name` form (same scheme
      // `encodePodId` uses for pods), which `inspectNetwork` decodes back via
      // `decodePodId` to make the real `readNamespacedService` call.
      id: encodePodId(namespace, name),
      name,
      driver: type,
      scope: namespace,
      // ClusterIP is cluster-internal only; NodePort/LoadBalancer are externally
      // reachable — closest analog to Docker's `internal`.
      internal: type === 'ClusterIP',
      // No Kubernetes analog to Docker's attachable networks.
      attachable: false,
      ipamSubnets: clusterIps,
      // Deliberately empty here: resolving backing pods would need a
      // labelSelector query per Service (N+1) — not worth it for a list
      // endpoint. `inspectNetwork` (single-resource scale) pays that one
      // extra query instead — see its own doc comment.
      containers: [],
      createdAt: k8sTimestampToIso(svc.metadata?.creationTimestamp),
    }
  }

  /**
   * Resolve a Service's backing pod names via its `spec.selector` — the one
   * extra labelSelector query `listNetworks()` deliberately skips at list
   * scale (see `mapService`'s comment), done here because at single-resource
   * detail scale the N+1 cost that argument rests on doesn't apply. A Service
   * with no selector (e.g. an `ExternalName` Service) resolves no pods.
   */
  private async resolveServiceContainers(svc: V1Service, namespace: string): Promise<string[]> {
    const selector = svc.spec?.selector
    if (!selector || Object.keys(selector).length === 0) return []
    const labelSelector = Object.entries(selector)
      .map(([key, value]) => `${key}=${value}`)
      .join(',')
    const pods = await this.core.listNamespacedPod({ namespace, labelSelector })
    return (pods.items ?? []).map((p) => p.metadata?.name ?? '').filter(Boolean)
  }

  private mapPvc(pvc: V1PersistentVolumeClaim): VolumeSummary {
    const namespace = pvc.metadata?.namespace ?? ''
    const name = pvc.metadata?.name ?? ''
    return {
      // A PVC name is only unique WITHIN its namespace (see VolumeSummary.id's
      // doc comment in types.ts), so — like pod ids — this is namespace-qualified.
      id: encodePodId(namespace, name),
      name,
      driver: pvc.spec?.storageClassName ?? 'unknown',
      // No host mountpoint notion for a PVC; surface the bound PersistentVolume
      // name (empty while unbound) as the closest backing identifier.
      mountpoint: pvc.spec?.volumeName ?? '',
      scope: namespace,
      createdAt: k8sTimestampToIso(pvc.metadata?.creationTimestamp),
      labels: pvc.metadata?.labels ?? {},
    }
  }

  /** First container image, or all images joined with `, ` for multi-container pods. */
  private imagesOf(containers: V1Container[]): string {
    return containers.map((c) => c.image ?? '').filter(Boolean).join(', ')
  }

  /** Human status string: the phase plus the first informative container sub-state. */
  private statusText(pod: V1Pod): string {
    const phase = pod.status?.phase ?? 'Unknown'
    for (const cs of pod.status?.containerStatuses ?? []) {
      const waiting = cs.state?.waiting?.reason
      if (waiting) return `${phase} (${waiting})`
      const terminated = cs.state?.terminated?.reason
      if (terminated && phase !== 'Running') return `${phase} (${terminated})`
    }
    return phase
  }
}
