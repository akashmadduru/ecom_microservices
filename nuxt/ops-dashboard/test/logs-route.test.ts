import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeProvider } from '../server/runtime/types'

/**
 * server/routes/api/containers/[id]/logs.get.ts relies on Nitro auto-imports
 * (`defineEventHandler`, `getRouterParam`, `createError`) the same way the
 * auth middleware does — see test/auth-middleware.test.ts for why we stub
 * them rather than pull in a full Nitro harness.
 *
 * We deliberately do NOT mock docker-modem's `demuxStream`: that's the exact
 * logic with real edge-case risk (multiplexed stdout/stderr framing), so these
 * tests drive it for real through a genuine `Docker()` client's `.modem`
 * (constructing a dockerode client does no I/O). Only `getRuntimeProvider` is
 * mocked, to substitute a fake `streamLogs` that hands back a plain
 * `PassThrough` we can feed framed bytes into by hand.
 */

interface FakeHttpError extends Error {
  statusCode?: number
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
    return err
  }
  ;(globalThis as unknown as { getRouterParam: (event: FakeEvent, name: string) => string | undefined }).getRouterParam = (
    event,
    name,
  ) => event.context.params[name]
}

type FakeEvent = {
  context: { params: Record<string, string | undefined> }
  url: URL
}

/** Build one Docker multiplex frame: 1-byte type + 3 zero bytes + 4-byte BE length + payload. */
function frame(streamType: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt8(streamType, 0)
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

let fakeProvider: Pick<RuntimeProvider, 'streamLogs'>

vi.mock('../server/runtime/singleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/runtime/singleton')>()
  return {
    ...actual,
    getRuntimeProvider: () => fakeProvider,
  }
})

async function loadHandler() {
  stubNitroGlobals()
  const mod = await import('../server/routes/api/containers/[id]/logs.get')
  return mod.default as unknown as (event: FakeEvent) => Promise<Response>
}

function makeEvent(id: string | undefined, query = ''): FakeEvent {
  return {
    context: { params: { id } },
    url: new URL(`http://localhost/api/containers/${id ?? ''}/logs${query}`),
  }
}

