import { PassThrough } from 'node:stream'
import type { CoreV1Api, Log, V1Pod, VersionApi } from '@kubernetes/client-node'
import { describe, expect, it, vi } from 'vitest'
import { KubernetesProvider } from '../server/runtime/kubernetes-provider'

/**
 * Mocked-client tests for the read-only Kubernetes provider, mirroring the
 * dockerode-mocking style of test/docker-provider.test.ts. There is NO live
 * cluster here; every client method is a fake returning the shapes the real
 * `@kubernetes/client-node` object-param API (v1.x) returns (list bodies with an
 * `items` array, `readNamespacedPod` -> a V1Pod, `Log.log` -> an AbortController).
 */

/** A Running, Ready, Deployment-owned pod (via ReplicaSet). */
function runningPod(): V1Pod {
  return {
    metadata: {
      name: 'api-gateway-6d4b9c7f8-abcde',
      namespace: 'ecom',
      creationTimestamp: new Date('2024-01-01T00:00:00Z'),
      labels: { app: 'api-gateway' },
      ownerReferences: [
        { kind: 'ReplicaSet', name: 'api-gateway-6d4b9c7f8', controller: true, apiVersion: 'apps/v1', uid: 'rs-1' },
      ],
    },
    spec: { containers: [{ name: 'api-gateway', image: 'ecom/api-gateway:1.0' }] },
    status: {
      phase: 'Running',
      podIP: '10.0.0.5',
      podIPs: [{ ip: '10.0.0.5' }],
      conditions: [{ type: 'Ready', status: 'True' }],
      containerStatuses: [{ name: 'api-gateway', ready: true, restartCount: 0, image: 'ecom/api-gateway:1.0', imageID: '', state: { running: { startedAt: new Date() } } }],
    },
  } as V1Pod
}

/** An ownerless, labelless pod (unmanaged). */
function looseP(): V1Pod {
  return {
    metadata: { name: 'adhoc', namespace: 'default', creationTimestamp: new Date('2024-01-02T00:00:00Z') },
    spec: { containers: [{ name: 'busybox', image: 'busybox' }] },
    status: { phase: 'Pending' },
  } as V1Pod
}

interface FakeCoreOverrides {
  pods?: V1Pod[]
  readPod?: (args: { name: string; namespace: string }) => Promise<V1Pod>
  services?: unknown[]
  pvcs?: unknown[]
  onListNamespacedPod?: (args: { namespace: string }) => void
}

function fakeCore(o: FakeCoreOverrides = {}): CoreV1Api {
  const pods = o.pods ?? [runningPod(), looseP()]
  return {
    listPodForAllNamespaces: vi.fn(async () => ({ items: pods })),
    listNamespacedPod: vi.fn(async (args: { namespace: string }) => {
      o.onListNamespacedPod?.(args)
      return { items: pods }
    }),
    readNamespacedPod: vi.fn(o.readPod ?? (async () => runningPod())),
    listServiceForAllNamespaces: vi.fn(async () => ({ items: o.services ?? [] })),
    listNamespacedService: vi.fn(async () => ({ items: o.services ?? [] })),
    listPersistentVolumeClaimForAllNamespaces: vi.fn(async () => ({ items: o.pvcs ?? [] })),
    listNamespacedPersistentVolumeClaim: vi.fn(async () => ({ items: o.pvcs ?? [] })),
  } as unknown as CoreV1Api
}

function fakeVersion(ping: () => Promise<unknown> = async () => ({ gitVersion: 'v1.29.0' })): VersionApi {
  return { getCode: vi.fn(ping) } as unknown as VersionApi
}

function fakeLog(logImpl?: Log['log']): Log {
  const impl = logImpl ?? (async () => new AbortController())
  return { log: vi.fn(impl) } as unknown as Log
}

function makeProvider(overrides: {
  core?: CoreV1Api
  version?: VersionApi
  log?: Log
  namespace?: string
} = {}): KubernetesProvider {
  return new KubernetesProvider(
    overrides.core ?? fakeCore(),
    overrides.log ?? fakeLog(),
    overrides.version ?? fakeVersion(),
    overrides.namespace ?? '',
  )
}

