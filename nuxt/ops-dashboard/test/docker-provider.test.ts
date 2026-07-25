import type Docker from 'dockerode'
import { describe, expect, it } from 'vitest'
import { DockerProvider } from '../server/runtime/docker-provider'

// A minimal fake dockerode client. We only implement what the provider touches.
function fakeDocker(overrides: Partial<Docker> = {}): Docker {
  const base = {
    ping: async () => 'OK',
    listContainers: async () => [
      {
        Id: 'abc123',
        Names: ['/api-gateway'],
        Image: 'ecom/api-gateway',
        State: 'running',
        Status: 'Up 3 hours (healthy)',
        Created: 1_700_000_000,
        Labels: {
          'com.docker.compose.service': 'api-gateway',
          'com.docker.compose.project': 'ecom',
        },
        NetworkSettings: { Networks: { ecom_network: {} } },
      },
      {
        Id: 'def456',
        Names: ['/loose-container'],
        Image: 'busybox',
        State: 'exited',
        Status: 'Exited (0) 2 days ago',
        Created: 1_700_000_100,
        Labels: {},
        NetworkSettings: { Networks: { bridge: {} } },
      },
    ],
  }
  return { ...base, ...overrides } as unknown as Docker
}

describe('DockerProvider.listContainers', () => {
  it('maps summaries, stripping the name slash and parsing health (happy path)', async () => {
    const provider = new DockerProvider(fakeDocker())
    const list = await provider.listContainers()

    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      id: 'abc123',
      name: 'api-gateway',
      state: 'running',
      health: 'healthy',
      service: 'api-gateway',
      project: 'ecom',
      managed: true,
      networks: ['ecom_network'],
    })
  })

  it('represents non-compose containers as unmanaged (edge case)', async () => {
    const provider = new DockerProvider(fakeDocker())
    const list = await provider.listContainers()
    expect(list[1]).toMatchObject({
      name: 'loose-container',
      service: null,
      project: null,
      managed: false,
      health: 'none',
    })
  })
})

describe('DockerProvider.getHealth', () => {
  it('aggregates totals and rolls up per compose service', async () => {
    const provider = new DockerProvider(fakeDocker())
    const report = await provider.getHealth()

    expect(report.engineReachable).toBe(true)
    expect(report.totals).toMatchObject({
      containers: 2,
      running: 1,
      stopped: 1,
      healthy: 1,
      noHealthcheck: 1,
    })
    // Only the compose-managed container appears in the service rollup.
    expect(report.services).toHaveLength(1)
    expect(report.services[0]).toMatchObject({
      service: 'api-gateway',
      project: 'ecom',
      total: 1,
      running: 1,
      healthy: 1,
    })
  })

  it('reports engine unreachable when ping throws (edge case)', async () => {
    const provider = new DockerProvider(
      fakeDocker({
        ping: async () => {
          throw new Error('connection refused')
        },
      } as Partial<Docker>),
    )
    const report = await provider.getHealth()
    expect(report.engineReachable).toBe(false)
  })
})

describe('DockerProvider.ping', () => {
  it('returns false instead of throwing on error', async () => {
    const provider = new DockerProvider(
      fakeDocker({
        ping: async () => {
          throw new Error('boom')
        },
      } as Partial<Docker>),
    )
    expect(await provider.ping()).toBe(false)
  })
})

// Minimal fake for the `getContainer(id).inspect()` shape; only fields the
// provider actually reads are populated.
function fakeInspectDocker(info: Record<string, unknown>): Docker {
  return {
    getContainer: () => ({
      inspect: async () => info,
    }),
  } as unknown as Docker
}

describe('DockerProvider.inspectContainer — env var redaction (security regression)', () => {
  const SECRET_VALUE = 'sup3r-s3cret-db-password-xyz'

  it('exposes env var NAMES but never the raw VALUE, even for one containing "="', async () => {
    const info = {
      Id: 'sec123',
      Name: '/db',
      Config: {
        Image: 'postgres',
        Labels: {},
        Env: [
          `DB_PASSWORD=${SECRET_VALUE}`,
          'CONNECTION_STRING=postgres://user:pw@host/db?opt=1', // value itself contains '='
          'MALFORMED_NO_EQUALS_SIGN',
        ],
      },
      State: { Status: 'running', Running: true },
      NetworkSettings: { Networks: {} },
      Mounts: [],
      Created: '2024-01-01T00:00:00Z',
    }
    const provider = new DockerProvider(fakeInspectDocker(info))
    const detail = await provider.inspectContainer('sec123')

    expect(detail.envKeys).toEqual([
      'DB_PASSWORD',
      'CONNECTION_STRING',
      'MALFORMED_NO_EQUALS_SIGN',
    ])

    // The strongest guarantee: no matter how the mapping is refactored, the
    // secret value must never appear anywhere in the serialized detail object.
    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain(SECRET_VALUE)
    expect(serialized).not.toContain('postgres://user:pw@host/db')
    expect(serialized).not.toMatch(/DB_PASSWORD=/) // the raw "KEY=VALUE" pair must not leak either
  })
})

