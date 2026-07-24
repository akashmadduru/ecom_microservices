import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerDetail, RuntimeProvider } from '../server/runtime/types'
import type { MutatingRuntimeProvider } from '../server/runtime/mutating-types'

/**
 * The Phase 2 mutating routes rely on Nitro auto-imports (`defineEventHandler`,
 * `getRouterParam`) exactly like the read-only routes and the auth middleware.
 * We stub those on globalThis before importing the handler — see
 * test/logs-route.test.ts / test/auth-middleware.test.ts for the rationale.
 *
 * `createError` is NOT stubbed here: the route validates the id via
 * `assertValidContainerId` and the gate throws via `runContainerMutation`, both
 * of which import the REAL `createError` from 'h3' (so thrown errors carry a
 * genuine `.statusCode`). Only the singleton is mocked, to inject a fake
 * read-only provider (`inspectContainer`) and a fake mutating provider whose
 * stop/start/restart are spies.
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

// Module-level fakes, reassigned per test, referenced by the singleton mock.
let fakeProvider: Pick<RuntimeProvider, 'inspectContainer'>
let fakeMutating: MutatingRuntimeProvider

vi.mock('../server/runtime/singleton', () => ({
  getRuntimeProvider: () => fakeProvider,
  getMutatingProvider: () => fakeMutating,
}))

type RouteHandler = (event: FakeEvent) => Promise<{ ok: boolean; action: string; id: string }>

async function loadHandler(
  action: 'stop' | 'start' | 'restart' = 'stop',
): Promise<RouteHandler> {
  stubNitroGlobals()
  // Static specifiers (not a template): Vite can only analyze literal imports.
  const mod
    = action === 'stop'
      ? await import('../server/routes/api/containers/[id]/stop.post')
      : action === 'start'
        ? await import('../server/routes/api/containers/[id]/start.post')
        : await import('../server/routes/api/containers/[id]/restart.post')
  return mod.default as unknown as RouteHandler
}

function makeEvent(id: string | undefined): FakeEvent {
  return { context: { params: { id } } }
}

/** Minimal ContainerDetail with only the fields the gate reads. */
function detail(overrides: Partial<ContainerDetail>): ContainerDetail {
  return {
    id: 'abc123',
    name: 'api-gateway-1',
    service: 'api-gateway',
    managed: true,
    ...overrides,
  } as ContainerDetail
}

function makeMutating(): MutatingRuntimeProvider {
  return {
    stopContainer: vi.fn().mockResolvedValue(undefined),
    startContainer: vi.fn().mockResolvedValue(undefined),
    restartContainer: vi.fn().mockResolvedValue(undefined),
  }
}

/** Collect the parsed `ops.mutation` audit lines from a console.log spy. */
function auditLines(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((c) => c[0])
    .filter((arg): arg is string => typeof arg === 'string')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((obj) => obj.event === 'ops.mutation')
}

let savedAllow: string | undefined
let savedServices: string | undefined