describe('KubernetesProvider.listContainers', () => {
  it('maps a Deployment-owned Running pod to a healthy, managed summary (happy path)', async () => {
    const list = await makeProvider().listContainers()
    expect(list[0]).toMatchObject({
      id: 'ecom_api-gateway-6d4b9c7f8-abcde',
      name: 'api-gateway-6d4b9c7f8-abcde',
      image: 'ecom/api-gateway:1.0',
      state: 'running',
      health: 'healthy',
      service: 'api-gateway',
      project: 'ecom',
      managed: true,
      networks: ['10.0.0.5'],
      createdAt: '2024-01-01T00:00:00.000Z',
    })
  })

  it('reports an ownerless, labelless Pending pod as unmanaged + starting (edge case)', async () => {
    const list = await makeProvider().listContainers()
    expect(list[1]).toMatchObject({
      name: 'adhoc',
      state: 'pending',
      health: 'starting',
      service: null,
      managed: false,
      project: 'default',
    })
  })

  it('joins images for a multi-container pod', async () => {
    const multi = {
      metadata: { name: 'p', namespace: 'ns', creationTimestamp: new Date() },
      spec: { containers: [{ name: 'a', image: 'img-a' }, { name: 'b', image: 'img-b' }] },
      status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
    } as V1Pod
    const list = await makeProvider({ core: fakeCore({ pods: [multi] }) }).listContainers()
    expect(list[0].image).toBe('img-a, img-b')
  })

  it('returns an empty array for an empty namespace', async () => {
    const list = await makeProvider({ core: fakeCore({ pods: [] }) }).listContainers()
    expect(list).toEqual([])
  })

  it('scopes to a single namespace when configured, not all-namespaces', async () => {
    const seen: string[] = []
    const core = fakeCore({ onListNamespacedPod: ({ namespace }) => seen.push(namespace) })
    await makeProvider({ core, namespace: 'ecom' }).listContainers()
    expect(core.listPodForAllNamespaces).not.toHaveBeenCalled()
    expect(seen).toEqual(['ecom'])
  })
})

describe('KubernetesProvider.inspectContainer', () => {
  const SECRET = 'sup3r-s3cret-db-password'

  it('round-trips the id, aggregates restarts/exit code, and maps ports & mounts', async () => {
    const failed: V1Pod = {
      metadata: { name: 'worker-1', namespace: 'ecom', creationTimestamp: new Date('2024-03-01T00:00:00Z'), labels: { app: 'worker' } },
      spec: {
        containers: [{
          name: 'worker',
          image: 'ecom/worker',
          command: ['/bin/worker'],
          args: ['--flag'],
          ports: [{ containerPort: 8080, protocol: 'TCP' }],
          volumeMounts: [{ name: 'data', mountPath: '/data', readOnly: true }],
        }],
      },
      status: {
        phase: 'Failed',
        containerStatuses: [{ name: 'worker', ready: false, restartCount: 3, image: 'ecom/worker', imageID: '', state: { terminated: { exitCode: 137, reason: 'OOMKilled', startedAt: new Date(), finishedAt: new Date() } } }],
      },
    } as V1Pod

    const provider = makeProvider({ core: fakeCore({ readPod: async () => failed }) })
    const detail = await provider.inspectContainer('ecom_worker-1')

    expect(detail).toMatchObject({
      id: 'ecom_worker-1',
      name: 'worker-1',
      state: 'failed',
      health: 'unhealthy',
      running: false,
      exitCode: 137,
      restartCount: 3,
      command: '/bin/worker --flag',
      service: 'worker',
      managed: true,
    })
    expect(detail.ports).toEqual([{ privatePort: 8080, publicPort: null, type: 'tcp', ip: null }])
    expect(detail.mounts).toEqual([{ type: 'volume', source: 'data', destination: '/data', mode: 'ro', readWrite: false }])
  })

  it('exposes env var NAMES but never their VALUES (security regression parity with Docker)', async () => {
    const withEnv: V1Pod = {
      metadata: { name: 'db-0', namespace: 'ecom', creationTimestamp: new Date() },
      spec: {
        containers: [{
          name: 'db',
          image: 'postgres',
          env: [
            { name: 'DB_PASSWORD', value: SECRET },
            { name: 'DB_PASSWORD', value: SECRET }, // duplicate across-container style
            { name: 'PGDATA', value: '/var/lib/postgresql/data' },
          ],
        }],
      },
      status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
    } as V1Pod

    const provider = makeProvider({ core: fakeCore({ readPod: async () => withEnv }) })
    const detail = await provider.inspectContainer('ecom_db-0')

    expect(detail.envKeys).toEqual(['DB_PASSWORD', 'PGDATA'])
    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain(SECRET)
  })
})

