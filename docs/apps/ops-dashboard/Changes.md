# Changes (ops-dashboard)

This doc covers every change set in the ops-dashboard documentation history, most
recent first. Related: [`Feature.md`](./Feature.md), [`DecisionLog.md`](./DecisionLog.md),
[`FutureWork.md`](./FutureWork.md).

---

## Change set: Phase 3 build — generic read-only Kubernetes backend — 2026-07-24

Built on top of Phase 1 + Phase 2 ([`Changes.md`](#change-set-phase-2-build--gated-container-mutations-stopstartrestart--2026-07-24)).
Full feature description: [`Feature.md`](./Feature.md#phase-3-generic-read-only-kubernetes-backend).
Related decisions: [`DecisionLog.md`](./DecisionLog.md).

### Summary

Added a second, alternative, strictly **read-only** backend: the dashboard can observe
a Kubernetes cluster instead of the Docker Engine, selected at process start via
`RUNTIME_MODE=kubernetes` (`docker` remains the default, byte-identical to before).
Implemented as `KubernetesProvider`, implementing the **same, unmodified**
`RuntimeProvider` interface `DockerProvider` implements — no route or frontend code
changed to add this backend, which is exactly the payoff of that interface's
Phase-1 design. Built on `@kubernetes/client-node`'s standard ambient kubeconfig
resolution, deliberately generic rather than EKS-specific (no AWS SDK, no IAM code) —
it works against any conformant cluster, EKS included, once the operator has pointed
their own kubeconfig at it.

Kubernetes mode carries no mutating surface: the Phase 2 stop/start/restart routes
return `501 Not Implemented` when `RUNTIME_MODE=kubernetes`, checked first in
`runContainerMutation` (before any inspect or provider construction) and independently
re-enforced in `getMutatingProvider()`. Pods/Services/PersistentVolumeClaims are
mapped onto the existing `ContainerSummary`/`NetworkSummary`/`VolumeSummary` DTOs as
documented approximations (see `Feature.md`); a pod id is encoded as
`namespace_podname` (`_` cannot appear in a DNS-1123 name, so it round-trips
unambiguously and survives the existing id-character allowlist). The shared logs route
branches only on whether to demux (Docker) or pipe straight through (Kubernetes,
already-merged plain text).

**This entire phase was built and shipped without ever running against a real
Kubernetes cluster** — no kubeconfig, no kind/minikube, no live API server anywhere in
the build environment. An explicit, informed decision (see
[DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster)),
verified only via hand-written mocks of `@kubernetes/client-node`'s published
types/docs — the single most important caveat about this change set.

A sample read-only `ClusterRole`/`ClusterRoleBinding` manifest is provided at
`k8s/ops-dashboard-readonly-rbac.yaml` as **guidance**, not enforcement: unlike
Docker mode's socket-proxy (an enforcement layer this app controls), Kubernetes RBAC
is enforced entirely by the cluster, outside this app's control — see
[DecisionLog](./DecisionLog.md#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode).

### Files changed

- `vue/ops-dashboard/server/runtime/kubernetes-provider.ts` — **new.**
  `KubernetesProvider implements RuntimeProvider`, backed by `@kubernetes/client-node`'s
  `CoreV1Api`/`Log`/`VersionApi`. Maps pods to containers, services to networks, PVCs
  to volumes; `streamLogs` bridges the client library's callback-based `Log.log()` into
  the `Promise<ReadableStream>` shape the interface requires via a `PassThrough`,
  aborting the underlying request when the consumer destroys the stream.
- `vue/ops-dashboard/server/runtime/k8s-parse.ts` — **new.** Pure Kubernetes → DTO
  mapping helpers, mirroring the existing `parse.ts` split from `docker-provider.ts`:
  `encodePodId`/`decodePodId` (id round-trip; `decodePodId` throws a real h3 400 on a
  malformed id — see Review outcomes below), `derivePodHealth` (pod phase + `Ready`
  condition + container waiting/terminated reasons → the shared `HealthState`),
  `resolvePodService` (owner-reference chain, falling back to
  `app.kubernetes.io/name`/`app` labels, for the Compose-service analog), `podIps`,
  `k8sTimestampToIso`, `deploymentNameFromReplicaSet`.
- `vue/ops-dashboard/server/runtime/health-aggregate.ts` — **new.** `aggregateHealth`/
  `tallyHealth`, extracted from what was ~60 lines duplicated verbatim between
  `DockerProvider.getHealth()` and the new `KubernetesProvider.getHealth()` — a code
  review finding (see below); both providers now call this shared function, which
  operates purely on the `ContainerSummary` DTO both already normalize to.
- `vue/ops-dashboard/server/runtime/config.ts` — **updated.** Added `runtimeMode`
  (parsed from `RUNTIME_MODE`; only the exact string `"kubernetes"` selects it, every
  other value resolves to `docker`) and `k8sNamespace` (from `K8S_NAMESPACE`, empty =
  all namespaces). Header comment updated to list the new vars.
- `vue/ops-dashboard/server/runtime/singleton.ts` — **updated.** `getRuntimeProvider()`
  now selects between the existing `DockerProvider` and a lazily-constructed
  `KubernetesProvider` (built from `KubeConfig.loadFromDefault()`) based on
  `runtimeMode`. `getMutatingProvider()` now throws if called in kubernetes mode
  (defense in depth alongside the guard-level check in `mutation-guard.ts`) rather than
  ever handing back a Docker-shaped mutating provider.
- `vue/ops-dashboard/server/runtime/mutation-guard.ts` — **updated.**
  `runContainerMutation` now checks `runtimeMode === 'kubernetes'` first, before any
  inspect call or provider construction, and throws `501 Not Implemented` if so.
- `vue/ops-dashboard/server/runtime/container-request.ts` — **updated.**
  `translateDockerNotFound` now checks both dockerode's `.statusCode` property and
  `@kubernetes/client-node`'s `ApiException`'s `.code` property for a 404 — a security
  review finding, fixed (see below): previously a real "pod not found" fell through as
  a generic rethrown error instead of a proper 404.
- `vue/ops-dashboard/server/routes/api/containers/[id]/logs.get.ts` — **updated.**
  Branches on `runtimeMode`: kubernetes mode pipes the log stream straight into the SSE
  sink with no demuxing (pod logs are already plain text with stdout/stderr merged by
  the API server); docker mode still demuxes via `modem.demuxStream`, unchanged. The
  local variable that used to hold only a Docker stream was renamed from `dockerStream`
  to `logStream` and its docstring updated to describe both branches — a code review
  finding, fixed.
- `vue/ops-dashboard/k8s/ops-dashboard-readonly-rbac.yaml` — **new.** Sample
  `ClusterRole`/`ClusterRoleBinding`, guidance only, granting exactly `get`/`list` on
  `pods`/`services`/`persistentvolumeclaims` plus `get` on `pods/log` — matched to what
  the provider actually calls. A security review finding was fixed here: the manifest
  originally also granted `namespaces` get/list and the `watch` verb and `pods/log:list`,
  none of which the code uses; tightened to match exactly.
- `vue/ops-dashboard/README.md` — **updated.** New "Phase 3: generic Kubernetes mode"
  section: namespace scope, the Docker-concept mapping table, health-derivation rules,
  and the RBAC guidance-not-enforcement callout. Configuration table and project-layout
  tree updated with the new files/vars.
- `vue/ops-dashboard/.env.example` — **updated.** Documents `RUNTIME_MODE` and
  `K8S_NAMESPACE`, both defaulted to the pre-Phase-3 behavior (`docker`, all
  namespaces).
- `vue/ops-dashboard/package.json` — **updated.** Added `@kubernetes/client-node`
  (`^1.4.0`) as a dependency.
- `vue/ops-dashboard/test/{kubernetes-provider,k8s-parse,k8s-mutation-mode}.test.ts`
  — **new.** Cover `KubernetesProvider`'s DTO mapping, the pure `k8s-parse.ts` helpers
  (id encode/decode including the malformed-id 400 path, health derivation, service
  resolution), and the parametrized stop/start/restart-returns-501-in-kubernetes-mode
  behavior. All exercised against hand-written mocks of `@kubernetes/client-node` —
  never a real cluster (see Summary above). Test suite grew from 114 (end of Phase 2)
  to 116, all passing (Phase 3 added ~40 tests across these three files before the
  review-fix pass; two more were added during the fix pass for the `.code`/400 fixes
  and the parametrized mutation-mode test).

### Breaking Changes

None. `RUNTIME_MODE` defaults to `docker`; an operator who sets nothing gets exactly
the pre-Phase-3 behavior. Kubernetes mode is entirely additive and requires explicit
opt-in (`RUNTIME_MODE=kubernetes` plus a working kubeconfig).

### Migration Steps Required

None to stay on Docker. To run in Kubernetes mode: set `RUNTIME_MODE=kubernetes`,
point `KUBECONFIG` (or `~/.kube/config`) at an identity bound to a read-only role
(apply `k8s/ops-dashboard-readonly-rbac.yaml` or an equivalent Role/RoleBinding first),
and optionally set `K8S_NAMESPACE` to scope to one namespace. See
`vue/ops-dashboard/README.md`'s "Phase 3: generic Kubernetes mode" section.

### Rollback Plan

Unset `RUNTIME_MODE` (or set it to anything other than exactly `"kubernetes"`) to
revert to Docker mode instantly, without redeploying — the mode check happens on every
request via `getOpsConfig()`, not at process start only. To fully remove the Phase 3
surface, revert this change set; `k8s/ops-dashboard-readonly-rbac.yaml` has no
consumer inside the app and can simply be deleted from the cluster independently.

### Verification performed

- `npm run lint`, `npm run type-check`, `npm test` (vitest, grew from 114 to 116
  tests), `npm run build` — all green.
- **No live-cluster verification was performed or possible in this environment** — see
  the Summary above and
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster).
  All Kubernetes-path testing is against hand-written mocks of
  `@kubernetes/client-node`'s published API surface.
- **Security review:** no blockers. Verified airtight: no mutation path reachable in
  kubernetes mode; the id-character allowlist boundary (`assertValidContainerId`)
  protects both backends identically; no credential/kubeconfig leakage in logs or
  error paths; supply chain clean (`@kubernetes/client-node` is the official package).
  Two low findings, both fixed: the sample RBAC manifest granted `namespaces`/`watch`/
  `pods/log:list` the code never uses (tightened to match exactly); malformed pod ids
  were surfacing as a generic 500 instead of a 400 (`decodePodId` now throws a real h3
  400, consistent with `assertValidContainerId`'s existing behavior for the Docker
  path).
- **Also found and fixed independently** (by the orchestrating session, prompted by
  the Phase 3 implementer's own self-reported gap): `translateDockerNotFound` only
  checked a `.statusCode` property (dockerode's shape) — `@kubernetes/client-node`'s
  `ApiException` reports HTTP status via `.code` instead, so a real "pod not found" was
  falling through as a generic rethrown error rather than a proper 404. Fixed by
  checking both properties.
- **Code review:** approve with comments, no blockers. One notable finding, fixed:
  `getHealth()`/`tallyHealth()` aggregation logic was ~60 lines duplicated verbatim
  between `DockerProvider` and `KubernetesProvider` (the original "keeps the working
  Docker path byte-identical" justification didn't actually hold, since the logic
  operates purely on the shared `ContainerSummary` DTO) — extracted to
  `server/runtime/health-aggregate.ts`, consumed by both. Also fixed: a variable named
  `dockerStream` in the shared logs route that actually held either backend's stream
  (renamed to `logStream`, docstring updated); a comment clarifying that
  `KubernetesProvider.mapService` reuses `encodePodId` only as a convenient
  never-empty fallback id generator for Services, never as a real pod-id round-trip.
- **Bundle-size note:** the client-side SPA bundle stayed ~308KB (unaffected —
  `@kubernetes/client-node` is server-only); the Nitro server bundle grew from ~4.5MB
  to ~20.7MB pulling in the new dependency — expected and inconsequential for a
  server-side Node process.

---

## Change set: Phase 2 build — gated container mutations (stop/start/restart) — 2026-07-24

Built on top of Phase 1 ([`Changes.md`](#change-set-phase-1-build--read-only-docker-observability-dashboard--2026-07-24)).
Full feature description: [`Feature.md`](./Feature.md#phase-2-gated-container-mutations).
Related decisions: [`DecisionLog.md`](./DecisionLog.md).

### Summary

Added a narrow, opt-in mutating surface — stop / start / restart of individual
containers — gated behind two independent, fail-closed conditions: a global kill
switch (`OPS_ALLOW_MUTATIONS` must be exactly `"true"`) and a per-service allowlist
(`OPS_MANAGED_SERVICES`, matched against the `com.docker.compose.service` label).
Rebuild was evaluated and explicitly ruled out as out of scope (highest RCE risk,
requires build-context/source access this project deliberately doesn't have); remove
and exec were never in scope. "Disable" was implemented as a synonym for stop, not a
separate mechanism. Every mutation attempt — denied, attempted, succeeded, or errored
— is written as a structured JSON audit line to stdout; there is no database/file sink
and no per-user identity field, since auth is still a single shared bearer token.

Mutations are served through a **second, dedicated** `docker-socket-proxy-mutate`
container and a **second, separate** dockerode client on the app side — not by
widening the existing read-only proxy. This was a mid-implementation correction: the
first design (add `POST=1` plus the image's `ALLOW_START`/`ALLOW_STOP`/
`ALLOW_RESTARTS` toggles to the *existing* read-only proxy) was caught as unsafe by
reading the proxy's real `haproxy.cfg` before shipping it — see
[DecisionLog](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one)
for the full story.

### Files changed

- `vue/ops-dashboard/server/runtime/mutating-types.ts` — **new.** `MutatingRuntimeProvider`
  interface (`stopContainer`/`startContainer`/`restartContainer`), deliberately
  separate from the read-only `RuntimeProvider` (`types.ts`), which carries an
  explicit "never add mutating methods here" comment.
- `vue/ops-dashboard/server/runtime/docker-mutating-provider.ts` — **new.**
  `DockerMutatingProvider implements MutatingRuntimeProvider`, a thin dockerode
  wrapper (`getContainer(id).stop()/.start()/.restart()`) using its own dockerode
  client, never the read-only `DockerProvider`'s client.
- `vue/ops-dashboard/server/runtime/mutation-guard.ts` — **new.** `runContainerMutation`
  orchestrator: checks the global kill switch first (before any inspect call), then
  resolves the container's compose service via the existing read-only inspect path
  and checks it against the allowlist, then invokes the mutating provider. Every
  branch (denied/attempt/success/error) logs one audit line via a single bound
  `audit()` closure (refactored during code review from 5 duplicated call sites — see
  Review outcomes below).
- `vue/ops-dashboard/server/runtime/container-request.ts` — **new.** Extracted shared
  helpers used by both read and mutation routes: `assertValidContainerId` (validates
  the `id` route param against a strict hex/name pattern before it ever reaches
  dockerode's unescaped path-concatenation, closing an injection surface that matters
  more once mutating endpoints exist) and `translateDockerNotFound` (maps dockerode's
  404 to h3's `createError`).
- `vue/ops-dashboard/server/runtime/singleton.ts` — **updated.** Now holds **two**
  independent `Docker()` clients and providers (`getDockerClient`/`getRuntimeProvider`
  for reads, `getMutatingDockerClient`/`getMutatingProvider` for mutations), never
  sharing a client across the two. Header comment updated — it previously said "one
  shared client," which became stale the moment the second client was added (code
  review finding, fixed before merge).
- `vue/ops-dashboard/server/runtime/config.ts` — **updated.** Added
  `mutateDockerHost`/`mutateDockerPort` (separate proxy target),
  `mutationsAllowed` (strict `=== "true"` check on `OPS_ALLOW_MUTATIONS`), and
  `managedServices` (parsed from `OPS_MANAGED_SERVICES`). Header comment updated to
  list the new env vars (code review finding — it previously only described the
  Phase 1 vars).
- `vue/ops-dashboard/server/routes/api/containers/[id]/{stop,start,restart}.post.ts`
  — **new.** Each validates the id then delegates entirely to
  `runContainerMutation('stop'|'start'|'restart', id)`.
- `vue/ops-dashboard/server/routes/api/mutations-config.get.ts` — **new.** Returns
  `{ allowed, managedServices }` so the frontend can decide whether to render
  mutation controls at all, rather than discovering the feature is disabled only by
  attempting an action and getting a 403. Still behind the bearer-auth middleware;
  never returns the token or any other secret.
- `vue/ops-dashboard/app/components/ContainerActions.vue` — **new.** Renders
  Stop/Start/Restart buttons only when `/api/mutations-config` reports mutations
  allowed **and** the specific container is compose-managed **and** on the returned
  allowlist. A native `confirm()` guards every action. Controls are absent (not
  disabled) when mutations are off, so the UI never implies a capability that isn't
  there.
- `vue/ops-dashboard/docker-compose.ops.yml` — **updated.** Added the
  `docker-socket-proxy-mutate` service (pinned `tecnativa/docker-socket-proxy:v0.4.2`,
  `CONTAINERS=0`, only `ALLOW_START`/`ALLOW_STOP`/`ALLOW_RESTARTS` + `POST` toggleable
  via `OPS_PROXY_*` vars, all defaulting to `0`); added `MUTATE_DOCKER_HOST`/
  `MUTATE_DOCKER_PORT`/`OPS_ALLOW_MUTATIONS`/`OPS_MANAGED_SERVICES` to the
  `ops-dashboard` service's environment (all defaulting to the disabled state); the
  existing read-only `docker-socket-proxy` service's image tag was also pinned from
  an implicit `:latest` to the explicit `v0.4.2` (security review finding — the
  least-privilege argument for both proxies depends on that exact image's ACL
  behavior).
- `vue/ops-dashboard/.env.example` — **updated.** Documents the five new env vars
  (`MUTATE_DOCKER_HOST`, `MUTATE_DOCKER_PORT`, `OPS_ALLOW_MUTATIONS`,
  `OPS_MANAGED_SERVICES`, plus the four compose-only `OPS_PROXY_*` toggles), all
  defaulted to the disabled state.
- `vue/ops-dashboard/README.md` — **updated.** New "Phase 2: gated container
  controls" section documenting both gates, the audit trail, and — in detail — why
  mutations run through a second dedicated proxy rather than a widened read-only one.
  Also fixed a pre-existing contradiction (code review finding): the prose claimed
  `INFO=1` was enabled on the read-only proxy while the compose file explicitly left
  it disabled; prose corrected to match the shipped config.
- `vue/ops-dashboard/test/{docker-mutating-provider,mutation-route,container-request,
  auth-middleware,log-stream-limiter}.test.ts` — **new** (the first two) and
  supporting/expanded coverage added alongside them. Test suite grew from 65 (end of
  Phase 1) to 77 tests, all passing.

### Breaking Changes

None. Every new env var defaults to the disabled/safe state; an operator who
redeploys the dashboard without setting any of the Phase 2 vars gets Phase 1's
read-only behavior exactly as before, plus one additional (idle, unreachable-from-
outside-`ops_network`) proxy container in the batteries-included compose path.

### Migration Steps Required

None required to stay read-only. To opt into mutations: set `OPS_ALLOW_MUTATIONS=true`
and a non-empty `OPS_MANAGED_SERVICES` on the dashboard service, **and** (batteries-
included path) set `OPS_PROXY_POST=1`, `OPS_PROXY_ALLOW_START=1`,
`OPS_PROXY_ALLOW_STOP=1`, `OPS_PROXY_ALLOW_RESTARTS=1` on `docker-socket-proxy-mutate`
— all seven must be set together, or mutations stay off. See
`vue/ops-dashboard/README.md`'s "Phase 2: gated container controls" section.

### Rollback Plan

Unset `OPS_ALLOW_MUTATIONS` (or set it to anything other than `"true"`) to disable
mutations instantly without redeploying — the app-layer gate is checked first, before
any Docker call. To fully remove the Phase 2 surface, revert this change set;
`docker-socket-proxy-mutate` can also simply be stopped/removed independently of the
dashboard and the read-only proxy, since it is a separate compose service with no
other consumer.

### Verification performed

- `npm run lint`, `npm run type-check`, `npm test` (vitest, grew from 65 to 77 tests),
  `npm run build` — all green.
- `docker compose -f docker-compose.ops.yml config` verified clean in both the
  default (mutations-disabled) and mutations-enabled states.
- **Security review:** no blockers. One medium finding (the mutate-proxy's lack of
  per-container ACL — the allowlist is app-layer only; documented, not fixed, as an
  accepted residual risk — see [FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations)),
  one low finding (proxy images pinned from implicit `:latest` to `v0.4.2` — fixed),
  two informational (`ALLOW_RESTARTS` also covers `kill`, noted in compose comments;
  a benign TOCTOU between the read-only proxy's inspect call and the mutate proxy's
  action call, judged non-exploitable since compose labels are immutable and
  container IDs aren't recycled).
- **Code review:** approved with comments, no blockers. One Major (audit-log
  construction duplicated across 5 call sites in `mutation-guard.ts` — refactored to
  a single bound `audit()` closure — fixed), plus stale-comment/doc fixes: `singleton.ts`'s
  header comment ("one shared client") and `config.ts`'s header comment (missing the
  new env vars) updated to match the post-Phase-2 code; a real prose/config
  contradiction in `README.md` about `INFO=1` corrected.

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
