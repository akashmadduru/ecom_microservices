# Feature: ops-build-runner — Phase 1 (Foundation) + Phase 2 (Real Orchestration)

Last verified against: `ops-build-runner/` as built (plain Node.js 24 + TypeScript,
`node:http` + a hand-rolled router, `pg`, `dockerode`), `ops-build-runner/migrations/*.sql`,
`ops-build-runner/src/{targets,state-machine,approval-code,token,config,
git-ancestor-guard,git-checkout,audit,actor-signal,errors,db,migrate,worker,index}.ts`,
`ops-build-runner/src/orchestrator/{build-orchestrator,launch-orchestrator}.ts`,
`ops-build-runner/src/notifier/{types,slack-notifier,console-notifier,factory}.ts`,
`ops-build-runner/src/repository/{types,build-requests-repository,
audit-log-repository,public-shape,with-locked-request}.ts`, `ops-build-runner/src/service/
build-request-service.ts`, `ops-build-runner/src/http/{router,auth,server,routes}.ts`,
`ops-build-runner/docker-compose.yml`, `ops-build-runner/Dockerfile`,
`ops-build-runner/.env.example`.

**Grounding:** Built. Phase 1 (foundation: scaffold, data model, allowlist, approval
state machine, REST API) and Phase 2 (real orchestration: `docker build`/`docker run`
execution, the real `GitAncestorGuard`, TTL-based auto-teardown) are both built, approved
explicitly in writing by the user as a high-risk feature at each phase. Dashboard-side
integration/UI is Phase 3, a **later phase, not built yet** — see Known Limitations below
and [`DecisionLog.md`](./DecisionLog.md).

