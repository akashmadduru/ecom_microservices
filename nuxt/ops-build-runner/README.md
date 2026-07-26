# ops-build-runner

A standalone, approval-gated build+launch API for `nuxt/ops-dashboard`'s
high-risk build feature -- a fourth, structurally separate subsystem from
that app's three existing Docker-socket-proxies. See
[`docs/apps/ops-build-runner/Feature.md`](../docs/apps/ops-build-runner/Feature.md)
and
[`docs/apps/ops-build-runner/DecisionLog.md`](../docs/apps/ops-build-runner/DecisionLog.md)
for the full design and the two explicitly-accepted residual risks.

**Phase 1: scaffold.** The 7-entry target allowlist, the approval state
machine, the REST API, the durable Postgres model, and a pluggable
Slack/console approval notifier.

**Phase 2 (this state): real orchestration.** `RealGitAncestorGuard`
(`src/git-ancestor-guard.ts`) replaces Phase 1's always-reject stub, backed by
`GitCheckoutManager` (`src/git-checkout.ts`) -- a real `git fetch` + `git
merge-base --is-ancestor` check against one persistent, scoped clone of the
monorepo. `BuildOrchestrator`/`LaunchOrchestrator`
(`src/orchestrator/`) run real `docker build`/`docker run` against an
isolated, rootless-Docker-in-Docker daemon (`docker-compose.yml`'s
`build-daemon` service) -- never this host's own daemon, never
`nuxt/ops-dashboard`'s docker-socket-proxies. `src/worker.ts` is a background
poller that drives both orchestrators, tears down TTL-expired launched
containers, and sweeps expired approval-code windows. See
[`docs/apps/ops-build-runner/DecisionLog.md`](../docs/apps/ops-build-runner/DecisionLog.md)
for the isolation posture this operates under -- network-level segmentation
only, a fresh, separate re-confirmation of the same tradeoff Phase 1 accepted,
not an inherited default. Dashboard-side integration/UI is Phase 3, not yet
built.

## Local development

```bash
npm install
cp .env.example .env   # fill in BUILD_RUNNER_TOKEN, BUILD_RUNNER_APP_DB_PASSWORD, etc.

# Start just the dedicated Postgres instance (see docker-compose.yml):
docker compose up -d build-runner-db

# Apply migrations (needs MIGRATION_DATABASE_URL -- a superuser connection):
npm run migrate

# Run the API:
npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs `src/index.ts` directly via `tsx`, with watch mode. |
| `npm run build` | Compiles `src/` to `dist/` via `tsc`. |
| `npm start` | Runs the compiled `dist/index.js`. |
| `npm run migrate` | Applies `migrations/*.sql` (via `tsx`) against `MIGRATION_DATABASE_URL`. |
| `npm run lint` | ESLint over the whole project. |
| `npm run type-check` | `tsc --noEmit`. |
| `npm test` | `vitest run`. |

## Why plain `node:http`, not Express/Fastify

See `src/http/router.ts`'s own doc comment: this API has exactly 7 routes,
all small JSON in/out, no streaming/cookies/view-rendering needs -- a
dependency-light, hand-rolled router matches this monorepo's general
preference for lean dependencies better than adding a full HTTP framework for
a surface this small.

## Data model

Two tables (`build_requests`, `audit_log`), applied via numbered,
forward-only SQL migrations under `migrations/` -- see
`src/migrate.ts`'s own doc comment for how this mirrors the "explicit,
ordered, reviewable" spirit of this repo's Python services' Alembic
migrations without pulling in Alembic itself. `audit_log`'s tamper-resistance
is enforced by Postgres role privilege (the `build_runner_app` role has no
UPDATE/DELETE grant on it), not just application-layer convention -- see
`migrations/0003_app_role_and_privileges.sql`.
