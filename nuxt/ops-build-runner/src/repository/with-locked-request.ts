import type pg from 'pg'
import { ConflictError, ForbiddenError, NotFoundError } from '../errors.js'
import { InvalidTransitionError } from '../state-machine.js'
import { findBuildRequestByIdForUpdate } from './build-requests-repository.js'
import type { BuildRequestRow } from './types.js'

/**
 * Shared plumbing for every action that reads-then-writes one `build_requests`
 * row under `SELECT ... FOR UPDATE`: opens a transaction, locks the row, 404s
 * if it doesn't exist, hands the row to `fn`, commits on success.
 * `InvalidTransitionError` (thrown by `assertTransitionAllowed`) is translated
 * to the 409 `ConflictError` the HTTP layer expects. A `ForbiddenError` (bad/
 * expired approval code) is a special case: `fn` has already written a
 * "denied" audit row inside this same transaction before throwing, and that
 * row is real information worth keeping, so this commits rather than rolling
 * back before re-throwing.
 *
 * Originally inlined in service/build-request-service.ts (the HTTP-facing
 * approve/launch-request/launch-approve/cancel actions). Phase 2's
 * BuildOrchestrator/LaunchOrchestrator/worker need the exact same locking
 * discipline for the build/launch/teardown/expiry transitions, so this is
 * factored out to one shared implementation instead of being duplicated
 * three more times.
 */
export async function withLockedBuildRequest<T>(
  pool: pg.Pool,
  requestId: string,
  fn: (client: pg.PoolClient, row: BuildRequestRow) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const row = await findBuildRequestByIdForUpdate(client, requestId)
    if (!row) {
      throw new NotFoundError(`No build request with id "${requestId}".`)
    }

    const result = await fn(client, row)
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (err instanceof ForbiddenError) {
      await client.query('COMMIT').catch(() => undefined)
    } else {
      await client.query('ROLLBACK').catch(() => undefined)
    }
    if (err instanceof InvalidTransitionError) {
      throw new ConflictError(err.message)
    }
    throw err
  } finally {
    client.release()
  }
}
