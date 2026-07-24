import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * server/middleware/auth.ts is written to run under Nitro, which auto-imports
 * `defineEventHandler` / `createError` from h3 (they are never imported
 * explicitly in the source file). Outside that build pipeline — i.e. here,
 * under plain vitest/node — those names don't exist, so the module would throw
 * a ReferenceError the instant it's imported.
 *
 * We provide minimal, behaviorally-faithful stand-ins on globalThis before
 * importing the module: `defineEventHandler` just returns the handler
 * unchanged (so we can call it directly), and `createError` builds a plain
 * Error carrying the same `statusCode`/`statusMessage`/`message` fields h3's
 * real H3Error does. This lets us exercise the actual middleware logic — not a
 * re-implementation of it — without pulling in a full Nitro/h3 test harness.
 */

interface FakeHttpError extends Error {
  statusCode?: number
  statusMessage?: string
}

type FakeEvent = {
  path: string
  req: { headers: Record<string, string | string[] | undefined> | Headers }
}

function stubNitroGlobals(): void {
  ;(globalThis as unknown as { defineEventHandler: (h: unknown) => unknown }).defineEventHandler = (
    handler: unknown,
  ) => handler
  ;(globalThis as unknown as { createError: (opts: { statusCode: number; statusMessage?: string; message?: string }) => FakeHttpError }).createError = (
    opts,
  ) => {
    const err = new Error(opts.message) as FakeHttpError
    err.statusCode = opts.statusCode
    err.statusMessage = opts.statusMessage
    return err
  }
}

async function loadMiddleware(): Promise<(event: FakeEvent) => void> {
  stubNitroGlobals()
  const mod = await import('../server/middleware/auth')
  return mod.default as unknown as (event: FakeEvent) => void
}

describe('auth middleware', () => {
  const ORIGINAL_TOKEN = process.env.OPS_API_TOKEN

  beforeEach(() => {
    process.env.OPS_API_TOKEN = 'correct-horse-battery-staple'
  })

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.OPS_API_TOKEN
    else process.env.OPS_API_TOKEN = ORIGINAL_TOKEN
  })

  it('401s an /api/* request with no Authorization header', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = { path: '/api/containers', req: { headers: {} } }
    expect(() => middleware(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    )
  })

  it('401s a malformed Authorization header (not "Bearer <token>")', async () => {
    const middleware = await loadMiddleware()
    const cases = ['Basic abc123', 'Bearerabc123', 'Bearer', 'Bearer   ']
    for (const authorization of cases) {
      const event: FakeEvent = { path: '/api/containers', req: { headers: { authorization } } }
      expect(() => middleware(event), authorization).toThrow(
        expect.objectContaining({ statusCode: 401 }),
      )
    }
  })

  it('401s a well-formed header carrying the wrong token', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: { authorization: 'Bearer not-the-right-token' } },
    }
    expect(() => middleware(event)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    )
  })

  it('passes through (no throw) on a correct Bearer token', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: { authorization: 'Bearer correct-horse-battery-staple' } },
    }
    expect(() => middleware(event)).not.toThrow()
    expect(middleware(event)).toBeUndefined()
  })

  it('accepts a lowercase "bearer" scheme keyword (case-insensitive per the /i regex)', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: { authorization: 'bearer correct-horse-battery-staple' } },
    }
    expect(() => middleware(event)).not.toThrow()
  })

  it('trims incidental whitespace around the presented token', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: { authorization: 'Bearer   correct-horse-battery-staple  ' } },
    }
    expect(() => middleware(event)).not.toThrow()
  })

  it('reads a real web Headers instance (the other event.req.headers shape it must support)', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: new Headers({ authorization: 'Bearer correct-horse-battery-staple' }) },
    }
    expect(() => middleware(event)).not.toThrow()
  })

  it('takes the first value when a header arrives as an array (proxy edge case)', async () => {
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: { authorization: ['Bearer correct-horse-battery-staple', 'Bearer other'] } },
    }
    expect(() => middleware(event)).not.toThrow()
  })

  it('fails closed with 503 when OPS_API_TOKEN is unset, even with a token presented', async () => {
    delete process.env.OPS_API_TOKEN
    const middleware = await loadMiddleware()
    const event: FakeEvent = {
      path: '/api/containers',
      req: { headers: { authorization: 'Bearer anything' } },
    }
    expect(() => middleware(event)).toThrow(
      expect.objectContaining({ statusCode: 503 }),
    )
  })

  it('never blocks a non-/api/* path, regardless of token presence or validity', async () => {
    delete process.env.OPS_API_TOKEN
    const middleware = await loadMiddleware()
    const events: FakeEvent[] = [
      { path: '/', req: { headers: {} } },
      { path: '/health', req: { headers: {} } },
      { path: '/_nuxt/entry.js', req: { headers: { authorization: 'Bearer wrong' } } },
    ]
    for (const event of events) {
      expect(() => middleware(event), event.path).not.toThrow()
      expect(middleware(event)).toBeUndefined()
    }
  })
})