describe('DockerProvider.inspectContainer — compose-label fallback (edge case)', () => {
  it('marks a container without compose labels as unmanaged rather than throwing', async () => {
    const info = {
      Id: 'loose1',
      Name: '/adhoc-container',
      Config: { Image: 'busybox', Labels: {}, Env: [] },
      State: { Status: 'running', Running: true },
      NetworkSettings: { Networks: {} },
      Mounts: [],
      Created: '2024-01-01T00:00:00Z',
    }
    const provider = new DockerProvider(fakeInspectDocker(info))
    const detail = await provider.inspectContainer('loose1')

    expect(detail.managed).toBe(false)
    expect(detail.service).toBeNull()
    expect(detail.project).toBeNull()
  })

  it('marks a container with compose labels as managed', async () => {
    const info = {
      Id: 'managed1',
      Name: '/api-gateway',
      Config: {
        Image: 'ecom/api-gateway',
        Labels: {
          'com.docker.compose.service': 'api-gateway',
          'com.docker.compose.project': 'ecom',
        },
        Env: [],
      },
      State: { Status: 'running', Running: true },
      NetworkSettings: { Networks: {} },
      Mounts: [],
      Created: '2024-01-01T00:00:00Z',
    }
    const provider = new DockerProvider(fakeInspectDocker(info))
    const detail = await provider.inspectContainer('managed1')

    expect(detail.managed).toBe(true)
    expect(detail.service).toBe('api-gateway')
    expect(detail.project).toBe('ecom')
  })
})

describe('DockerProvider.listVolumes — id field (real fix, not cosmetic)', () => {
  it('sets VolumeSummary.id to the volume name, since Docker volume names ARE the identity', async () => {
    const provider = new DockerProvider({
      listVolumes: async () => ({
        Volumes: [{ Name: 'pg-data', Driver: 'local', Mountpoint: '/var/lib/docker/volumes/pg-data', Scope: 'local', Labels: {} }],
      }),
    } as unknown as Docker)
    const [vol] = await provider.listVolumes()
    expect(vol).toMatchObject({ id: 'pg-data', name: 'pg-data' })
  })
})

describe('DockerProvider.inspectVolume', () => {
  it('maps a real volume inspect, including driver Options and the opaque Status blob', async () => {
    const provider = new DockerProvider({
      getVolume: () => ({
        inspect: async () => ({
          Name: 'pg-data',
          Driver: 'local',
          Mountpoint: '/var/lib/docker/volumes/pg-data/_data',
          Scope: 'local',
          Labels: { app: 'postgres' },
          Options: { type: 'nfs' },
          Status: { hello: 'world' },
        }),
      }),
    } as unknown as Docker)

    const detail = await provider.inspectVolume('pg-data')
    expect(detail).toMatchObject({
      id: 'pg-data',
      name: 'pg-data',
      options: { type: 'nfs' },
      status: { hello: 'world' },
    })
  })

  it('defaults Options/Status to {}/null when the driver does not populate them', async () => {
    const provider = new DockerProvider({
      getVolume: () => ({
        inspect: async () => ({ Name: 'anon', Driver: 'local', Mountpoint: '/x', Scope: 'local', Labels: {}, Options: null }),
      }),
    } as unknown as Docker)
    const detail = await provider.inspectVolume('anon')
    expect(detail.options).toEqual({})
    expect(detail.status).toBeNull()
  })
})

describe('DockerProvider.inspectNetwork', () => {
  it('maps a real network inspect, including per-container endpoint detail and Options', async () => {
    const provider = new DockerProvider({
      getNetwork: () => ({
        inspect: async () => ({
          Id: 'net1',
          Name: 'ecom_network',
          Driver: 'bridge',
          Scope: 'local',
          Internal: false,
          Attachable: true,
          Created: '2024-01-01T00:00:00Z',
          IPAM: { Config: [{ Subnet: '172.20.0.0/16' }] },
          Options: { 'com.docker.network.bridge.name': 'br-ecom' },
          Containers: {
            abc123: { Name: 'api-gateway', EndpointID: 'ep1', MacAddress: '02:42:ac:14:00:02', IPv4Address: '172.20.0.2/16', IPv6Address: '' },
          },
        }),
      }),
    } as unknown as Docker)

    const detail = await provider.inspectNetwork('net1')
    expect(detail).toMatchObject({
      id: 'net1',
      name: 'ecom_network',
      driver: 'bridge',
      ipamSubnets: ['172.20.0.0/16'],
      containers: ['api-gateway'],
      options: { 'com.docker.network.bridge.name': 'br-ecom' },
    })
    expect(detail.containerDetails).toEqual([
      { id: 'abc123', name: 'api-gateway', ipv4Address: '172.20.0.2/16', ipv6Address: null, macAddress: '02:42:ac:14:00:02' },
    ])
  })
})

