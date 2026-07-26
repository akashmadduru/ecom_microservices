import type pg from 'pg'
import { writeAudit } from './audit.js'
import { ConflictError } from './errors.js'
import { setState } from './repository/build-requests-repository.js'
import { withLockedBuildRequest } from './repository/with-locked-request.js'
import { assertTransitionAllowed, type BuildRequestState } from './state-machine.js'
import type { createBuildOrchestrator } from './orchestrator/build-orchestrator.js'
import type { createLaunchOrchestrator } from './orchestrator/launch-orchestrator.js'

export interface WorkerDeps {
  pool: pg.Pool
  buildOrchestrator: ReturnType<typeof createBuildOrchestrator>
  launchOrchestrator: ReturnType<typeof createLaunchOrchestrator>
  approvalCodeTtlMinutes: number
  pollIntervalMs: number
}

export interface Worker {
  stop: () => void
}

/**
 * A simple polling loop -- no new infra, `setTimeout`-chained (never a raw
 * overlapping `setInterval`) so one tick always fully finishes before the
 * next one is scheduled. Each tick, in strict order:
 *
 *   1. sweep expired approval-code windows -> `expired`
 *   2. sweep TTL-expired launched containers -> torn down
 *   3. pick up (at most) one `approved` row and build it
 *   4. pick up (at most) one `launch_approved` row and launch it
 *
 * SERIALIZATION: steps 3 and 4 are two DIFFERENT actions (build vs. launch)
 * against the SAME single isolated daemon, and per the approved
 * architecture's own scalability section, at most one of EITHER kind should
 * ever be running at a time -- concurrent builds/launches on one isolated
 * daemon is a materially weaker isolation story than one at a time. Because
 * this loop's body is fully awaited end to end before the next tick is even
 * scheduled, and steps 3/4 are awaited sequentially (never `Promise.all`'d),
 * this single-process worker never has two docker operations in flight at
 * once, by construction. Step 3 additionally re-checks the database for any
 * row still `building` before claiming a new one -- a defensive check for the
 * unlikely case of a previous process instance having crashed mid-build,
 * covering the multi-instance/restart edge case a single-process
 * never-overlapping loop can't fully rule out on its own.
 */
export function startWorker(deps: WorkerDeps): Worker {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  async function tick(): Promise<void> {
    if (stopped) return
    try {
      await sweepExpired(deps.pool, deps.approvalCodeTtlMinutes)
      await sweepTtlTeardown(deps.pool, deps.launchOrchestrator)
      await pickNextBuild(deps.pool, deps.buildOrchestrator)
      await pickNextLaunch(deps.pool, deps.launchOrchestrator)
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'ops-build-runner.worker.tick-error',
          ts: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void tick()
        }, deps.pollIntervalMs)
      }
    }
  }

  timer = setTimeout(() => {
    void tick()
  }, 0)

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}

