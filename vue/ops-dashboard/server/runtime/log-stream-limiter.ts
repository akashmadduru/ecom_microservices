import { createError } from 'h3'

/**
 * A live log tail holds an open connection through the socket-proxy plus a
 * heartbeat timer for as long as the client keeps it open. There is exactly
 * one shared operator token (no per-user identity), so "authenticated" is a
 * low bar — without a cap, a single client could open unbounded concurrent
 * tails and exhaust proxy/server file descriptors and memory. This is a
 * process-wide counter (not per-client, since there is no per-client identity
 * to key on) bounding total concurrent tails.
 */
const MAX_CONCURRENT_LOG_STREAMS = 10

let active = 0

/** Reserve a stream slot or throw 429. Always pair with `release()`. */
export function acquireLogStreamSlot(): void {
  if (active >= MAX_CONCURRENT_LOG_STREAMS) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Too many concurrent log streams (limit: ${MAX_CONCURRENT_LOG_STREAMS}). Close an existing log view and retry.`,
    })
  }
  active += 1
}

/** Idempotency is the caller's responsibility (call exactly once per acquired slot). */
export function releaseLogStreamSlot(): void {
  active = Math.max(0, active - 1)
}
