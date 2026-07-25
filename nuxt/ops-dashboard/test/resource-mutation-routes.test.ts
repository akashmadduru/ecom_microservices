import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageDetail, NetworkDetail, RuntimeProvider, VolumeDetail } from '../server/runtime/types'
import type {
  ImageMutatingProvider,
  NetworkMutatingProvider,
  VolumeMutatingProvider,
} from '../server/runtime/resource-mutating-types'

/**
 * Phase 5 image/volume/network mutating routes (named remove + prune). Mirrors
 * test/mutation-route.test.ts's stubbing/mocking style exactly: Nitro globals
 * are stubbed on globalThis, the singleton module is mocked to inject fake
 * read-only + mutating providers, and `createError`/gate logic is exercised
 * for real via `resource-mutation-guard.ts`.
 */

type FakeEvent = { context: { params: { id: string | undefined } } }

function stubNitroGlobals(): void {
  ;(globalThis as unknown as { defineEventHandler: (h: unknown) => unknown }).defineEventHandler = (
    handler: unknown,
  ) => handler
  ;(globalThis as unknown as { getRouterParam: (event: FakeEvent, name: 'id') => string | undefined }).getRouterParam = (
    event,
    name,
  ) => event.context.params[name]
}

let fakeProvider: Pick<RuntimeProvider, 'inspectImage' | 'inspectVolume' | 'inspectNetwork'>
let fakeImageMutating: ImageMutatingProvider
let fakeVolumeMutating: VolumeMutatingProvider
let fakeNetworkMutating: NetworkMutatingProvider

vi.mock('../server/runtime/singleton', () => ({
  getRuntimeProvider: () => fakeProvider,
  getImageMutatingProvider: () => fakeImageMutating,
  getVolumeMutatingProvider: () => fakeVolumeMutating,
  getNetworkMutatingProvider: () => fakeNetworkMutating,
}))

function imageDetail(overrides: Partial<ImageDetail>): ImageDetail {
  return {
    id: 'img-abc123',
    repoTags: ['app:latest'],
    size: 100,
    createdAt: null,
    dangling: false,
    containerCount: 0,
    labels: {},
    layers: null,
    history: null,
    referencedBy: [],
    ...overrides,
  } as ImageDetail
}

function volumeDetail(overrides: Partial<VolumeDetail>): VolumeDetail {
  return {
    id: 'pg-data',
    name: 'pg-data',
    driver: 'local',
    mountpoint: '/x',
    scope: 'local',
    createdAt: null,
    labels: {},
    options: {},
    status: null,
    ...overrides,
  } as VolumeDetail
}

function networkDetail(overrides: Partial<NetworkDetail>): NetworkDetail {
  return {
    id: 'net1',
    name: 'ecom_edge',
    driver: 'bridge',
    scope: 'local',
    internal: false,
    attachable: false,
    ipamSubnets: [],
    containers: [],
    createdAt: null,
    containerDetails: [],
    options: {},
    labels: {},
    ...overrides,
  } as NetworkDetail
}

function makeEvent(id: string | undefined): FakeEvent {
  return { context: { params: { id } } }
}

/** Collect the parsed `ops.resource_mutation` audit lines from a console.log spy. */
function auditLines(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((c) => c[0])
    .filter((arg): arg is string => typeof arg === 'string')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((obj) => obj.event === 'ops.resource_mutation')
}

let savedAllow: string | undefined
let savedVolumes: string | undefined
let savedNetworks: string | undefined

beforeEach(() => {
  savedAllow = process.env.OPS_ALLOW_RESOURCE_MUTATIONS
  savedVolumes = process.env.OPS_MANAGED_VOLUMES
  savedNetworks = process.env.OPS_MANAGED_NETWORKS
})

afterEach(() => {
  if (savedAllow === undefined) delete process.env.OPS_ALLOW_RESOURCE_MUTATIONS
  else process.env.OPS_ALLOW_RESOURCE_MUTATIONS = savedAllow
  if (savedVolumes === undefined) delete process.env.OPS_MANAGED_VOLUMES
  else process.env.OPS_MANAGED_VOLUMES = savedVolumes
  if (savedNetworks === undefined) delete process.env.OPS_MANAGED_NETWORKS
  else process.env.OPS_MANAGED_NETWORKS = savedNetworks
  vi.restoreAllMocks()
})