describe('POST /api/containers/[id]/(stop|start|restart)', () => {
  beforeEach(() => {
    savedAllow = process.env.OPS_ALLOW_MUTATIONS
    savedServices = process.env.OPS_MANAGED_SERVICES
    fakeMutating = makeMutating()
    fakeProvider = { inspectContainer: vi.fn().mockResolvedValue(detail({})) }
  })

  afterEach(() => {
    if (savedAllow === undefined) delete process.env.OPS_ALLOW_MUTATIONS
    else process.env.OPS_ALLOW_MUTATIONS = savedAllow
    if (savedServices === undefined) delete process.env.OPS_MANAGED_SERVICES
    else process.env.OPS_MANAGED_SERVICES = savedServices
    vi.restoreAllMocks()
  })

  it('400s on an invalid container id BEFORE any inspect or Docker call', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    process.env.OPS_MANAGED_SERVICES = 'api-gateway'
    const inspect = vi.fn()
    fakeProvider = { inspectContainer: inspect }
    const handler = await loadHandler('stop')

    await expect(handler(makeEvent('abc/../../etc'))).rejects.toMatchObject({ statusCode: 400 })
    expect(inspect).not.toHaveBeenCalled()
    expect(fakeMutating.stopContainer).not.toHaveBeenCalled()
  })

  it('403s when OPS_ALLOW_MUTATIONS is unset, regardless of the allowlist, without inspecting', async () => {
    delete process.env.OPS_ALLOW_MUTATIONS
    process.env.OPS_MANAGED_SERVICES = 'api-gateway'
    const inspect = vi.fn().mockResolvedValue(detail({}))
    fakeProvider = { inspectContainer: inspect }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler('stop')

    await expect(handler(makeEvent('abc123'))).rejects.toMatchObject({ statusCode: 403 })
    // Global switch is checked before inspect — a disabled instance leaks nothing.
    expect(inspect).not.toHaveBeenCalled()
    expect(fakeMutating.stopContainer).not.toHaveBeenCalled()

    const lines = auditLines(logSpy)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ action: 'stop', allowed: false, outcome: 'denied' })
  })

  it('403s when OPS_ALLOW_MUTATIONS is a non-"true" value ("1"), failing closed', async () => {
    process.env.OPS_ALLOW_MUTATIONS = '1'
    process.env.OPS_MANAGED_SERVICES = 'api-gateway'
    const handler = await loadHandler('stop')
    await expect(handler(makeEvent('abc123'))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('403s when the service is NOT in OPS_MANAGED_SERVICES even with mutations globally enabled', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    process.env.OPS_MANAGED_SERVICES = 'some-other-service'
    fakeProvider = { inspectContainer: vi.fn().mockResolvedValue(detail({ service: 'api-gateway' })) }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler('stop')

    await expect(handler(makeEvent('abc123'))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeMutating.stopContainer).not.toHaveBeenCalled()

    const lines = auditLines(logSpy)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ action: 'stop', service: 'api-gateway', allowed: false, outcome: 'denied' })
  })

  it('403s an UNMANAGED container even if mutations are enabled and the allowlist is broad', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    // Even a list that (nonsensically) references an unmanaged container's null
    // service can never match — managed:false is rejected outright.
    process.env.OPS_MANAGED_SERVICES = 'api-gateway,'
    fakeProvider = {
      inspectContainer: vi.fn().mockResolvedValue(detail({ service: null, managed: false })),
    }
    const handler = await loadHandler('stop')

    await expect(handler(makeEvent('abc123'))).rejects.toMatchObject({ statusCode: 403 })
    expect(fakeMutating.stopContainer).not.toHaveBeenCalled()
  })

  it('succeeds when BOTH the global switch and the allowlist permit, calling the mutating provider once', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    process.env.OPS_MANAGED_SERVICES = 'web,api-gateway,worker'
    fakeProvider = { inspectContainer: vi.fn().mockResolvedValue(detail({ service: 'api-gateway' })) }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler('stop')

    const result = await handler(makeEvent('abc123'))
    expect(result).toEqual({ ok: true, action: 'stop', id: 'abc123' })
    expect(fakeMutating.stopContainer).toHaveBeenCalledTimes(1)
    expect(fakeMutating.stopContainer).toHaveBeenCalledWith('abc123')

    // Both an "attempt" (pre-call) and a "success" (post-call) line are recorded.
    const lines = auditLines(logSpy)
    expect(lines.map((l) => l.outcome)).toEqual(['attempt', 'success'])
    expect(lines.every((l) => l.allowed === true)).toBe(true)
  })

  it('routes start and restart to their matching provider methods', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    process.env.OPS_MANAGED_SERVICES = 'api-gateway'
    fakeProvider = { inspectContainer: vi.fn().mockResolvedValue(detail({ service: 'api-gateway' })) }

    const startHandler = await loadHandler('start')
    await startHandler(makeEvent('abc123'))
    expect(fakeMutating.startContainer).toHaveBeenCalledWith('abc123')

    const restartHandler = await loadHandler('restart')
    await restartHandler(makeEvent('abc123'))
    expect(fakeMutating.restartContainer).toHaveBeenCalledWith('abc123')
  })

  it('translates a 404 from inspect into a 404 response', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    process.env.OPS_MANAGED_SERVICES = 'api-gateway'
    fakeProvider = {
      inspectContainer: vi.fn().mockRejectedValue(Object.assign(new Error('no such container'), { statusCode: 404 })),
    }
    const handler = await loadHandler('stop')
    await expect(handler(makeEvent('missing-id'))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('records an "error" audit line and translates a 404 when the Docker action itself fails', async () => {
    process.env.OPS_ALLOW_MUTATIONS = 'true'
    process.env.OPS_MANAGED_SERVICES = 'api-gateway'
    fakeProvider = { inspectContainer: vi.fn().mockResolvedValue(detail({ service: 'api-gateway' })) }
    fakeMutating = {
      ...makeMutating(),
      stopContainer: vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 404 })),
    }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = await loadHandler('stop')

    await expect(handler(makeEvent('abc123'))).rejects.toMatchObject({ statusCode: 404 })
    const lines = auditLines(logSpy)
    expect(lines.map((l) => l.outcome)).toEqual(['attempt', 'error'])
  })
})