async function pickNextBuild(
  pool: pg.Pool,
  buildOrchestrator: ReturnType<typeof createBuildOrchestrator>,
): Promise<void> {
  const building = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM build_requests WHERE state = 'building'`,
  )
  if (Number(building.rows[0]?.c ?? '0') > 0) return // one at a time -- wait for it to finish.

  const next = await pool.query<{ request_id: string }>(
    `SELECT request_id FROM build_requests WHERE state = 'approved' ORDER BY created_at ASC LIMIT 1`,
  )
  const requestId = next.rows[0]?.request_id
  if (!requestId) return

  try {
    await buildOrchestrator.runBuild(requestId)
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'ops-build-runner.worker.build-error',
        ts: new Date().toISOString(),
        requestId,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

async function pickNextLaunch(
  pool: pg.Pool,
  launchOrchestrator: ReturnType<typeof createLaunchOrchestrator>,
): Promise<void> {
  const next = await pool.query<{ request_id: string }>(
    `SELECT request_id FROM build_requests WHERE state = 'launch_approved' ORDER BY launch_approved_at ASC LIMIT 1`,
  )
  const requestId = next.rows[0]?.request_id
  if (!requestId) return

  try {
    await launchOrchestrator.runLaunch(requestId)
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'ops-build-runner.worker.launch-error',
        ts: new Date().toISOString(),
        requestId,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

async function sweepTtlTeardown(
  pool: pg.Pool,
  launchOrchestrator: ReturnType<typeof createLaunchOrchestrator>,
): Promise<void> {
  const rows = await pool.query<{ request_id: string }>(
    `SELECT request_id FROM build_requests
      WHERE state = 'launched' AND ttl_expires_at IS NOT NULL AND ttl_expires_at <= now()`,
  )
  for (const row of rows.rows) {
    try {
      await launchOrchestrator.tearDown(row.request_id)
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'ops-build-runner.worker.teardown-error',
          ts: new Date().toISOString(),
          requestId: row.request_id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
}

/**
 * Sweeps rows past their approval-code expiry window into `expired`, for
 * every state the state machine (the single source of truth -- see
 * state-machine.ts) actually allows an `expired` transition FROM:
 *   - `requested`: anchored at `created_at` (the build-approval code's own
 *     issuance time -- see migrations/0001's comment on why there is no
 *     separate expiry column).
 *   - `launch_requested`: anchored at `launch_requested_at` (the
 *     launch-approval code's issuance time), same reasoning.
 *   - `approved`: this state has no approval code of its own left to expire
 *     (it was already consumed reaching "approved") -- but the state machine
 *     nonetheless allows approved -> expired, and the plan calls for sweeping
 *     it, so this treats `approved_at + ttl` as the window an approved-but-
 *     never-built request must be picked up within before it is swept to
 *     expired: a safety valve against an approved request silently sitting
 *     forever un-built, reusing the same TTL constant rather than adding a
 *     separate config knob for it.
 *
 * `launch_approved` is deliberately NOT swept here: the state machine's own
 * transition table (`TRANSITIONS.launch_approved`) only allows
 * `['launched', 'launch_failed']` -- there is no `launch_approved -> expired`
 * transition to take. Sweeping it would either violate that transition table
 * or require adding a new transition to it, neither of which this phase's
 * scope calls for; this is a deliberate deviation from the plan's prose
 * (which named `launch_approved` among the swept states) in favor of the
 * state machine file's own, more authoritative source of truth.
 */
async function sweepExpired(pool: pg.Pool, ttlMinutes: number): Promise<void> {
  await sweepExpiredRequested(pool, ttlMinutes)
  await sweepExpiredApproved(pool, ttlMinutes)
  await sweepExpiredLaunchRequested(pool, ttlMinutes)
}

async function sweepExpiredRequested(pool: pg.Pool, ttlMinutes: number): Promise<void> {
  const rows = await pool.query<{ request_id: string }>(
    `SELECT request_id FROM build_requests
      WHERE state = 'requested' AND created_at + ($1 || ' minutes')::interval <= now()`,
    [ttlMinutes],
  )
  for (const row of rows.rows) {
    await expireOne(pool, row.request_id, 'build-approval-code-expired')
  }
}

async function sweepExpiredApproved(pool: pg.Pool, ttlMinutes: number): Promise<void> {
  const rows = await pool.query<{ request_id: string }>(
    `SELECT request_id FROM build_requests
      WHERE state = 'approved' AND approved_at IS NOT NULL
        AND approved_at + ($1 || ' minutes')::interval <= now()`,
    [ttlMinutes],
  )
  for (const row of rows.rows) {
    await expireOne(pool, row.request_id, 'approved-but-not-built-within-ttl')
  }
}

async function sweepExpiredLaunchRequested(pool: pg.Pool, ttlMinutes: number): Promise<void> {
  const rows = await pool.query<{ request_id: string }>(
    `SELECT request_id FROM build_requests
      WHERE state = 'launch_requested' AND launch_requested_at IS NOT NULL
        AND launch_requested_at + ($1 || ' minutes')::interval <= now()`,
    [ttlMinutes],
  )
  for (const row of rows.rows) {
    await expireOne(pool, row.request_id, 'launch-approval-code-expired')
  }
}

async function expireOne(pool: pg.Pool, requestId: string, reason: string): Promise<void> {
  try {
    await withLockedBuildRequest(pool, requestId, async (client, row) => {
      // Re-checked under the row lock: the sweep's own SELECT ran outside
      // this transaction, so the row may already have been acted on (e.g.
      // approved, or expired by an earlier sweep step) by the time this
      // transaction starts. An invalid-transition 409 in that case (see
      // with-locked-request.ts, which maps InvalidTransitionError ->
      // ConflictError) is an expected, benign race -- caught below, not a bug.
      assertTransitionAllowed(asState(row.state), 'expired')
      const updated = await setState(client, requestId, 'expired')
      await writeAudit(client, {
        requestId,
        event: 'build_request.expire',
        outcome: 'success',
        actorSignal: null,
        detail: { reason },
      })
      return updated
    })
  } catch (err) {
    if (err instanceof ConflictError) return
    throw err
  }
}

function asState(state: string): BuildRequestState {
  return state as BuildRequestState
}
