import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_PATH = path.join(__dirname, '..', 'migrations', '0003_app_role_and_privileges.sql')

/**
 * `audit_log`'s tamper-resistance is a real DB-privilege property (see the
 * migration's own doc comment), not something a unit test can exercise
 * against a live database in this environment (no Postgres instance is
 * available to this test run). This is a MIGRATION-LEVEL static assertion
 * instead, per the plan's explicit fallback for this case: it asserts the
 * committed SQL actually grants what it claims to grant, and does NOT grant
 * UPDATE/DELETE on audit_log to the application role.
 *
 * This does not prove the grants take effect correctly against a real
 * server -- only that the SQL that would apply them says what this test
 * expects. Running `npm run migrate` against a real Postgres instance and
 * confirming `\dp build_requests`/`\dp audit_log` (or an attempted UPDATE/
 * DELETE as the build_runner_app role, expected to fail) match this test's
 * expectations is a pre-production verification step, not yet performed in
 * this environment (no Postgres instance is available here) -- see
 * docs/apps/ops-build-runner/DecisionLog.md.
 */
describe('audit_log role privileges (migration-level static assertion)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8')

  it('grants INSERT and SELECT on audit_log to build_runner_app', () => {
    expect(sql).toMatch(/GRANT\s+SELECT,\s*INSERT\s+ON\s+audit_log\s+TO\s+build_runner_app/i)
  })

  it('never grants UPDATE or DELETE on audit_log to any role', () => {
    const auditLogGrantLines = sql
      .split('\n')
      .filter((line) => /GRANT/i.test(line) && /audit_log/i.test(line))

    expect(auditLogGrantLines.length).toBeGreaterThan(0)
    for (const line of auditLogGrantLines) {
      expect(line).not.toMatch(/\bUPDATE\b/i)
      expect(line).not.toMatch(/\bDELETE\b/i)
    }
  })

  it('grants SELECT/INSERT/UPDATE (never DELETE) on build_requests to build_runner_app', () => {
    const buildRequestsGrantLines = sql
      .split('\n')
      .filter((line) => /GRANT/i.test(line) && /\bbuild_requests\b/i.test(line))

    expect(buildRequestsGrantLines.length).toBeGreaterThan(0)
    for (const line of buildRequestsGrantLines) {
      expect(line).not.toMatch(/\bDELETE\b/i)
    }
    expect(sql).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+build_requests\s+TO\s+build_runner_app/i)
  })

  it('never hardcodes a real secret -- the role password is a substituted placeholder', () => {
    expect(sql).toContain('${BUILD_RUNNER_APP_DB_PASSWORD}')
  })
})
