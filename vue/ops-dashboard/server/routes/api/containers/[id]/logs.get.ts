import { Writable } from 'node:stream'
import { getDockerClient, getRuntimeProvider } from '../../../../runtime/singleton'
import { assertValidContainerId, translateDockerNotFound } from '../../../../runtime/container-request'
import { acquireLogStreamSlot, releaseLogStreamSlot } from '../../../../runtime/log-stream-limiter'

/**
 * Live log stream for one container, delivered as Server-Sent Events.
 *
 * Key correctness details:
 * - No TTY -> Docker multiplexes stdout/stderr with an 8-byte frame header. We
 *   MUST demux via `modem.demuxStream` or the browser sees raw framing bytes.
 * - A 15s heartbeat comment keeps idle connections from being reaped and lets
 *   the client distinguish "dead" from "silent".
 * - Resource lifecycle is the single most important bit: on client disconnect
 *   (the web ReadableStream's `cancel`) AND on stream end/error we clear the
 *   heartbeat and DESTROY the underlying docker stream, otherwise an abandoned
 *   tail leaks a proxy connection forever.
 * - We return a standard web `Response` wrapping a `ReadableStream` and set the
 *   SSE headers on it directly. This is the portable, version-proof path — it
 *   sidesteps the h3 helper utilities (getQuery/createEventStream), which are
 *   broken in the bundled Nitro rc build.
 */

/** Read query params from the already-parsed absolute `event.url`. */
function readQuery(event: { url?: URL; path?: string }): URLSearchParams {
  if (event.url instanceof URL) return event.url.searchParams
  const path = event.path ?? ''
  const q = path.indexOf('?')
  return new URLSearchParams(q === -1 ? '' : path.slice(q + 1))
}

/**
 * Stateful SSE line formatter. Docker chunk boundaries are NOT guaranteed to
 * be line-aligned, so formatting each chunk independently can split a single
 * log line across two SSE `data:` events, or emit a spurious trailing blank
 * line. This buffers a partial trailing line across chunks and only flushes
 * complete lines; call `flush()` once on stream end to emit anything left.
 */
function createSseLineFormatter() {
  let carry = ''
  // One `data:` field per line, ONE trailing blank line for the whole batch —
  // per the SSE spec, multiple `data:` fields with no blank line between them
  // are a single event whose payload joins the fields with `\n` (this is what
  // lets a burst of several physical log lines render as one coherent message
  // instead of one SSE event per line).
  const format = (lines: string[]): string => {
    if (lines.length === 0) return ''
    let out = ''
    for (const line of lines) out += `data: ${line}\n`
    return out + '\n'
  }
  return {
    /** Complete lines found in `chunk` (combined with any carried partial line); returns '' if still buffering. */
    push(chunk: string): string {
      const combined = carry + chunk
      const parts = combined.split(/\r?\n/)
      carry = parts.pop() ?? ''
      return format(parts)
    },
    /** Emit any partial trailing line as its own event. Call once, on stream end. */
    flush(): string {
      if (!carry) return ''
      const out = format([carry])
      carry = ''
      return out
    },
  }
}

export default defineEventHandler(async (event) => {
  const id = assertValidContainerId(getRouterParam(event, 'id'))

  const query = readQuery(event)
  const tailRaw = Number.parseInt(query.get('tail') ?? '200', 10)
  const tail = Number.isNaN(tailRaw) || tailRaw < 0 ? 200 : Math.min(tailRaw, 5000)
  const timestampsRaw = query.get('timestamps')
  const timestamps = timestampsRaw === 'true' || timestampsRaw === '1'

  // Bounded, process-wide: prevents a client from exhausting proxy/server
  // connections by opening unlimited concurrent tails (see log-stream-limiter.ts).
  acquireLogStreamSlot()
  let slotReleased = false
  const releaseSlotOnce = (): void => {
    if (slotReleased) return
    slotReleased = true
    releaseLogStreamSlot()
  }

  const provider = getRuntimeProvider()
  const docker = getDockerClient()

  let dockerStream: NodeJS.ReadableStream & { destroy?: () => void }
  try {
    dockerStream = await provider.streamLogs(id, { tail, follow: true, timestamps })
  } catch (err: unknown) {
    releaseSlotOnce()
    translateDockerNotFound(err, id)
  }

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let cleanedUp = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (text: string): void => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          // Controller already closed (client gone); nothing to do.
        }
      }

      // One formatter PER sink (not shared) — stdout and stderr are
      // independent byte streams once demuxed, so a partial line on one must
      // never be reassembled using the other's carry buffer.
      const stdoutFmt = createSseLineFormatter()
      const stderrFmt = createSseLineFormatter()

      const makeSink = (fmt: ReturnType<typeof createSseLineFormatter>): Writable =>
        new Writable({
          write(chunk: Buffer, _enc, cb) {
            enqueue(fmt.push(chunk.toString('utf8')))
            cb()
          },
        })

      // Demux the multiplexed docker stream; both sinks feed the same SSE output
      // so stdout and stderr interleave as they arrive.
      docker.modem.demuxStream(dockerStream, makeSink(stdoutFmt), makeSink(stderrFmt))

      heartbeat = setInterval(() => enqueue(': keep-alive\n\n'), 15_000)

      const finish = (): void => {
        // Flush any partial trailing line from either sink before closing.
        enqueue(stdoutFmt.flush())
        enqueue(stderrFmt.flush())
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
      dockerStream.on('end', finish)
      dockerStream.on('error', finish)
    },
    // Called when the client disconnects (tab closed / fetch aborted).
    cancel() {
      cleanup()
    },
  })

  function cleanup(): void {
    if (cleanedUp) return
    cleanedUp = true
    if (heartbeat) clearInterval(heartbeat)
    // Release the proxy connection held by the tail.
    dockerStream.destroy?.()
    releaseSlotOnce()
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