Related docs: [`DecisionLog.md`](./DecisionLog.md) (Phase 1's two blocking findings the
user explicitly accepted before that phase was built, and Phase 2's fresh, separate
re-confirmation of the isolation tradeoff before real orchestration shipped),
`docs/apps/ops-dashboard/DecisionLog.md` (why this is a fourth, structurally separate
subsystem rather than an extension of ops-dashboard's existing Docker-socket-proxies).

## Summary

`ops-build-runner` is a new, standalone backend service — its own top-level directory
(`ops-build-runner/`, sibling to `python/`, `vue/`, `nuxt/`), own `package.json`/
lockfile/`tsconfig.json`/`Dockerfile`/test setup, own dedicated Postgres instance — that
will eventually let an operator request a build of one of 7 hardcoded platform
components, get that build approved via a Slack-delivered one-time code, and (in a later
phase) launch the resulting image, all gated by an explicit, human-in-the-loop approval
workflow. It is **not** part of `nuxt/ops-dashboard`; it is a fourth, structurally
separate system, because that app's existing three Docker-socket-proxies were
deliberately found to have no safe way to grant `docker build`/container-create — see
`docs/apps/ops-dashboard/DecisionLog.md` for that finding in full.

Phase 1 (this document) builds the service's own foundation and ships nothing that can
actually build or launch a container yet:

- Project scaffold: `ops-build-runner/` with its own `package.json`, `package-lock.json`,
  `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `Dockerfile`,
  `docker-compose.yml`, `.env.example`.
- Data model: two Postgres tables (`build_requests`, `audit_log`), applied via numbered,
  forward-only SQL migrations under `migrations/`, run by a small migration runner
  (`src/migrate.ts`) — mirroring the "explicit, ordered, reviewable" spirit of this
  repo's Python services' Alembic migrations, without pulling in Alembic itself for a
  schema this small.
- The 7-entry hardcoded target allowlist (`src/targets.ts`).
- The approval state machine (`src/state-machine.ts`), an explicit, enumerated
  from-state → allowed-to-states transition table.
- The REST API (`src/http/routes.ts`), exactly matching the approved contract.
- A pluggable `ApprovalNotifier` (`src/notifier/`): Slack webhook (the real delivery
  path, per explicit user choice) and console (local dev/testing only, never selected by
  default).
- `GitAncestorGuard` (`src/git-ancestor-guard.ts`): an interface boundary Phase 2 fills
  in with a real `git fetch` + ancestor check. Phase 1 ships
  `NotImplementedGitAncestorGuard`, which **always rejects** — every
  `POST /build-requests` call fails at this step until Phase 2 replaces it. This is
  deliberate (see [DecisionLog](./DecisionLog.md)), not an oversight.

## Data model

**`build_requests`** — one row per requested build+launch workflow instance.
`request_id` (UUID, PK), `target` (CHECK-constrained to the 7 allowlist keys — enforced
at the DB layer, not just app-layer validation), `git_ref`, `resolved_sha`, `reason`,
`requester_signal` (source IP + timestamp — explicitly **not** a real identity; this
platform authenticates with a single shared `BUILD_RUNNER_TOKEN`, so there genuinely is
no "who" to record beyond that), `state` (CHECK-constrained to the 13 state-machine
values), `approval_code_hash` / `launch_approval_code_hash` (SHA-256 hex digests only —
the plaintext code is never persisted), `approved_at` / `approver_signal` /
`launch_requested_at` / `launch_approved_at` / `launch_approver_signal` (same
not-a-real-identity caveat), plus the build/launch execution fields Phase 2 will
populate (`build_started_at`, `build_finished_at`, `build_exit_code`, `build_log_ref`,
`image_local_tag`, `image_digest`, `launch_started_at`, `launch_container_id`,
`ttl_expires_at`), `created_at`/`updated_at`.

**`audit_log`** — append-only. `id` (BIGSERIAL PK), `request_id` (FK to
`build_requests`), `event`, `outcome` (`denied`/`attempt`/`success`/`error` — the exact
vocabulary `nuxt/ops-dashboard`'s `mutation-guard.ts`/`resource-mutation-guard.ts`
already use, for cross-service audit-vocabulary consistency), `actor_signal`, `ts`,
`detail` (JSONB).

A dedicated, narrowly-scoped Postgres role, `build_runner_app` (created by
`migrations/0003_app_role_and_privileges.sql`, applied via `MIGRATION_DATABASE_URL` — a
superuser connection, never the role it creates), is what the **running application**
connects with (`DATABASE_URL`). It has `SELECT`/`INSERT`/`UPDATE` (never `DELETE`) on
`build_requests`, and — the load-bearing part — only `SELECT`/`INSERT` on `audit_log`,
with **no `UPDATE`/`DELETE` grant at all**. This is a real, enforced-by-the-database
tamper-resistance property, not a code-review convention: even a fully compromised
application process cannot rewrite or erase its own audit trail through this role: it
can only append to it.

## The 7-entry target allowlist

Hardcoded in `src/targets.ts`, `as const`, never derived from request input, config, or
a directory scan:

```
ops-dashboard, api-gateway, auth-service, inventory-service, product-service,
ecom-admin, ecom-web
```

Each entry carries a `dockerfilePath`/`buildContext` (relative to the monorepo root) for
Phase 2 to build against — Phase 1 does not check these paths out or build anything.

## The approval state machine

An explicit, enumerated transition table (`src/state-machine.ts`'s `TRANSITIONS`
`Record`), never an implicit/ad-hoc state change:

```
requested -> approved -> building -> built -> launch_requested -> launch_approved -> launched -> torn_down
requested -> rejected | expired | cancelled
approved -> expired | cancelled
building -> build_failed
built -> cancelled
launch_requested -> expired
launch_approved -> launch_failed
```

Every route/service function that changes `build_requests.state` goes through
`assertTransitionAllowed`; a transition not in the table is rejected with a 409
(`ConflictError`), never silently allowed. Every transition writes an `audit_log` row
via `src/audit.ts`'s `writeAudit`, which writes to **both** the durable table (source of
truth) **and** a structured stdout JSON line (supplementary, for operational-tooling
parity with the rest of this platform) — mirroring `mutation-guard.ts`'s /
`resource-mutation-guard.ts`'s "one line per attempt/success/denied/error" discipline.

## Approval workflow

`ApprovalNotifier.sendApprovalCode(requestId, code, context)` is the pluggable
interface. `SlackApprovalNotifier` posts target/gitRef/reason/code to a webhook URL from
`SLACK_WEBHOOK_URL` (required, no default — fails closed exactly like this platform's
`OPS_API_TOKEN`/`BUILD_RUNNER_TOKEN` convention). `ConsoleApprovalNotifier` logs the
plaintext code to stdout — **local dev/testing only**, selected only by the exact string
`APPROVAL_NOTIFIER=console`; anything else (including unset) means "slack", the required
default. This asymmetric default is deliberate: a misconfigured deployment must never
silently fall back to a mode where an operator could read their own approval code out of
the service's own logs and self-approve.

Approval codes are `crypto.randomBytes(16).toString('hex')`, stored only as a SHA-256
hash (`approval_code_hash`/`launch_approval_code_hash`) — the plaintext is generated,
handed to the notifier, and discarded; it is never written to the database or to this
service's own logs (Slack receiving the plaintext is the intended delivery path, not a
leak). Expiry is 15 minutes by default (`APPROVAL_CODE_TTL_MINUTES`), computed as
`created_at + ttl` for the build-approval code and `launch_requested_at + ttl` for the
launch-approval code — there is no separate expiry column; each code's own issuance
timestamp anchors it (see `migrations/0001_build_requests.sql`'s comment on this
resolution). Verification checks both the hash match **and** the expiry.

`POST /build-requests` holds one Postgres transaction open across the awaited
`ApprovalNotifier.sendApprovalCode` call: if the notifier throws (e.g. an unreachable
Slack webhook), the entire transaction — including the row insert that happened moments
before — is rolled back, and the caller gets a 503. No row is ever left behind in
`requested` state with an approval code nobody was ever told about. The same pattern
protects `POST /build-requests/:id/launch-request`.

## REST API

```
POST   /build-requests                      { target, gitRef, reason } -> 201 { requestId, state }
POST   /build-requests/:id/approve          { approvalCode } -> 200 { state } | 403
GET    /build-requests/:id                  -> 200 { ...row, minus approval_code_hash/launch_approval_code_hash }
POST   /build-requests/:id/launch-request   {} -> 200 { state }  (only from 'built')
POST   /build-requests/:id/launch-approve   { approvalCode } -> 200 { state }
POST   /build-requests/:id/cancel           {} -> 200 { state }  (only where the transition table allows it)
GET    /audit                                ?requestId=&from=&to= -> 200 [ auditEntry ]
```

Every endpoint requires `Authorization: Bearer <BUILD_RUNNER_TOKEN>` — a **new,
separate** credential from `nuxt/ops-dashboard`'s `OPS_API_TOKEN`, never reused. The API
fails closed (503) if `BUILD_RUNNER_TOKEN` is unset, checked before route matching so an
unauthenticated caller learns nothing about which paths exist — mirroring
`nuxt/ops-dashboard/server/middleware/auth.ts`'s exact hash-then-`timingSafeEqual`
discipline (`src/token.ts` restates it verbatim rather than importing it — this service
shares no dependency with ops-dashboard by design).

`POST /build-requests` validation order, exactly as specified: (1) auth; (2) `target`
must be one of the 7 allowlist keys (400 if not); (3) `gitRef` non-empty (400); (4)
`GitAncestorGuard.verifyAncestor(gitRef)` — Phase 1's stub always rejects (400); (5)
create the row, issue/hash/store the approval code, notify.

## Why plain `node:http`, not Express/Fastify

This API has exactly 7 routes, all small JSON in/out, with no streaming bodies,
cookies, or view rendering. A ~150-line hand-rolled router (`src/http/router.ts`),
fully covered by tests, solves that correctly without adding a framework dependency —
consistent with this monorepo's general preference for lean dependencies. Revisit if a
later phase materially grows this service's route count or requirements.

## Docker/network topology (Phase 1: scaffolding only)

`docker-compose.yml` defines `build-runner-api` and a dedicated `build-runner-db`
Postgres instance, on a new `ops_build_network` — this compose file never references
`ecom_network` or `ops_network` (nuxt/ops-dashboard's network) at all; that absence is
the isolation boundary at the network level. **This is network-level segmentation
only** — explicitly **not** the full host/VM isolation the approved architecture calls
for as the complete solution for a service that will (Phase 2) execute `docker
build`/`docker run` on behalf of an approved request. That gap is accepted for this
local-dev/initial pass, per explicit user decision — see
[DecisionLog](./DecisionLog.md).

## Tests

`ops-build-runner/test/` covers: the state machine's transition table (every allowed
transition, every terminal state, rejection of disallowed transitions);
approval-code hash+expiry logic (correct code, wrong code, TTL boundary, expired,
never-issued); the 7-entry allowlist (accepts all 7, rejects anything else, case
sensitivity); the bearer-auth fail-closed/401/timing-safe behavior; the router's path
matching; the notifier factory's fail-closed slack/console selection; the
`GitAncestorGuard` stub's always-reject behavior; the full `createBuildRequestService`
against an in-memory fake Postgres (real BEGIN/COMMIT/ROLLBACK semantics) covering the
validation ordering, the notifier-failure rollback, and every state transition/rejection
path; and a migration-level static assertion for `audit_log`'s role privileges (no live
Postgres instance is available in this environment to test the real enforced grants —
see that test file's own doc comment and [DecisionLog](./DecisionLog.md)).

## Phase 2 (built): real orchestration

`build_requests.state` can now reach every state in the machine for real:
`RealGitAncestorGuard` (`src/git-ancestor-guard.ts`) replaces Phase 1's always-reject
stub, backed by `GitCheckoutManager` (`src/git-checkout.ts`), which maintains one
persistent, scoped git clone of the monorepo (`GIT_REMOTE_URL`), refreshed with a real
`git fetch` before every ancestor check, and checks out a fresh `git worktree` per build
(never a shared mutable working directory). `BuildOrchestrator`
(`src/orchestrator/build-orchestrator.ts`) runs a real `docker build` against the
isolated `build-daemon` (rootless Docker-in-Docker — see `docker-compose.yml`),
persisting the full build log to `BUILD_LOG_DIR` and transitioning `approved -> building
-> built|build_failed`. `LaunchOrchestrator` (`src/orchestrator/launch-orchestrator.ts`)
runs a real `docker run` of THIS SAME request's own `image_local_tag` only (never a
caller-supplied image reference), applying a mandatory TTL and transitioning
`launch_approved -> launched|launch_failed`. `src/worker.ts` is a simple polling
background loop that drives both orchestrators, tears down TTL-expired launched
containers, and sweeps expired approval-code windows into `expired`. Builds/launches are
serialized (one at a time against the one isolated daemon) — see `src/worker.ts`'s own
doc comment. No image is ever pushed to a registry; everything stays local to the
isolated daemon.

## Known Limitations

- **The approval workflow is not a real security boundary against a compromised
  `BUILD_RUNNER_TOKEN`** — see [DecisionLog](./DecisionLog.md) for this finding restated
  in full, as explicitly accepted by the user (Phase 1).
- **This is network-level isolation only**, not full host/VM isolation — see
  [DecisionLog](./DecisionLog.md)'s Phase 1 finding and its Phase 2 entry re-confirming
  the same tradeoff now that this stack actually executes `docker build`/`docker run`,
  not just accepts/rejects API requests. **The blast radius is now materially larger**
  than Phase 1's: a compromise of `build-runner-api` can now direct real container
  builds/launches against the isolated daemon, bounded only by `ops_build_network`'s
  segmentation and the rootless daemon's own user-namespace boundary — not by a host/VM
  boundary. `build-daemon` itself IS rootless Docker-in-Docker rather than classic
  privileged DinD (a third, cost-free risk reduction — see
  [DecisionLog](./DecisionLog.md)'s rootless-DinD entry), which narrows one specific
  escalation path (kernel-level breakout via `--privileged`) without changing the
  network-only isolation tradeoff itself.
- **Egress from `build-daemon` is not restricted by this compose file.** Docker Compose
  has no native egress-allowlist primitive; production deployment needs an actual
  firewall/security-group rule restricting this daemon's outbound traffic to image
  registries only and denying RFC1918 ranges plus the cloud metadata IP
  `169.254.169.254` — see `docker-compose.yml`'s own comment on this.
- **Build logs are a local file per request** (`BUILD_LOG_DIR`, one file per
  `request_id`), not a full object-storage integration — a documented simplification for
  this phase, not an oversight.
- **No manual "stop early" route for a launched container** — teardown only happens via
  the TTL sweep (`src/worker.ts`); this phase's REST contract is unchanged from Phase 1.