describe('DockerProvider.listImages', () => {
  function fakeImagesDocker(images: unknown[], containers: unknown[] = []): Docker {
    return {
      listImages: async () => images,
      listContainers: async () => containers,
    } as unknown as Docker
  }

  it('maps images and cross-references containerCount via ImageID (happy path)', async () => {
    const provider = new DockerProvider(
      fakeImagesDocker(
        [{ Id: 'sha256:img1', RepoTags: ['ecom/api-gateway:latest'], Size: 12345, Created: 1_700_000_000 }],
        [{ Id: 'c1', ImageID: 'sha256:img1' }, { Id: 'c2', ImageID: 'sha256:img1' }],
      ),
    )
    const [img] = await provider.listImages()
    expect(img).toMatchObject({
      id: 'sha256:img1',
      repoTags: ['ecom/api-gateway:latest'],
      size: 12345,
      dangling: false,
      containerCount: 2,
    })
  })

  it('treats an empty RepoTags list as dangling, and filters the "<none>:<none>" sentinel (edge case)', async () => {
    const provider = new DockerProvider(
      fakeImagesDocker([
        { Id: 'sha256:dangling1', RepoTags: [], Size: 1, Created: 1 },
        { Id: 'sha256:dangling2', RepoTags: ['<none>:<none>'], Size: 1, Created: 1 },
      ]),
    )
    const images = await provider.listImages()
    expect(images.every((i) => i.dangling)).toBe(true)
    expect(images.every((i) => i.repoTags.length === 0)).toBe(true)
  })

  it('reports containerCount 0 for an image no container references', async () => {
    const provider = new DockerProvider(fakeImagesDocker([{ Id: 'sha256:unused', RepoTags: ['x:1'], Size: 1, Created: 1 }]))
    const [img] = await provider.listImages()
    expect(img.containerCount).toBe(0)
  })
})

describe('DockerProvider.inspectImage', () => {
  it('maps labels, layers, history, and referencedBy from a real image inspect', async () => {
    const provider = new DockerProvider({
      getImage: () => ({
        inspect: async () => ({
          Id: 'sha256:img1',
          RepoTags: ['ecom/api-gateway:latest'],
          Size: 999,
          Created: '2024-01-01T00:00:00Z',
          Config: { Labels: { maintainer: 'ecom' } },
          RootFS: { Type: 'layers', Layers: ['sha256:layer1', 'sha256:layer2'] },
        }),
        history: async () => [
          { Id: 'sha256:layer1', Created: 1_700_000_000, CreatedBy: '/bin/sh -c #(nop) ADD file', Size: 500 },
          { Id: '<missing>', Created: 1_700_000_100, CreatedBy: '/bin/sh -c apt-get update', Size: 499 },
        ],
      }),
      listContainers: async () => [
        { Id: 'c1', Names: ['/api-gateway'], ImageID: 'sha256:img1', Labels: { 'com.docker.compose.service': 'api-gateway' } },
        { Id: 'c2', Names: ['/other'], ImageID: 'sha256:different' },
      ],
    } as unknown as Docker)

    const detail = await provider.inspectImage('sha256:img1')

    expect(detail.labels).toEqual({ maintainer: 'ecom' })
    expect(detail.layers).toEqual(['sha256:layer1', 'sha256:layer2'])
    expect(detail.history).toEqual([
      { id: 'sha256:layer1', createdAt: new Date(1_700_000_000 * 1000).toISOString(), createdBy: '/bin/sh -c #(nop) ADD file', size: 500 },
      { id: null, createdAt: new Date(1_700_000_100 * 1000).toISOString(), createdBy: '/bin/sh -c apt-get update', size: 499 },
    ])
    expect(detail.referencedBy).toEqual([
      { containerId: 'c1', containerName: 'api-gateway', service: 'api-gateway' },
    ])
    expect(detail.containerCount).toBe(1)
  })

  it('defaults layers to null when RootFS has none (edge case)', async () => {
    const provider = new DockerProvider({
      getImage: () => ({
        inspect: async () => ({ Id: 'sha256:x', RepoTags: [], Size: 1, Created: '2024-01-01T00:00:00Z', Config: {}, RootFS: {} }),
        history: async () => [],
      }),
      listContainers: async () => [],
    } as unknown as Docker)
    const detail = await provider.inspectImage('sha256:x')
    expect(detail.layers).toBeNull()
    expect(detail.dangling).toBe(true)
  })
})
