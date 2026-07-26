import { insertAuditLog, type InsertAuditLogParams } from './repository/audit-log-repository.js'
import type { Queryable } from './repository/types.js'

/**
 * One audit event, written to BOTH places every time:
 *   1. The durable `audit_log` table (source of truth -- tamper-resistant via
 *      DB privilege, see migrations/0003_app_role_and_privileges.sql).
 *   2. A structured stdout JSON line (supplementary convenience, for
 *      operational-tooling parity with the rest of this platform -- mirrors
 *      nuxt/ops-dashboard's mutation-guard.ts / resource-mutation-guard.ts
 *      "one line per attempt/success/denied/error" discipline).
 *
 * Never call `insertAuditLog` directly outside this module -- this is the
 * single place both destinations are guaranteed to agree.
 */
export async function writeAudit(db: Queryable, params: InsertAuditLogParams): Promise<void> {
  console.log(
    JSON.stringify({
      event: 'ops-build-runner.audit',
      ts: new Date().toISOString(),
      requestId: params.requestId,
      auditEvent: params.event,
      outcome: params.outcome,
      actorSignal: params.actorSignal,
      detail: params.detail ?? null,
    }),
  )
  await insertAuditLog(db, params)
}