describe('GET /api/containers/[id]/logs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('400s when the container id is missing', async () => {
    const handler = await loadHandler()
    await expect(handler(makeEvent(undefined))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('400s on a container id shaped like a path-injection attempt, before ever calling the provider', async () => {
    const streamLogs = vi.fn()
    fakeProvider = { streamLogs }
    const handler = await loadHandler()
    await expect(handler(makeEvent('abc/../../etc'))).rejects.toMatchObject({ statusCode: 400 })
    expect(streamLogs).not.toHaveBeenCalled()
  })

  it('maps a 404 from the provider to a 404 response', async () => {
    fakeProvider = {
      streamLogs: vi.fn().mockRejectedValue(Object.assign(new Error('no such container'), { statusCode: 404 })),
    }
    const handler = await loadHandler()
    await expect(handler(makeEvent('missing-id'))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rethrows non-404 provider errors untranslated', async () => {
    fakeProvider = {
      streamLogs: vi.fn().mockRejectedValue(new Error('engine unreachable')),
    }
    const handler = await loadHandler()
    await expect(handler(makeEvent('abc'))).rejects.toThrow('engine unreachable')
  })

  it('demuxes a multiplexed stdout/stderr stream into clean SSE `data:` frames', async () => {
    const dockerStream = new PassThrough()
    fakeProvider = { streamLogs: vi.fn().mockResolvedValue(dockerStream) }
    const handler = await loadHandler()

    const response = await handler(makeEvent('abc'))
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')

    const readPromise = readAll(response.body!)
    dockerStream.write(frame(1, 'hello world')) // stdout
    dockerStream.write(frame(2, 'oops')) // stderr
    dockerStream.end()

    const text = await readPromise
    // Framing bytes must never reach the client — only clean decoded text,
    // one SSE `data:` block per demuxed chunk, stdout and stderr interleaved
    // in arrival order.
    expect(text).toBe('data: hello world\n\ndata: oops\n\n')
  })

  it('emits a complete (newline-terminated) line immediately, and flushes the trailing partial line as its own event on stream end', async () => {
    const dockerStream = new PassThrough()
    fakeProvider = { streamLogs: vi.fn().mockResolvedValue(dockerStream) }
    const handler = await loadHandler()

    const response = await handler(makeEvent('abc'))
    const readPromise = readAll(response.body!)
    // 'line2' has no trailing newline in this single chunk, so at the moment
    // it arrives it is indistinguishable from a line that will be extended by
    // a *later* chunk (the exact scenario the split-frame test below covers)
    // — it can only safely be treated as complete once the stream actually
    // ends. That correctness requirement costs a bit of cosmetic SSE-event
    // grouping (two events here instead of one), which is the right tradeoff.
    dockerStream.write(frame(1, 'line1\nline2'))
    dockerStream.end()

    const text = await readPromise
    expect(text).toBe('data: line1\n\ndata: line2\n\n')
  })

  it('reassembles a frame whose header/payload arrives split across two writes', async () => {
    const dockerStream = new PassThrough()
    fakeProvider = { streamLogs: vi.fn().mockResolvedValue(dockerStream) }
    const handler = await loadHandler()

    const response = await handler(makeEvent('abc'))
    const readPromise = readAll(response.body!)
    const full = frame(1, 'split-frame')
    dockerStream.write(full.subarray(0, 5)) // partial header
    dockerStream.write(full.subarray(5)) // rest of header + full payload
    dockerStream.end()

    const text = await readPromise
    expect(text).toBe('data: split-frame\n\n')
  })

  it('clamps an out-of-range `tail` query param and defaults an invalid one', async () => {
    const dockerStream = new PassThrough()
    const streamLogs = vi.fn().mockResolvedValue(dockerStream)
    fakeProvider = { streamLogs }
    const handler = await loadHandler()

    await handler(makeEvent('abc', '?tail=999999'))
    expect(streamLogs).toHaveBeenLastCalledWith('abc', { tail: 5000, follow: true, timestamps: false })

    dockerStream.end()

    const dockerStream2 = new PassThrough()
    streamLogs.mockResolvedValue(dockerStream2)
    await handler(makeEvent('abc', '?tail=not-a-number'))
    expect(streamLogs).toHaveBeenLastCalledWith('abc', { tail: 200, follow: true, timestamps: false })
    dockerStream2.end()
  })

  it('destroys the underlying docker stream on client disconnect (cancel), not just on natural end', async () => {
    const dockerStream = new PassThrough()
    fakeProvider = { streamLogs: vi.fn().mockResolvedValue(dockerStream) }
    const handler = await loadHandler()

    const response = await handler(makeEvent('abc'))
    expect(dockerStream.destroyed).toBe(false)

    await response.body!.cancel()

    expect(dockerStream.destroyed).toBe(true)
  })

  it('does not throw if cleanup runs twice (double cancel is a no-op the second time)', async () => {
    const dockerStream = new PassThrough()
    fakeProvider = { streamLogs: vi.fn().mockResolvedValue(dockerStream) }
    const handler = await loadHandler()

    const response = await handler(makeEvent('abc'))
    await expect(response.body!.cancel()).resolves.toBeUndefined()
    expect(dockerStream.destroyed).toBe(true)

    // A second cancel/cleanup trigger must be a guarded no-op, not a crash.
    await expect(response.body!.cancel()).resolves.toBeUndefined()
  })

  it('429s once the concurrent-stream cap is exceeded, and releases a slot on cancel so a subsequent stream can open', async () => {
    // Fresh module graph so the process-wide stream counter starts at 0,
    // independent of any streams opened/closed by earlier tests in this file.
    vi.resetModules()
    const openStreams: PassThrough[] = []
    fakeProvider = {
      streamLogs: vi.fn().mockImplementation(async () => {
        const s = new PassThrough()
        openStreams.push(s)
        return s
      }),
    }
    const handler = await loadHandler()

    const responses: Response[] = []
    for (let i = 0; i < 10; i += 1) {
      responses.push(await handler(makeEvent(`c${i}`)))
    }
    // The 11th concurrent (unreleased) stream must be rejected, not queued.
    await expect(handler(makeEvent('c-overflow'))).rejects.toMatchObject({ statusCode: 429 })

    // Releasing one slot (client disconnect) makes room for another.
    await responses[0]!.body!.cancel()
    const retryResponse = await handler(makeEvent('c-retry'))
    expect(retryResponse).toBeDefined()

    // Clean up every stream this test opened so no heartbeat timers leak past it.
    await Promise.all([...responses.slice(1), retryResponse].map((r) => r.body!.cancel()))
  })
})
