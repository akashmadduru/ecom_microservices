# Changes (ops-dashboard)

This doc covers every change set in the ops-dashboard documentation history, most
recent first. Related: [`Feature.md`](./Feature.md), [`DecisionLog.md`](./DecisionLog.md),
[`FutureWork.md`](./FutureWork.md).

---

## Change set: Phase 1 build — read-only Docker observability dashboard — 2026-07-24

New standalone project. Full feature description: [`Feature.md`](./Feature.md).
Related decisions: [`DecisionLog.md`](./DecisionLog.md).

### Summary

Built `vue/ops-dashboard/` from scratch: a Nuxt 4.5 / Nitro / dockerode application
that lists Docker containers/networks/volumes, maps containers to their Compose
service via `com.docker.compose.service`/`project` labels, aggregates health per
service, and streams live container logs over SSE. No mutating endpoints exist — the
dashboard talks only to a `tecnativa/docker-socket-proxy` sidecar (default-deny,
`CONTAINERS`/`NETWORKS`/`VOLUMES`/`INFO`/`PING` enabled, `POST=0`), never directly to
`/var/run/docker.sock`. Auth is a single static bearer token (`OPS_API_TOKEN`),
compared via SHA-256-digest + `timingSafeEqual`, failing closed (503) if unset. The
project is deliberately standalone: its own `package.json`/lockfile, not a member of
`vue/`'s npm workspace, no dependency on `vue/packages/lib` or `vue/packages/core`.

