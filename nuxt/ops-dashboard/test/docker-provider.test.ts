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
