import { randomUUID } from 'node:crypto'
import type { BuildRequestRow } from '../../src/repository/types.ts'

/**
 * A minimal, in-memory stand-in for `pg.Pool`/`pg.PoolClient`, faithful
 * enough to the small set of SQL statements this service's repository layer
 * issues (see build-requests-repository.ts / audit-log-repository.ts) to
 * exercise real transaction semantics (BEGIN/COMMIT/ROLLBACK) without a real
 * Postgres instance. This is what lets test/build-request-service.test.ts
 * assert "a failed notifier call leaves NO row behind" for real, not just by
 * assumption.
 *
 * Deliberately narrow: it recognizes queries by a distinctive substring
 * rather than parsing SQL generally. If the repository layer's queries
 * change shape, this file's matchers need to be updated alongside them.
 */
export class FakeDb {
  private committedRequests = new Map<string, BuildRequestRow>()
  private committedAudit: Array<{
    requestId: string
    event: string
    outcome: string
    actorSignal: string | null
    detail: unknown
  }> = []

  private working: Map<string, BuildRequestRow> | undefined
  private workingAudit: typeof this.committedAudit | undefined

  get auditLog(): ReadonlyArray<(typeof this.committedAudit)[number]> {
    return this.committedAudit
  }

  get requestCount(): number {
    return this.committedRequests.size
  }

  getCommittedRequest(requestId: string): BuildRequestRow | undefined {
    return this.committedRequests.get(requestId)
  }

  /**
   * Test-only fixture helper: directly seeds a committed row in an arbitrary
   * state (e.g. "approved", "launch_approved", "launched") without driving it
   * through the full create/approve/... service flow -- Phase 2's
   * orchestrator/worker tests need to start from states that flow can't reach
   * on its own (building/built/launched are orchestrator-only transitions).
   */
  seedRow(overrides: Partial<BuildRequestRow> & { request_id?: string }): BuildRequestRow {
    const now = new Date()
    const row: BuildRequestRow = {
      request_id: randomUUID(),
      target: 'ops-dashboard',
      git_ref: 'main',
      resolved_sha: 'a'.repeat(40),
      reason: 'testing',
      requester_signal: '127.0.0.1@now',
      state: 'approved',
      approval_code_hash: null,
      approved_at: now,
      approver_signal: '127.0.0.1@later',
      build_started_at: null,
      build_finished_at: null,
      build_exit_code: null,
      build_log_ref: null,
      image_local_tag: null,
      image_digest: null,
      launch_requested_at: null,
      launch_approval_code_hash: null,
      launch_approved_at: null,
      launch_approver_signal: null,
      launch_started_at: null,
      launch_container_id: null,
      ttl_expires_at: null,
      created_at: now,
      updated_at: now,
      ...overrides,
    }
    this.committedRequests.set(row.request_id, row)
    return row
  }

  async connect(): Promise<this> {
    return this
  }

  release(): void {
    // no-op -- a real PoolClient releases its connection back to the pool.
  }

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const sql = text.trim()

    if (/^BEGIN\b/i.test(sql)) {
      this.working = new Map(
        [...this.committedRequests.entries()].map(([id, row]) => [id, { ...row }]),
      )
      this.workingAudit = [...this.committedAudit]
      return { rows: [] }
    }
    if (/^COMMIT\b/i.test(sql)) {
      if (this.working) this.committedRequests = this.working
      if (this.workingAudit) this.committedAudit = this.workingAudit
      this.working = undefined
      this.workingAudit = undefined
      return { rows: [] }
    }
    if (/^ROLLBACK\b/i.test(sql)) {
      this.working = undefined
      this.workingAudit = undefined
      return { rows: [] }
    }

    const requests = this.working ?? this.committedRequests
    const audit = this.workingAudit ?? this.committedAudit

    if (sql.includes('INSERT INTO build_requests')) {
      const [target, gitRef, resolvedSha, reason, requesterSignal, approvalCodeHash] = params as [
        string,
        string,
        string | null,
        string,
        string,
        string,
      ]
      const row: BuildRequestRow = {
        request_id: randomUUID(),
        target,
        git_ref: gitRef,
        resolved_sha: resolvedSha,
        reason,
        requester_signal: requesterSignal,
        state: 'requested',
        approval_code_hash: approvalCodeHash,
        approved_at: null,
        approver_signal: null,
        build_started_at: null,
        build_finished_at: null,
        build_exit_code: null,
        build_log_ref: null,
        image_local_tag: null,
        image_digest: null,
        launch_requested_at: null,
        launch_approval_code_hash: null,
        launch_approved_at: null,
        launch_approver_signal: null,
        launch_started_at: null,
        launch_container_id: null,
        ttl_expires_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }
      requests.set(row.request_id, row)
      return { rows: [row as T] }
    }

    if (sql.includes('SELECT * FROM build_requests WHERE request_id = $1')) {
      const row = requests.get(params[0] as string)
      return { rows: row ? [row as T] : [] }
    }

