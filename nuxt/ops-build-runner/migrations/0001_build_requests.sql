-- build_requests: one row per requested build+launch workflow instance.
-- State machine and its exact allowed transitions are enforced in application
-- code (src/state-machine.ts), NOT by this CHECK constraint alone -- the CHECK
-- below only guards against an unrecognized state value ever being written,
-- it does not know which FROM/TO pairs are legal.

-- gen_random_uuid() has been a core PostgreSQL 13+ builtin, but pgcrypto is
-- created defensively here in case this ever runs against an older engine.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE build_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One of the 7 hardcoded BUILD_TARGETS keys (src/targets.ts). Enforced here
  -- at the DB layer too, not merely app-layer validation -- a CHECK constraint
  -- ensures no row can ever exist with a target outside the allowlist, even if
  -- a future code path forgets to re-validate it.
  target TEXT NOT NULL CHECK (target IN (
    'ops-dashboard',
    'api-gateway',
    'auth-service',
    'inventory-service',
    'product-service',
    'ecom-admin',
    'ecom-web'
  )),

  git_ref TEXT NOT NULL,
  resolved_sha TEXT,
  reason TEXT NOT NULL,

  -- NOT a real identity. This platform has no per-operator account system for
  -- this API (single shared BUILD_RUNNER_TOKEN, same limitation as
  -- ops-dashboard's OPS_API_TOKEN) -- this column can only ever record
  -- "source IP + timestamp of the request that presented a valid token", never
  -- who a person actually is. Named explicitly so this limitation is visible
  -- in the schema itself, not just in a comment a future reader might skip.
  requester_signal TEXT NOT NULL,

  state TEXT NOT NULL CHECK (state IN (
    'requested',
    'approved',
    'building',
    'built',
    'launch_requested',
    'launch_approved',
    'launched',
    'torn_down',
    'rejected',
    'expired',
    'cancelled',
    'build_failed',
    'launch_failed'
  )),

  -- Build-approval code. Only the SHA-256 hash is ever stored -- the plaintext
  -- code is generated, sent to the approval notifier, and discarded; it is
  -- never written to this table or to any log line. Expiry is derived as
  -- created_at + APPROVAL_CODE_TTL_MINUTES (no separate expiry column: this
  -- request's own issuance time already anchors it), enforced in
  -- src/approval-code.ts, not by the database.
  approval_code_hash TEXT,
  approved_at TIMESTAMPTZ,
  approver_signal TEXT, -- same "not a real identity" caveat as requester_signal

  build_started_at TIMESTAMPTZ,
  build_finished_at TIMESTAMPTZ,
  build_exit_code INTEGER,
  build_log_ref TEXT,
  image_local_tag TEXT,
  image_digest TEXT,

  launch_requested_at TIMESTAMPTZ,
  -- Launch-approval code, same "hash only, never plaintext" rule as above.
  -- Expiry is derived as launch_requested_at + APPROVAL_CODE_TTL_MINUTES.
  launch_approval_code_hash TEXT,
  launch_approved_at TIMESTAMPTZ,
  launch_approver_signal TEXT, -- same "not a real identity" caveat

  launch_started_at TIMESTAMPTZ,
  launch_container_id TEXT,
  ttl_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_build_requests_state ON build_requests (state);
CREATE INDEX ix_build_requests_created_at ON build_requests (created_at);
