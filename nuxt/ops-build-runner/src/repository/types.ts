import type pg from '../../node_modules/@types/pg/index.js'

/**
 * The minimal surface both `pg.Pool` and `pg.PoolClient` share -- repository
 * functions accept this instead of a concrete type so a caller can pass
 * either a pool (auto-committing, single statement) or a checked-out client
 * mid-transaction (see build-request-service.ts, which holds a transaction
 * open across the approval-notifier call).
 */
export interface Queryable {
  query: pg.Pool['query']
}

export interface BuildRequestRow {
  request_id: string
  target: string
  git_ref: string
  resolved_sha: string | null
  reason: string
  requester_signal: string
  state: string
  approval_code_hash: string | null
  approved_at: Date | null
  approver_signal: string | null
  build_started_at: Date | null
  build_finished_at: Date | null
  build_exit_code: number | null
  build_log_ref: string | null
  image_local_tag: string | null
  image_digest: string | null
  launch_requested_at: Date | null
  launch_approval_code_hash: string | null
  launch_approved_at: Date | null
  launch_approver_signal: string | null
  launch_started_at: Date | null
  launch_container_id: string | null
  ttl_expires_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface AuditLogRow {
  id: string
  request_id: string
  event: string
  outcome: 'denied' | 'attempt' | 'success' | 'error'
  actor_signal: string | null
  ts: Date
  detail: unknown
}
