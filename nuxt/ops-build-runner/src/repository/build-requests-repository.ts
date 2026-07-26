import type { BuildRequestState } from '../state-machine.js'
import type { BuildRequestRow, Queryable } from './types.js'

export interface InsertBuildRequestParams {
  target: string
  gitRef: string
  resolvedSha: string | null
  reason: string
  requesterSignal: string
  approvalCodeHash: string
}

export async function insertBuildRequest(
  db: Queryable,
  params: InsertBuildRequestParams,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `INSERT INTO build_requests
       (target, git_ref, resolved_sha, reason, requester_signal, state, approval_code_hash)
     VALUES ($1, $2, $3, $4, $5, 'requested', $6)
     RETURNING *`,
    [
      params.target,
      params.gitRef,
      params.resolvedSha,
      params.reason,
      params.requesterSignal,
      params.approvalCodeHash,
    ],
  )
  const row = result.rows[0]
  if (!row) throw new Error('insertBuildRequest: INSERT ... RETURNING produced no row')
  return row
}

export async function findBuildRequestById(
  db: Queryable,
  requestId: string,
): Promise<BuildRequestRow | undefined> {
  const result = await db.query<BuildRequestRow>(
    `SELECT * FROM build_requests WHERE request_id = $1`,
    [requestId],
  )
  return result.rows[0]
}

/**
 * Locks the row (`FOR UPDATE`) for the duration of the caller's transaction --
 * every state transition reads-then-writes this row, so this must be called
 * with a `PoolClient` inside a `BEGIN`/`COMMIT`, never a bare `Pool`.
 */
export async function findBuildRequestByIdForUpdate(
  db: Queryable,
  requestId: string,
): Promise<BuildRequestRow | undefined> {
  const result = await db.query<BuildRequestRow>(
    `SELECT * FROM build_requests WHERE request_id = $1 FOR UPDATE`,
    [requestId],
  )
  return result.rows[0]
}

export interface ApproveBuildRequestParams {
  requestId: string
  newState: BuildRequestState
  approverSignal: string
}

export async function markApproved(
  db: Queryable,
  params: ApproveBuildRequestParams,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = $2, approved_at = now(), approver_signal = $3, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId, params.newState, params.approverSignal],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markApproved: request_id not found')
  return row
}

export interface SetLaunchRequestedParams {
  requestId: string
  newState: BuildRequestState
  launchApprovalCodeHash: string
}

export async function markLaunchRequested(
  db: Queryable,
  params: SetLaunchRequestedParams,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = $2, launch_requested_at = now(), launch_approval_code_hash = $3, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId, params.newState, params.launchApprovalCodeHash],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markLaunchRequested: request_id not found')
  return row
}

export interface SetLaunchApprovedParams {
  requestId: string
  newState: BuildRequestState
  launchApproverSignal: string
}

export async function markLaunchApproved(
  db: Queryable,
  params: SetLaunchApprovedParams,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = $2, launch_approved_at = now(), launch_approver_signal = $3, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId, params.newState, params.launchApproverSignal],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markLaunchApproved: request_id not found')
  return row
}

/** Generic "just change the state" transition (rejected/cancelled/expired/torn_down). */
export async function setState(
  db: Queryable,
  requestId: string,
  newState: BuildRequestState,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = $2, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [requestId, newState],
  )
  const row = result.rows[0]
  if (!row) throw new Error('setState: request_id not found')
  return row
}

// -- Phase 2: build/launch orchestration -----------------------------------

export interface MarkBuildingParams {
  requestId: string
}

/** approved -> building. Records the real start time -- see BuildOrchestrator. */
export async function markBuilding(db: Queryable, params: MarkBuildingParams): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = 'building', build_started_at = now(), updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markBuilding: request_id not found')
  return row
}

export interface MarkBuiltParams {
  requestId: string
  buildExitCode: number
  buildLogRef: string
  imageLocalTag: string
  imageDigest: string | null
}

/** building -> built, on a successful `docker build`. */
export async function markBuilt(db: Queryable, params: MarkBuiltParams): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = 'built', build_finished_at = now(), build_exit_code = $2,
            build_log_ref = $3, image_local_tag = $4, image_digest = $5, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId, params.buildExitCode, params.buildLogRef, params.imageLocalTag, params.imageDigest],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markBuilt: request_id not found')
  return row
}

export interface MarkBuildFailedParams {
  requestId: string
  buildExitCode: number | null
  buildLogRef: string
}

/** building -> build_failed. The log/exit code are still recorded on failure, never discarded. */
export async function markBuildFailed(
  db: Queryable,
  params: MarkBuildFailedParams,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = 'build_failed', build_finished_at = now(), build_exit_code = $2,
            build_log_ref = $3, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId, params.buildExitCode, params.buildLogRef],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markBuildFailed: request_id not found')
  return row
}

export interface MarkLaunchedParams {
  requestId: string
  launchContainerId: string
  ttlExpiresAt: Date
}

/** launch_approved -> launched. `ttlExpiresAt` is mandatory -- never skippable, see LaunchOrchestrator. */
export async function markLaunched(db: Queryable, params: MarkLaunchedParams): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = 'launched', launch_started_at = now(), launch_container_id = $2,
            ttl_expires_at = $3, updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId, params.launchContainerId, params.ttlExpiresAt],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markLaunched: request_id not found')
  return row
}

export interface MarkLaunchFailedParams {
  requestId: string
}

/** launch_approved -> launch_failed. Still records the attempt time. */
export async function markLaunchFailed(
  db: Queryable,
  params: MarkLaunchFailedParams,
): Promise<BuildRequestRow> {
  const result = await db.query<BuildRequestRow>(
    `UPDATE build_requests
        SET state = 'launch_failed', launch_started_at = now(), updated_at = now()
      WHERE request_id = $1
      RETURNING *`,
    [params.requestId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('markLaunchFailed: request_id not found')
  return row
}
