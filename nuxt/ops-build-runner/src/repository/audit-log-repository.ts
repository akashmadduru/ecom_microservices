import type { AuditLogRow, Queryable } from './types.js'

export interface InsertAuditLogParams {
  requestId: string
  event: string
  outcome: 'denied' | 'attempt' | 'success' | 'error'
  actorSignal: string | null
  detail?: unknown
}

/**
 * Append a row to the durable, append-only audit trail. The `build_runner_app`
 * DB role has no UPDATE/DELETE grant on this table (see
 * migrations/0003_app_role_and_privileges.sql) -- this function only ever
 * INSERTs, matching what the role is actually allowed to do.
 */
export async function insertAuditLog(db: Queryable, params: InsertAuditLogParams): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (request_id, event, outcome, actor_signal, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.requestId,
      params.event,
      params.outcome,
      params.actorSignal,
      params.detail ? JSON.stringify(params.detail) : null,
    ],
  )
}

export interface AuditLogQueryFilter {
  requestId?: string
  from?: Date
  to?: Date
}

export async function queryAuditLog(
  db: Queryable,
  filter: AuditLogQueryFilter,
): Promise<AuditLogRow[]> {
  const clauses: string[] = []
  const values: unknown[] = []

  if (filter.requestId) {
    values.push(filter.requestId)
    clauses.push(`request_id = $${values.length}`)
  }
  if (filter.from) {
    values.push(filter.from)
    clauses.push(`ts >= $${values.length}`)
  }
  if (filter.to) {
    values.push(filter.to)
    clauses.push(`ts <= $${values.length}`)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const result = await db.query<AuditLogRow>(
    `SELECT * FROM audit_log ${where} ORDER BY ts ASC`,
    values,
  )
  return result.rows
}