describe('POST /api/images/[id]/remove', () => {
  beforeEach(() => {
    fakeImageMutating = { removeImage: vi.fn().mockResolvedValue({ deleted: ['img-abc123'] }), pruneImages: vi.fn() }
    fakeProvider = { inspectImage: vi.fn().mockResolvedValue(imageDetail({})) } as never
  })

  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/images/[id]/remove.post')
    return mod.default as (event: FakeEvent) => Promise<unknown>
  }

  it('400s on an invalid image id before any inspect', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    const handler = await loadHandler()
    await expect(handler(makeEvent('../etc'))).rejects.toMatchObject({ statusCode: 400 })
    expect(fakeProvider.inspectImage).not.toHaveBeenCalled()
  })

  it('403s when the global switch is disabled, without inspecting', async () => {
    delete process.env.OPS_ALLOW_RESOURCE_MUTATIONS
    const handler = await loadHandler()
    await expect(handler(makeEvent('img-abc123'))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeProvider.inspectImage).not.toHaveBeenCalled()
  })

  it('403s when the image is still referenced by a container, even with the switch enabled', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    fakeProvider = { inspectImage: vi.fn().mockResolvedValue(imageDetail({ containerCount: 2 })) } as never
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler()
    await expect(handler(makeEvent('img-abc123'))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeImageMutating.removeImage).not.toHaveBeenCalled()
    const lines = auditLines(logSpy)
    expect(lines.map((l) => l.outcome)).toEqual(['denied'])
  })

  it('succeeds when the switch is enabled and containerCount is 0', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler()
    const result = await handler(makeEvent('img-abc123'))
    expect(result).toMatchObject({ ok: true, action: 'remove', resourceType: 'image', id: 'img-abc123' })
    expect(fakeImageMutating.removeImage).toHaveBeenCalledWith('img-abc123')
    const lines = auditLines(logSpy)
    expect(lines.map((l) => l.outcome)).toEqual(['attempt', 'success'])
  })
})

describe('POST /api/images/prune', () => {
  beforeEach(() => {
    fakeImageMutating = {
      removeImage: vi.fn(),
      pruneImages: vi.fn().mockResolvedValue({ imagesDeleted: ['sha256:def'], spaceReclaimed: 10 }),
    }
  })

  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/images/prune.post')
    return mod.default as (event: FakeEvent) => Promise<unknown>
  }

  it('403s when the global switch is disabled', async () => {
    delete process.env.OPS_ALLOW_RESOURCE_MUTATIONS
    const handler = await loadHandler()
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeImageMutating.pruneImages).not.toHaveBeenCalled()
  })

  it('succeeds when the global switch is enabled — no per-target gate applies', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    const handler = await loadHandler()
    const result = await handler(makeEvent(undefined))
    expect(result).toMatchObject({
      ok: true,
      action: 'prune',
      resourceType: 'image',
      imagesDeleted: ['sha256:def'],
      spaceReclaimed: 10,
    })
  })
})

describe('POST /api/volumes/[id]/remove', () => {
  beforeEach(() => {
    fakeVolumeMutating = { removeVolume: vi.fn().mockResolvedValue(undefined), pruneVolumes: vi.fn() }
    fakeProvider = { inspectVolume: vi.fn().mockResolvedValue(volumeDetail({})) } as never
  })

  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/volumes/[id]/remove.post')
    return mod.default as (event: FakeEvent) => Promise<unknown>
  }

  it('403s when the volume has no compose-volume label, even with the switch enabled', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_VOLUMES = 'pg-data'
    fakeProvider = { inspectVolume: vi.fn().mockResolvedValue(volumeDetail({ labels: {} })) } as never
    const handler = await loadHandler()
    await expect(handler(makeEvent('pg-data'))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeVolumeMutating.removeVolume).not.toHaveBeenCalled()
  })

  it('403s when the label value is not in OPS_MANAGED_VOLUMES', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_VOLUMES = 'other-volume'
    fakeProvider = {
      inspectVolume: vi.fn().mockResolvedValue(volumeDetail({ labels: { 'com.docker.compose.volume': 'pg-data' } })),
    } as never
    const handler = await loadHandler()
    await expect(handler(makeEvent('pg-data'))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('succeeds when the label value is on OPS_MANAGED_VOLUMES and the switch is enabled', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_VOLUMES = 'pg-data'
    fakeProvider = {
      inspectVolume: vi.fn().mockResolvedValue(volumeDetail({ labels: { 'com.docker.compose.volume': 'pg-data' } })),
    } as never
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler()
    const result = await handler(makeEvent('pg-data'))
    expect(result).toMatchObject({ ok: true, action: 'remove', resourceType: 'volume', id: 'pg-data' })
    expect(fakeVolumeMutating.removeVolume).toHaveBeenCalledWith('pg-data')
    const lines = auditLines(logSpy)
    expect(lines.map((l) => l.outcome)).toEqual(['attempt', 'success'])
  })
})