describe('KubernetesProvider.listNetworks (Services)', () => {
  it('maps a Service to a NetworkSummary (type as driver, clusterIPs as subnets)', async () => {
    const svc = {
      metadata: { name: 'api-gateway', namespace: 'ecom', uid: 'svc-1', creationTimestamp: new Date('2024-01-01T00:00:00Z') },
      spec: { type: 'ClusterIP', clusterIP: '172.20.0.1', clusterIPs: ['172.20.0.1'] },
    }
    const [net] = await makeProvider({ core: fakeCore({ services: [svc] }) }).listNetworks()
    expect(net).toMatchObject({
      id: 'svc-1',
      name: 'api-gateway',
      driver: 'ClusterIP',
      scope: 'ecom',
      internal: true,
      attachable: false,
      ipamSubnets: ['172.20.0.1'],
      containers: [],
    })
  })

  it('marks a LoadBalancer Service as not internal and drops headless None IPs', async () => {
    const svc = { metadata: { name: 'edge', namespace: 'ecom' }, spec: { type: 'LoadBalancer', clusterIP: 'None', clusterIPs: ['None'] } }
    const [net] = await makeProvider({ core: fakeCore({ services: [svc] }) }).listNetworks()
    expect(net.internal).toBe(false)
    expect(net.ipamSubnets).toEqual([])
  })
})

describe('KubernetesProvider.listVolumes (PVCs)', () => {
  it('maps a PVC to a VolumeSummary (storage class as driver, bound PV as mountpoint)', async () => {
    const pvc = {
      metadata: { name: 'pg-data', namespace: 'ecom', creationTimestamp: new Date('2024-01-01T00:00:00Z'), labels: { app: 'postgres' } },
      spec: { storageClassName: 'gp3', volumeName: 'pvc-abc-123' },
    }
    const [vol] = await makeProvider({ core: fakeCore({ pvcs: [pvc] }) }).listVolumes()
    expect(vol).toMatchObject({
      name: 'pg-data',
      driver: 'gp3',
      mountpoint: 'pvc-abc-123',
      scope: 'ecom',
      labels: { app: 'postgres' },
    })
  })
})

describe('KubernetesProvider.getHealth', () => {
  it('aggregates totals and rolls up per resolved service', async () => {
    const report = await makeProvider().getHealth()
    expect(report.engineReachable).toBe(true)
    expect(report.totals).toMatchObject({
      containers: 2,
      running: 1, // the Running pod
      stopped: 1, // the Pending pod counts as stopped
      healthy: 1,
      starting: 1,
    })
    // Only the managed pod (api-gateway) rolls up; loose adhoc pod does not.
    expect(report.services).toHaveLength(1)
    expect(report.services[0]).toMatchObject({ service: 'api-gateway', project: 'ecom', running: 1, healthy: 1 })
  })

  it('reports engineReachable=false when the version probe throws', async () => {
    const version = fakeVersion(async () => {
      throw new Error('unreachable')
    })
    const report = await makeProvider({ version }).getHealth()
    expect(report.engineReachable).toBe(false)
  })
})

describe('KubernetesProvider.ping', () => {
  it('returns false instead of throwing when the API server is unreachable', async () => {
    const version = fakeVersion(async () => {
      throw new Error('boom')
    })
    expect(await makeProvider({ version }).ping()).toBe(false)
  })
})

describe('KubernetesProvider.streamLogs', () => {
  it('defaults to the pod first container for a 2-part id and returns a readable stream', async () => {
    const calls: Array<[string, string, string]> = []
    const log = fakeLog(async (ns, name, container) => {
      calls.push([ns, name, container])
      return new AbortController()
    })
    const provider = makeProvider({ log })
    const stream = await provider.streamLogs('ecom_api-gateway-6d4b9c7f8-abcde', { tail: 100, follow: true, timestamps: false })

    expect(stream).toBeInstanceOf(PassThrough)
    // readNamespacedPod (default runningPod) yields first container 'api-gateway'.
    expect(calls).toEqual([['ecom', 'api-gateway-6d4b9c7f8-abcde', 'api-gateway']])
  })

  it('uses the explicit container from a 3-part id without reading the pod', async () => {
    const calls: Array<[string, string, string]> = []
    const log = fakeLog(async (ns, name, container) => {
      calls.push([ns, name, container])
      return new AbortController()
    })
    const core = fakeCore()
    const provider = makeProvider({ log, core })
    await provider.streamLogs('ecom_pod-1_sidecar', { tail: 50, follow: true, timestamps: true })
    expect(calls).toEqual([['ecom', 'pod-1', 'sidecar']])
    expect(core.readNamespacedPod).not.toHaveBeenCalled()
  })

  it('aborts the underlying request when the returned stream is destroyed', async () => {
    const controller = new AbortController()
    const abortSpy = vi.spyOn(controller, 'abort')
    const log = fakeLog(async () => controller)
    const stream = await makeProvider({ log }).streamLogs('ecom_pod-1_side', { tail: 10, follow: true, timestamps: false })
    stream.destroy?.()
    await new Promise((r) => setImmediate(r))
    expect(abortSpy).toHaveBeenCalled()
  })
})