The project was originally scoped as a Python/FastAPI backend plus a 4th Vue workspace
member; this was explicitly overridden mid-project in favor of an all-Vue, fully
standalone build — see
[DecisionLog](./DecisionLog.md#stack-pivot-python-fastapi--4th-workspace-member-to-standalone-nuxtnode).

A small companion change was made outside `vue/ops-dashboard/`: `HEALTHCHECK`
directives were added to `python/services/{api_gateway,auth_service,product_service,
inventory_service}/Dockerfile`, so those four services report real Docker-level health
status for the dashboard's `/health` rollup to aggregate.

### Files changed

- `vue/ops-dashboard/package.json`, `package-lock.json` — **new.** Own manifest;
  dependencies: `dockerode`, `nuxt`, `vue` (runtime); `@nuxt/eslint`, `@types/dockerode`,
  `@types/node`, `eslint`, `vitest`, `vue-tsc` (dev).
- `vue/ops-dashboard/nuxt.config.ts` — **new.** `ssr: false` (pure SPA — no
  hydration/SSR concern for an internal tool whose token only ever lives client-side);
  `runtimeConfig` seeded from `process.env` at build time as a fallback, with the
  actual request-time values read directly from `process.env` in `server/runtime/
  config.ts` (see rationale comment in that file — a production `node
  .output/server/index.mjs` start only auto-re-reads `NUXT_`-prefixed vars, so the
  documented plain env-var names need this explicit read to actually work at runtime).
- `vue/ops-dashboard/server/runtime/{types,config,token,parse,docker-provider,
  singleton}.ts` — **new.** Read-only `RuntimeProvider` interface and its dockerode
  implementation, constant-time token comparison, config resolution, and pure
  mapping/parsing helpers.
- `vue/ops-dashboard/server/middleware/auth.ts` — **new.** Bearer-token guard for every
  `/api/*` path; fails closed (503) if `OPS_API_TOKEN` is unset. Includes a manual
  `readHeader` helper working around a runtime bug in the auto-imported
  `getRequestHeader` helper on this Nuxt/h3 version.
- `vue/ops-dashboard/server/routes/api/{ping,health}.get.ts`,
  `server/routes/api/containers/{index,[id]}.get.ts`,
  `server/routes/api/containers/[id]/logs.get.ts`,
  `server/routes/api/networks/index.get.ts`,
  `server/routes/api/volumes/index.get.ts` — **new.** Full read-only API surface.
  `logs.get.ts` hand-rolls SSE via a raw `ReadableStream`/`Response` (heartbeat every
  15s, demuxes Docker's multiplexed stdout/stderr frame format via
  `modem.demuxStream`, destroys the underlying docker stream on client disconnect or
  stream end/error) rather than using `createEventStream()`, which is broken in the
  bundled Nitro build.
- `vue/ops-dashboard/app/{app.vue, pages/*, components/*, composables/*}` — **new.**
  Nuxt SPA: `TokenGate.vue` (blocks the whole app until a token is supplied),
  `useApiToken.ts` (sessionStorage-backed token state), `useApiClient.ts` (attaches the
  bearer header to every request), `HealthBadge.vue`, `LogViewer.vue`, `DataTable.vue`,
  and the six pages listed in `Feature.md`.
- `vue/ops-dashboard/Dockerfile` — **new.** Multi-stage `node:24-slim` build; build
  context is the project directory itself (no dependency on anything outside it).
- `vue/ops-dashboard/docker-compose.ops.yml` — **new.** Batteries-included run path:
  `docker-socket-proxy` + `ops-dashboard` on a dedicated `ops_network` bridge, dashboard
  port published to `127.0.0.1` only, `OPS_API_TOKEN` required with no default
  (`${OPS_API_TOKEN:?set OPS_API_TOKEN in the environment or a .env file}`).
- `vue/ops-dashboard/README.md` — **new.** Run paths, security posture, configuration
  table, project layout.
- `vue/ops-dashboard/test/{token,docker-provider,parse}.test.ts`,
  `vitest.config.ts` — **new.** 20 tests across 3 files, covering constant-time token
  comparison, `DockerProvider`'s DTO mapping, and the pure parse helpers.
- `.github/workflows/ci-ops-dashboard.yml` — **new.** Deliberately does not use the
  shared `_reusable-node-app-ci.yml` template (that template assumes npm-workspace
  semantics this standalone project doesn't have); runs its own
  `npm ci` → lint → type-check → test → build, path-filtered to `vue/ops-dashboard/**`
  only, then a `docker` job via `_reusable-docker-build-push.yml` with the build
  context set to the project directory itself.
- `python/services/api_gateway/Dockerfile`,
  `python/services/auth_service/Dockerfile`,
  `python/services/product_service/Dockerfile`,
  `python/services/inventory_service/Dockerfile` — **`HEALTHCHECK` directive added**
  (`--interval=30s --timeout=3s --start-period=10s --retries=3`, hitting each
  service's own `/healthz`). No other lines changed. Purely additive and backward
  compatible — does not alter any service's runtime behavior.

### Breaking Changes

None. This is a wholly new, standalone component; the only change to pre-existing
files is the additive `HEALTHCHECK` directive on four Dockerfiles, which does not
change any service's behavior, port, or API contract.

### Migration Steps Required

None. No database, no schema, no existing service's configuration format changed.
Operators adopting the dashboard need only supply `OPS_API_TOKEN` (see
`vue/ops-dashboard/README.md`).

### Rollback Plan

The dashboard is fully additive and independently deployable — removing
`vue/ops-dashboard/` and `.github/workflows/ci-ops-dashboard.yml` reverts cleanly with
no effect on any other component. To roll back only the companion change, revert the
single `HEALTHCHECK` line in each of the four Python service Dockerfiles; each service
continues to run identically without it (health simply reports as "no healthcheck"
again in the dashboard's rollup).

### Verification performed

- `npm run lint`, `npm run type-check` (`nuxt typecheck` / `vue-tsc`), `npm test`
  (vitest, 20 tests across 3 files), `npm run build` — all wired into
  `ci-ops-dashboard.yml`'s `lint-test-build` job.
- A `docker` build job (via `_reusable-docker-build-push.yml`) builds the image from
  `vue/ops-dashboard/Dockerfile` with the project directory as build context.
