-- audit_log: append-only trail of every state-transition attempt/outcome.
-- Tamper-resistance for this table is enforced at the PRIVILEGE layer, not
-- just by convention -- see 0003_app_role_and_privileges.sql, which grants
-- the application role INSERT/SELECT here but deliberately withholds
-- UPDATE/DELETE.

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES build_requests (request_id),
  event TEXT NOT NULL,

  -- Mirrors the exact outcome vocabulary nuxt/ops-dashboard's
  -- mutation-guard.ts / resource-mutation-guard.ts already use, so an
  -- operator reading logs/audit trails across this platform's Docker-adjacent
  -- tooling sees one consistent vocabulary, not a per-service dialect.
  outcome TEXT NOT NULL CHECK (outcome IN ('denied', 'attempt', 'success', 'error')),

  -- Same "not a real identity" caveat as build_requests.requester_signal /
  -- approver_signal -- this is whichever of those signals applies to the
  -- event being recorded, never a resolved person.
  actor_signal TEXT,

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail JSONB
);

CREATE INDEX ix_audit_log_request_id ON audit_log (request_id);
CREATE INDEX ix_audit_log_ts ON audit_log (ts);
