import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Phase 5: the Docker-only image/volume/network remove/prune routes must fail
 * closed with an explicit 501 in `RUNTIME_MODE=kubernetes` — never attempt to
 * inspect a resource or construct a Docker-shaped mutating provider against a
 * cluster. Mirrors test/k8s-mutation-mode.test.ts's style exactly.
 */

type FakeEvent = { context: { params: { id: string | undefined } } }

function stubNitroGlobals(): void {
  ;(globalThis as unknown as { defineEventHandler: (h: unknown) => unknown }).defineEventHandler = (h: unknown) => h
  ;(globalThis as unknown as { getRouterParam: (e: FakeEvent, n: 'id') => string | undefined }).getRouterParam = (e, n) => e.context.params[n]
}

const inspectImageSpy = vi.fn()
const inspectVolumeSpy = vi.fn()
const inspectNetworkSpy = vi.fn()
const imageMutatingSpy = vi.fn()
const volumeMutatingSpy = vi.fn()
const networkMutatingSpy = vi.fn()

vi.mock('../server/runtime/singleton', () => ({
  getRuntimeProvider: () => ({
    inspectImage: inspectImageSpy,
    inspectVolume: inspectVolumeSpy,
    inspectNetwork: inspectNetworkSpy,
  }),
  getImageMutatingProvider: () => {
    imageMutatingSpy()
    throw new Error('should not be called in kubernetes mode')
  },
  getVolumeMutatingProvider: () => {
    volumeMutatingSpy()
    throw new Error('should not be called in kubernetes mode')
  },
  getNetworkMutatingProvider: () => {
    networkMutatingSpy()
    throw new Error('should not be called in kubernetes mode')
  },
}))

function makeEvent(id: string | undefined): FakeEvent {
  return { context: { params: { id } } }
}

let savedMode: string | undefined

describe('resource mutation routes in kubernetes mode', () => {
  beforeEach(() => {
    savedMode = process.env.RUNTIME_MODE
    process.env.RUNTIME_MODE = 'kubernetes'
    process.env.OPS_ALLOW_RESOURCE_MUTATIONS = 'true'
    process.env.OPS_MANAGED_VOLUMES = 'pg-data'
    process.env.OPS_MANAGED_NETWORKS = 'ecom_edge'
    inspectImageSpy.mockReset()
    inspectVolumeSpy.mockReset()
    inspectNetworkSpy.mockReset()
    imageMutatingSpy.mockReset()
    volumeMutatingSpy.mockReset()
    networkMutatingSpy.mockReset()
  })

  afterEach(() => {
    if (savedMode === undefined) delete process.env.RUNTIME_MODE
    else process.env.RUNTIME_MODE = savedMode
    vi.restoreAllMocks()
  })

  it('rejects image remove with 501 and never inspects or reaches the mutating provider', async () => {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/images/[id]/remove.post')
    const handler = mod.default as (event: FakeEvent) => Promise<unknown>
    await expect(handler(makeEvent('img-abc123'))).rejects.toMatchObject({ statusCode: 501 })
    expect(inspectImageSpy).not.toHaveBeenCalled()
    expect(imageMutatingSpy).not.toHaveBeenCalled()
  })

  it('rejects image prune with 501', async () => {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/images/prune.post')
    const handler = mod.default as (event: FakeEvent) => Promise<unknown>
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 501 })
    expect(imageMutatingSpy).not.toHaveBeenCalled()
  })

  it('rejects volume remove with 501 and never inspects or reaches the mutating provider', async () => {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/volumes/[id]/remove.post')
    const handler = mod.default as (event: FakeEvent) => Promise<unknown>
    await expect(handler(makeEvent('pg-data'))).rejects.toMatchObject({ statusCode: 501 })
    expect(inspectVolumeSpy).not.toHaveBeenCalled()
    expect(volumeMutatingSpy).not.toHaveBeenCalled()
  })

  it('rejects volume prune with 501', async () => {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/volumes/prune.post')
    const handler = mod.default as (event: FakeEvent) => Promise<unknown>
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 501 })
    expect(volumeMutatingSpy).not.toHaveBeenCalled()
  })

  it('rejects network remove with 501 and never inspects or reaches the mutating provider', async () => {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/networks/[id]/remove.post')
    const handler = mod.default as (event: FakeEvent) => Promise<unknown>
    await expect(handler(makeEvent('net1'))).rejects.toMatchObject({ statusCode: 501 })
    expect(inspectNetworkSpy).not.toHaveBeenCalled()
    expect(networkMutatingSpy).not.toHaveBeenCalled()
  })

  it('rejects network prune with 501', async () => {
    stubNitroGlobals()
    const mod = await import('../server/routes/api/networks/prune.post')
    const handler = mod.default as (event: FakeEvent) => Promise<unknown>
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 501 })
    expect(networkMutatingSpy).not.toHaveBeenCalled()
  })
})