    if (sql.includes('approved_at = now()')) {
      const [requestId, newState, approverSignal] = params as [string, string, string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = newState
      row.approved_at = new Date()
      row.approver_signal = approverSignal
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes('launch_requested_at = now()')) {
      const [requestId, newState, hash] = params as [string, string, string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = newState
      row.launch_requested_at = new Date()
      row.launch_approval_code_hash = hash
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes('launch_approved_at = now()')) {
      const [requestId, newState, signal] = params as [string, string, string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = newState
      row.launch_approved_at = new Date()
      row.launch_approver_signal = signal
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes('SET state = $2, updated_at = now()')) {
      const [requestId, newState] = params as [string, string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = newState
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    // -- Phase 2: build/launch orchestration -------------------------------

    if (sql.includes("state = 'building', build_started_at = now()")) {
      const [requestId] = params as [string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = 'building'
      row.build_started_at = new Date()
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes("state = 'built', build_finished_at = now()")) {
      const [requestId, buildExitCode, buildLogRef, imageLocalTag, imageDigest] = params as [
        string,
        number,
        string,
        string,
        string | null,
      ]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = 'built'
      row.build_finished_at = new Date()
      row.build_exit_code = buildExitCode
      row.build_log_ref = buildLogRef
      row.image_local_tag = imageLocalTag
      row.image_digest = imageDigest
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes("state = 'build_failed', build_finished_at = now()")) {
      const [requestId, buildExitCode, buildLogRef] = params as [string, number | null, string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = 'build_failed'
      row.build_finished_at = new Date()
      row.build_exit_code = buildExitCode
      row.build_log_ref = buildLogRef
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes("state = 'launched', launch_started_at = now()")) {
      const [requestId, launchContainerId, ttlExpiresAt] = params as [string, string, Date]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = 'launched'
      row.launch_started_at = new Date()
      row.launch_container_id = launchContainerId
      row.ttl_expires_at = ttlExpiresAt
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    if (sql.includes("state = 'launch_failed', launch_started_at = now()")) {
      const [requestId] = params as [string]
      const row = requests.get(requestId)
      if (!row) return { rows: [] }
      row.state = 'launch_failed'
      row.launch_started_at = new Date()
      row.updated_at = new Date()
      return { rows: [row as T] }
    }

    // src/worker.ts's raw (non-repository-function) pool queries -- picking
    // the next candidate row and sweeping expired/TTL'd rows. Matched by a
    // distinctive substring each, same convention as everything above.

    if (sql.includes("count(*)::text AS c FROM build_requests WHERE state = 'building'")) {
      const count = [...requests.values()].filter((r) => r.state === 'building').length
      return { rows: [{ c: String(count) }] as unknown as T[] }
    }

    if (sql.includes("state = 'approved' ORDER BY created_at ASC LIMIT 1")) {
      const match = [...requests.values()]
        .filter((r) => r.state === 'approved')
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0]
      return { rows: match ? ([{ request_id: match.request_id }] as unknown as T[]) : [] }
    }

    if (sql.includes("state = 'launch_approved' ORDER BY launch_approved_at ASC LIMIT 1")) {
      const match = [...requests.values()]
        .filter((r) => r.state === 'launch_approved')
        .sort((a, b) => (a.launch_approved_at?.getTime() ?? 0) - (b.launch_approved_at?.getTime() ?? 0))[0]
      return { rows: match ? ([{ request_id: match.request_id }] as unknown as T[]) : [] }
    }

    if (sql.includes("state = 'launched' AND ttl_expires_at IS NOT NULL AND ttl_expires_at <= now()")) {
      const now = new Date()
      const matches = [...requests.values()].filter(
        (r) => r.state === 'launched' && r.ttl_expires_at && r.ttl_expires_at <= now,
      )
      return { rows: matches.map((r) => ({ request_id: r.request_id })) as unknown as T[] }
    }

    if (sql.includes("state = 'requested' AND created_at +")) {
      const ttlMinutes = Number(params[0])
      const now = new Date()
      const matches = [...requests.values()].filter(
        (r) => r.state === 'requested' && new Date(r.created_at.getTime() + ttlMinutes * 60_000) <= now,
      )
      return { rows: matches.map((r) => ({ request_id: r.request_id })) as unknown as T[] }
    }

    if (sql.includes("state = 'approved' AND approved_at IS NOT NULL")) {
      const ttlMinutes = Number(params[0])
      const now = new Date()
      const matches = [...requests.values()].filter(
        (r) =>
          r.state === 'approved' &&
          r.approved_at &&
          new Date(r.approved_at.getTime() + ttlMinutes * 60_000) <= now,
      )
      return { rows: matches.map((r) => ({ request_id: r.request_id })) as unknown as T[] }
    }

    if (sql.includes("state = 'launch_requested' AND launch_requested_at IS NOT NULL")) {
      const ttlMinutes = Number(params[0])
      const now = new Date()
      const matches = [...requests.values()].filter(
        (r) =>
          r.state === 'launch_requested' &&
          r.launch_requested_at &&
          new Date(r.launch_requested_at.getTime() + ttlMinutes * 60_000) <= now,
      )
      return { rows: matches.map((r) => ({ request_id: r.request_id })) as unknown as T[] }
    }

    if (sql.includes('INSERT INTO audit_log')) {
      const [requestId, event, outcome, actorSignal, detail] = params as [
        string,
        string,
        string,
        string | null,
        string | null,
      ]
      audit.push({
        requestId,
        event,
        outcome,
        actorSignal,
        detail: detail ? (JSON.parse(detail) as unknown) : null,
      })
      return { rows: [] }
    }

    if (sql.includes('SELECT * FROM audit_log')) {
      return { rows: audit as unknown as T[] }
    }

    throw new Error(`FakeDb: unrecognized query: ${sql}`)
  }
}
