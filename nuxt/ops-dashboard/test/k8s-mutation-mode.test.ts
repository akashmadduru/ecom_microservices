import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeProvider } from '../server/runtime/types'

/**
 * Phase 3: the Docker-only mutation routes (stop/start/restart) must fail closed
 * with an explicit 501 in `RUNTIME_MODE=kubernetes` — never attempt to inspect a
 * pod or construct a Docker-shaped mutating provider against a cluster. Mirrors
 * the Nitro-global stubbing style of test/mutation-route.test.ts.
 */

type FakeEvent = { context: { params: { id: string | undefined } } }

function stubNitroGlobals(): void {
  ;(globalThis as unknown as { defineEventHandler: (h: unknown) => unknown }).defineEventHandler = (h: unknown) => h
  ;(globalThis as unknown as { getRouterParam: (e: FakeEvent, n: 'id') => string | undefined }).getRouterParam = (e, n) => e.context.params[n]
}

// The singleton is mocked so that any accidental attempt to inspect a container
// or reach the mutating provider is observable (it must NOT happen in k8s mode).
const inspectSpy = vi.fn()
const mutatingSpy = vi.fn()
vi.mock('../server/runtime/singleton', () => ({
  getRuntimeProvider: (): Pick<RuntimeProvider, 'inspectContainer'> => ({ inspectContainer: inspectSpy }),
  getMutatingProvider: () => {
    mutatingSpy()
    throw new Error('should not be called in kubernetes mode')
  },
}))

type RouteHandler = (event: FakeEvent) => Promise<unknown>
type Action = 'stop' | 'start' | 'restart'

// Vite's dynamic-import analysis needs statically-enumerable specifiers (a
// template-string path isn't glob-matchable), hence an explicit map rather
// than string interpolation into `import()`.
const ROUTE_LOADERS: Record<Action, () => Promise<{ default: unknown }>> = {
  stop: () => import('../server/routes/api/containers/[id]/stop.post'),
  start: () => import('../server/routes/api/containers/[id]/start.post'),
  restart: () => import('../server/routes/api/containers/[id]/restart.post'),
}

async function loadRoute(action: Action): Promise<RouteHandler> {
  stubNitroGlobals()
  const mod = await ROUTE_LOADERS[action]()
  return mod.default as RouteHandler
}

let savedMode: string | undefined

describe('mutation routes in kubernetes mode', () => {
  beforeEach(() => {
    savedMode = process.env.RUNTIME_MODE
    process.env.RUNTIME_MODE = 'kubernetes'
    inspectSpy.mockReset()
    mutatingSpy.mockReset()
  })

  afterEach(() => {
    if (savedMode === undefined) delete process.env.RUNTIME_MODE
    else process.env.RUNTIME_MODE = savedMode
    vi.restoreAllMocks()
  })

  it.each<Action>(['stop', 'start', 'restart'])(
    'rejects a %s with 501 and never inspects or reaches the mutating provider',
    async (action) => {
      process.env.OPS_ALLOW_MUTATIONS = 'true'
      process.env.OPS_MANAGED_SERVICES = 'api-gateway'
      const handler = await loadRoute(action)

      await expect(handler({ context: { params: { id: 'ecom_api-gateway-1' } } })).rejects.toMatchObject({ statusCode: 501 })
      expect(inspectSpy).not.toHaveBeenCalled()
      expect(mutatingSpy).not.toHaveBeenCalled()
    },
  )
})