describe('POST /api/volumes/prune', () => {
  beforeEach(() => {
    fakeVolumeMutating = {
      removeVolume: vi.fn(),
      pruneVolumes: vi.fn().mockResolvedValue({ volumesDeleted: ['anon'], spaceReclaimed: 5 }),
    }
  })

  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/volumes/prune.post')
    return mod.default as (event: FakeEvent) => Promise<unknown>
  }

  it('403s when the global switch is disabled', async () => {
    delete process.env.OPS_ALLOW_RESOURCE_MUTATIONS
    const handler = await loadHandler()
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('succeeds when enabled', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    const handler = await loadHandler()
    const result = await handler(makeEvent(undefined))
    expect(result).toMatchObject({ ok: true, action: 'prune', resourceType: 'volume', volumesDeleted: ['anon'] })
  })
})

describe('POST /api/networks/[id]/remove', () => {
  beforeEach(() => {
    fakeNetworkMutating = { removeNetwork: vi.fn().mockResolvedValue(undefined), pruneNetworks: vi.fn() }
    fakeProvider = { inspectNetwork: vi.fn().mockResolvedValue(networkDetail({})) } as never
  })

  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/networks/[id]/remove.post')
    return mod.default as (event: FakeEvent) => Promise<unknown>
  }

  it('403s when the network is not on OPS_MANAGED_NETWORKS', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_NETWORKS = 'ecom_frontend'
    fakeProvider = {
      inspectNetwork: vi.fn().mockResolvedValue(networkDetail({ labels: { 'com.docker.compose.network': 'ecom_edge' } })),
    } as never
    const handler = await loadHandler()
    await expect(handler(makeEvent('net1'))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeNetworkMutating.removeNetwork).not.toHaveBeenCalled()
  })

  it('succeeds when the network is on OPS_MANAGED_NETWORKS and the switch is enabled', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_NETWORKS = 'ecom_edge'
    fakeProvider = {
      inspectNetwork: vi.fn().mockResolvedValue(networkDetail({ labels: { 'com.docker.compose.network': 'ecom_edge' } })),
    } as never
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler()
    const result = await handler(makeEvent('net1'))
    expect(result).toMatchObject({ ok: true, action: 'remove', resourceType: 'network', id: 'net1' })
    expect(fakeNetworkMutating.removeNetwork).toHaveBeenCalledWith('net1')
    const lines = auditLines(logSpy)
    expect(lines.map((l) => l.outcome)).toEqual(['attempt', 'success'])
  })

  it('translates a 404 from inspect into a 404 response', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_NETWORKS = 'ecom_edge'
    fakeProvider = {
      inspectNetwork: vi.fn().mockRejectedValue(Object.assign(new Error('no such network'), { statusCode: 404 })),
    } as never
    const handler = await loadHandler()
    await expect(handler(makeEvent('missing'))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('POST /api/networks/prune', () => {
  beforeEach(() => {
    fakeNetworkMutating = {
      removeNetwork: vi.fn(),
      pruneNetworks: vi.fn().mockResolvedValue({ networksDeleted: ['ecom_edge'] }),
    }
  })

  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/networks/prune.post')
    return mod.default as (event: FakeEvent) => Promise<unknown>
  }

  it('403s when the global switch is disabled', async () => {
    delete process.env.OPS_ALLOW_RESOURCE_MUTATIONS
    const handler = await loadHandler()
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('succeeds when enabled', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    const handler = await loadHandler()
    const result = await handler(makeEvent(undefined))
    expect(result).toMatchObject({ ok: true, action: 'prune', resourceType: 'network', networksDeleted: ['ecom_edge'] })
  })
})

describe('GET /api/resource-mutations-config', () => {
  async function loadHandler() {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/resource-mutations-config.get')
    return mod.default as () => unknown
  }

  it('returns the derived config without any managed-images list', async () => {
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_VOLUMES = 'pg-data'
    process.env.OPS_MANAGED_NETWORKS = 'ecom_edge'
    const handler = await loadHandler()
    expect(handler()).toEqual({
      allowed: true,
      managedVolumes: ['pg-data'],
      managedNetworks: ['ecom_edge'],
    })
  })
})
