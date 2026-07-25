import type { V1Pod } from '@kubernetes/client-node'
import { describe, expect, it } from 'vitest'
import {
  computeImageId,
  decodePodId,
  decodeVolumeId,
  deploymentNameFromReplicaSet,
  derivePodHealth,
  encodePodId,
  groupPodImages,
  k8sTimestampToIso,
  podIps,
  resolvePodService,
} from '../server/runtime/k8s-parse'

/** Build a minimal V1Pod from the fields the helpers actually read. */
function pod(partial: Partial<V1Pod>): V1Pod {
  return partial as V1Pod
}

describe('encodePodId / decodePodId round-trip', () => {
  it('encodes namespace + name and decodes them back (2-part)', () => {
    const id = encodePodId('ecom', 'api-gateway-6d4b9c-abc')
    expect(id).toBe('ecom_api-gateway-6d4b9c-abc')
    expect(decodePodId(id)).toEqual({ namespace: 'ecom', name: 'api-gateway-6d4b9c-abc' })
  })

  it('preserves dots in a pod name (DNS subdomain) across the round-trip', () => {
    const id = encodePodId('default', 'web.v2-abc')
    expect(decodePodId(id)).toEqual({ namespace: 'default', name: 'web.v2-abc' })
  })

  it('decodes a 3-part id as namespace_name_container', () => {
    expect(decodePodId('ecom_pod-1_sidecar')).toEqual({
      namespace: 'ecom',
      name: 'pod-1',
      container: 'sidecar',
    })
  })

  it('throws a proper 400 (not a generic 500-shaped error) on a structurally invalid id', () => {
    // Regression guard: a plain `Error` here would fall through the routes'
    // translateDockerNotFound as unrecognized and surface as a 500, when this
    // is the same "malformed input" class assertValidContainerId already
    // reports as 400 for the Docker path.
    expect(() => decodePodId('only-one-part')).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/Invalid kubernetes pod id/) }),
    )
    expect(() => decodePodId('a_b_c_d')).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('decodeVolumeId', () => {
  it('decodes a namespace_name id', () => {
    expect(decodeVolumeId('ecom_pg-data')).toEqual({ namespace: 'ecom', name: 'pg-data' })
  })

  it('throws a distinct "ambiguous" 400 (not the generic malformed-id message) on a bare name', () => {
    expect(() => decodeVolumeId('pg-data')).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/ambiguous volume name/) }),
    )
  })

  it('throws the same "ambiguous" 400 for a 3+ part id (a volume id has no container part)', () => {
    expect(() => decodeVolumeId('a_b_c')).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('computeImageId', () => {
  it('extracts a sha256 digest embedded anywhere in imageID, regardless of runtime prefix', () => {
    const digest = `sha256:${'a'.repeat(64)}`
    expect(computeImageId(`docker-pullable://repo@${digest}`, 'repo:tag')).toBe(digest)
    expect(computeImageId(`containerd://${digest}`, 'repo:tag')).toBe(digest)
  })

  it('falls back to a base64url encoding of the raw image reference when no digest is extractable', () => {
    expect(computeImageId('', 'busybox:latest')).toBe(Buffer.from('busybox:latest').toString('base64url'))
    expect(computeImageId(undefined, 'busybox:latest')).toBe(Buffer.from('busybox:latest').toString('base64url'))
  })

  it('the fallback id only ever contains the base64url charset (route-safe, no "/" or ":")', () => {
    const id = computeImageId(undefined, 'my-registry.example.com/team/app:v1.2.3')
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('groupPodImages', () => {
  function podWithContainers(
    name: string,
    namespace: string,
    containers: { name: string, image: string, imageID: string }[],
  ): V1Pod {
    return {
      metadata: { name, namespace },
      status: { containerStatuses: containers.map((c) => ({ ...c, ready: true, restartCount: 0, state: {} })) },
    } as V1Pod
  }

  it('groups two pods referencing the same digest into one group', () => {
    const digest = `sha256:${'c'.repeat(64)}`
    const groups = groupPodImages([
      podWithContainers('web-1', 'ecom', [{ name: 'web', image: 'ecom/web:1.0', imageID: `containerd://${digest}` }]),
      podWithContainers('web-2', 'ecom', [{ name: 'web', image: 'ecom/web:1.0', imageID: `containerd://${digest}` }]),
    ])
    expect(groups.size).toBe(1)
    const group = groups.get(digest)!
    expect([...group.refs]).toEqual(['ecom/web:1.0'])
    expect(group.referencedBy).toEqual([
      { containerId: 'ecom_web-1', containerName: 'web-1', service: null },
      { containerId: 'ecom_web-2', containerName: 'web-2', service: null },
    ])
  })

  it('dedupes a single pod with two containers on the same image (no double count)', () => {
    const digest = `sha256:${'d'.repeat(64)}`
    const groups = groupPodImages([
      podWithContainers('multi', 'ecom', [
        { name: 'a', image: 'shared:1.0', imageID: `containerd://${digest}` },
        { name: 'b', image: 'shared:1.0', imageID: `containerd://${digest}` },
      ]),
    ])
    expect(groups.size).toBe(1)
    expect(groups.get(digest)!.referencedBy).toHaveLength(1)
  })

  it('returns an empty map for no pods', () => {
    expect(groupPodImages([]).size).toBe(0)
  })
})

describe('deploymentNameFromReplicaSet', () => {
  it('strips the pod-template-hash suffix to recover the Deployment name', () => {
    expect(deploymentNameFromReplicaSet('api-gateway-6d4b9c7f8')).toBe('api-gateway')
    expect(deploymentNameFromReplicaSet('web-frontend-abc12345')).toBe('web-frontend')
  })

  it('returns the name unchanged when the suffix is not hash-shaped', () => {
    expect(deploymentNameFromReplicaSet('plain-name')).toBe('plain-name')
  })
})

describe('resolvePodService', () => {
  it('resolves a ReplicaSet owner to its Deployment name', () => {
    const service = resolvePodService(
      pod({
        metadata: {
          ownerReferences: [{ kind: 'ReplicaSet', name: 'api-gateway-6d4b9c7f8', controller: true, apiVersion: 'apps/v1', uid: 'x' }],
        },
      }),
    )
    expect(service).toBe('api-gateway')
  })

  it('uses a StatefulSet / DaemonSet owner name directly', () => {
    expect(
      resolvePodService(pod({ metadata: { ownerReferences: [{ kind: 'StatefulSet', name: 'postgres', controller: true, apiVersion: 'apps/v1', uid: 'y' }] } })),
    ).toBe('postgres')
    expect(
      resolvePodService(pod({ metadata: { ownerReferences: [{ kind: 'DaemonSet', name: 'node-exporter', controller: true, apiVersion: 'apps/v1', uid: 'z' }] } })),
    ).toBe('node-exporter')
  })

  it('falls back to app.kubernetes.io/name before the legacy app label', () => {
    const service = resolvePodService(
      pod({ metadata: { labels: { 'app.kubernetes.io/name': 'modern', app: 'legacy' } } }),
    )
    expect(service).toBe('modern')
  })

  it('falls back to the legacy app label when the recommended one is absent', () => {
    expect(resolvePodService(pod({ metadata: { labels: { app: 'legacy' } } }))).toBe('legacy')
  })

  it('returns null for a pod with no owner references and no known labels', () => {
    expect(resolvePodService(pod({ metadata: { labels: {} } }))).toBeNull()
    expect(resolvePodService(pod({ metadata: {} }))).toBeNull()
  })
})

describe('derivePodHealth', () => {
  const running = (partial: Partial<V1Pod['status']>): V1Pod =>
    pod({ status: { phase: 'Running', ...partial } })

  it('Running + Ready=True -> healthy', () => {
    expect(derivePodHealth(running({ conditions: [{ type: 'Ready', status: 'True' }] }))).toBe('healthy')
  })

  it('Running + Ready=False (up but not ready) -> starting', () => {
    expect(derivePodHealth(running({ conditions: [{ type: 'Ready', status: 'False' }] }))).toBe('starting')
  })

  it('Running + a container in CrashLoopBackOff -> unhealthy (overrides Ready)', () => {
    expect(
      derivePodHealth(
        running({
          conditions: [{ type: 'Ready', status: 'True' }],
          containerStatuses: [{ name: 'c', ready: false, restartCount: 7, image: 'x', imageID: '', state: { waiting: { reason: 'CrashLoopBackOff' } } }],
        }),
      ),
    ).toBe('unhealthy')
  })

  it('maps Pending -> starting, Succeeded -> none, Failed -> unhealthy, Unknown -> unhealthy', () => {
    expect(derivePodHealth(pod({ status: { phase: 'Pending' } }))).toBe('starting')
    expect(derivePodHealth(pod({ status: { phase: 'Succeeded' } }))).toBe('none')
    expect(derivePodHealth(pod({ status: { phase: 'Failed' } }))).toBe('unhealthy')
    expect(derivePodHealth(pod({ status: { phase: 'Unknown' } }))).toBe('unhealthy')
  })

  it('defaults to none when phase is absent', () => {
    expect(derivePodHealth(pod({ status: {} }))).toBe('none')
    expect(derivePodHealth(pod({}))).toBe('none')
  })
})

describe('podIps', () => {
  it('prefers status.podIPs, falling back to podIP, then empty', () => {
    expect(podIps(pod({ status: { podIPs: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }] } }))).toEqual(['10.0.0.1', '10.0.0.2'])
    expect(podIps(pod({ status: { podIP: '10.0.0.9' } }))).toEqual(['10.0.0.9'])
    expect(podIps(pod({ status: {} }))).toEqual([])
  })
})

describe('k8sTimestampToIso', () => {
  it('coerces a Date and an ISO string, and returns null for empty/invalid', () => {
    expect(k8sTimestampToIso(new Date('2024-01-01T00:00:00Z'))).toBe('2024-01-01T00:00:00.000Z')
    expect(k8sTimestampToIso('2024-06-01T12:00:00Z')).toBe('2024-06-01T12:00:00.000Z')
    expect(k8sTimestampToIso(undefined)).toBeNull()
    expect(k8sTimestampToIso('not-a-date')).toBeNull()
  })
})
