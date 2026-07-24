# Feature: Ops Dashboard — Phase 1 (Read-Only Docker Observability) + Phase 2 (Gated Mutations)

Last verified against: `vue/ops-dashboard/` as built (Nuxt 4.5 / Nitro / dockerode),
`.github/workflows/ci-ops-dashboard.yml`, `python/services/{api_gateway,auth_service,
product_service,inventory_service}/Dockerfile`, and, for Phase 2, `server/runtime/
{mutating-types,docker-mutating-provider,mutation-guard,singleton,config}.ts`,
`docker-compose.ops.yml`, `app/components/ContainerActions.vue`.

**Grounding:** Built. Everything described below is shipped code, not a proposal.
Phase 2 (gated stop/start/restart) shipped on top of Phase 1's read-only foundation;
this file covers both. Rebuild/remove/exec and Phase 3/4 (Kubernetes/EKS integration)
are explicitly **not** built — see Known Limitations and [`FutureWork.md`](./FutureWork.md).

Related docs: [`Changes.md`](./Changes.md) (file-level changelog),
[`DecisionLog.md`](./DecisionLog.md) (rationale for the socket-proxy trust boundary,
the Python→Node stack pivot, the Phase 2 two-proxy correction, and other structural
calls), [`FutureWork.md`](./FutureWork.md) (Phase 3/4 and other deferred items).

## Summary

A small, standalone observability dashboard for the Docker Engine this platform's
containers run on — in the user's own framing, "a replication of Docker Desktop, but
with customized features." Phase 1 shipped it **read-only**: it lists containers,
networks, and volumes; maps containers to the logical service they belong to via
Docker Compose labels; shows an aggregated health rollup per service; and streams live
container logs. Phase 2, covered in this same doc, adds a narrow, **gated, opt-in**
set of mutating actions — stop / start / restart of specific, allowlisted containers —
on top of that read-only foundation. Rebuild, remove, and exec are still deliberately
**not** implemented (rebuild in particular was evaluated and ruled out — see
[Phase 2: Gated Container Mutations](#phase-2-gated-container-mutations) below), and
there is still **no** Kubernetes/EKS integration. Both remain real, explicitly-named
future phases requiring separate approval before they're built, not oversights.

It lives at `vue/ops-dashboard/` and is deliberately **not** a member of the
`vue/` npm workspace (`vue/package.json`'s `workspaces` is `["apps/*", "packages/*"]`
— `ops-dashboard/` is intentionally outside both globs). It has its own
`package.json`/`package-lock.json` and depends on nothing in `vue/packages/lib` or
`vue/packages/core`. This is a deliberate design goal, not an integration gap — see
[DecisionLog](./DecisionLog.md#standalone-copy-outable-design).

## User-Facing Behavior

An operator opens the dashboard and is prompted for a bearer token on first load
(`app/components/TokenGate.vue`) — nothing else in the UI is reachable until a valid
token is supplied. Once past the gate:

- **`/` (index) / `/containers`** — list of all containers (running and stopped), each
  tagged with the Compose service/project it belongs to (via the
  `com.docker.compose.service` / `com.docker.compose.project` labels), or shown as
  "unmanaged" if no such labels exist.
- **`/containers/:id`** — full inspect detail for one container: image, state, exit
  code, restart count, health, networks, published ports, mounts, labels, and
  environment variable **keys only** (never values — see
  [DecisionLog](./DecisionLog.md#env-keys-only-not-values)), plus a live log tail
  (`app/components/LogViewer.vue`) streamed over Server-Sent Events.
- **`/networks`** — every Docker network, its driver/scope, IPAM subnets, and which
  containers are attached.
- **`/volumes`** — every named volume, its driver, mountpoint, and labels.
- **`/health`** — an aggregated rollup: total/running/healthy/unhealthy/starting/
  no-healthcheck container counts overall, plus the same breakdown grouped per Compose
  service (`com.docker.compose.service` × `com.docker.compose.project`).

Every screen is read-only by default: there is no button, menu, or endpoint anywhere
in the app that rebuilds or removes a container, network, or volume. **When Phase 2
mutations are enabled** (see below), the container list and detail views additionally
render a small set of Stop/Start/Restart buttons (`app/components/ContainerActions.vue`)
— but only for containers whose Compose service is on the operator-configured
allowlist; every other container's row still renders with no controls at all, exactly
as in Phase 1.

**Auth/session behavior:** the token is entered once per browser tab, held in
`sessionStorage` (never `localStorage`, never baked into the build), and attached as
`Authorization: Bearer <token>` on every `/api/*` request. Closing the tab forgets it.
If the operator never set `OPS_API_TOKEN` on the server, every API call — including the
token-check itself — fails with `503 Service Unavailable`, not a silent bypass.

## Technical Summary

- **Frontend:** Nuxt 4.5 app in `app/` — pure SPA (`ssr: false` in `nuxt.config.ts`;
  this is an internal tool, so there's no SSR/hydration concern and the token only
  ever exists client-side in `sessionStorage`). Pages: `index.vue`, `containers/
  index.vue`, `containers/[id].vue`, `networks.vue`, `volumes.vue`, `health.vue`.
  Composables: `useApiToken.ts` (session-scoped token state), `useApiClient.ts`
  (attaches the bearer header to every request). Components: `TokenGate.vue`,
  `HealthBadge.vue`, `LogViewer.vue`, `DataTable.vue`.
- **Backend:** Nitro server routes under `server/routes/api/` — `ping`, `health`,
  `containers` (list + detail), `containers/[id]/logs` (SSE), `networks`, `volumes`,
  plus the Phase 2 mutation routes (below). All read-only Docker access goes through
  `server/runtime/docker-provider.ts` (`DockerProvider implements RuntimeProvider`), a
  thin dockerode wrapper that maps raw Docker Engine payloads into narrow, stable DTOs
  (`server/runtime/types.ts`) — routers never see dockerode's own types directly.
  `server/runtime/singleton.ts` now holds **two** independent `Docker()` clients and
  providers for the process lifetime — one read-only, one mutating (Phase 2, see
  below) — never sharing a client between the two.
- **Auth:** `server/middleware/auth.ts` guards every path under `/api/*`. Token
  comparison is SHA-256-then-`timingSafeEqual` (`server/runtime/token.ts`) — see
  [DecisionLog](./DecisionLog.md#hash-before-timingsafeequal).
- **Data model changes:** none — this reads live Docker Engine API state; it owns no
  database.
- **Companion backend change (not itself a dashboard feature):** `HEALTHCHECK`
  directives were added to `python/services/{api_gateway,auth_service,product_service,
  inventory_service}/Dockerfile`. This exists specifically so the dashboard's `/health`
  aggregation has real `container.State.Health.Status` data to roll up for those four
  services — without a `HEALTHCHECK` in the image, Docker reports no health status at
  all and every container silently falls into the "no-healthcheck" bucket regardless of
  actual liveness. See [DecisionLog](./DecisionLog.md#healthcheck-directives-added-to-existing-services).

## Why it talks to a socket proxy, never the Docker socket

Access to the Docker Engine API is **host-root-equivalent**: any process that can reach
`/var/run/docker.sock` can ask the engine to launch a new, privileged container that
bind-mounts the host filesystem — at that point it can read/write anything on the host,
regardless of the calling process's own container's confinement. Mounting the socket
`:ro` does **not** fix this: `:ro` only makes the socket *file* read-only (you can't
`rm`/replace it), it does not make the Docker *API* read-only — every endpoint,
including the mutating ones, is still fully reachable through a read-only-mounted
socket.

So the dashboard's own Nitro process **never** touches `/var/run/docker.sock`. It talks
over plain TCP to a `tecnativa/docker-socket-proxy` sidecar, which is the only process
holding the real socket. The proxy is default-deny; only `CONTAINERS`, `NETWORKS`,
`VOLUMES`, and `PING` are enabled (`INFO` is deliberately left off — nothing in this
dashboard calls `GET /info`; readiness uses `PING` instead — corrected from an earlier
draft of this doc that listed `INFO` as enabled, which never matched the shipped
compose config), and `POST=0` is set explicitly, so even within the enabled sections
the mutating endpoints are not reachable. This is the mechanism that actually delivers
"read-only," not the socket mount flag. Full rationale and rejected alternatives:
[DecisionLog](./DecisionLog.md#docker-socket-proxy-not-a-direct-socket-mount).

## Phase 2: Gated Container Mutations

Phase 2 adds exactly three mutating actions — **stop, start, restart** — each scoped
to an explicit allowlist of Compose services, off by default, and fully audit-logged.
"Disable" (as originally requested) was interpreted as a synonym for **stop**, not
built as a separate mechanism: a stopped container already satisfies "disable it"
(it stays stopped until explicitly started again), and adding a distinct disable
concept would have meant a second code path enforcing the same two gates for no
functional gain.

**Rebuild was evaluated and explicitly ruled out**, not merely deferred for time. It
was the single highest-RCE-risk capability named in the original ask: rebuilding a
container requires build-context/source access, which this project deliberately does
not have (see [standalone/copy-out-able design](./DecisionLog.md#standalone-copy-outable-design))
and would mean a network-reachable path that can execute arbitrary `Dockerfile`
instructions — a fundamentally different (and much larger) trust boundary than
starting/stopping/restarting an *already-built* container. Remove and exec were never
in scope and remain unbuilt for the same reason: unbounded blast radius versus the
"manage the lifecycle of an already-existing container" scope this phase actually
targets.

### The two gates every mutation must pass

Enforced in `server/runtime/mutation-guard.ts`'s `runContainerMutation`, in this exact
order:

1. **Global kill switch** — `OPS_ALLOW_MUTATIONS` env var must be the exact string
   `"true"`. Checked **before the container is even inspected**, so a
   mutations-disabled instance never leaks which containers/services exist via a
   mutation-attempt error message. Any other value (unset, `"1"`, `"TRUE"`, `"yes"`) —
   fails closed with `403`.
2. **Per-service allowlist** — `OPS_MANAGED_SERVICES`, a comma-separated list of
   Docker Compose service names (`com.docker.compose.service` label values). A
   container with no compose label ("unmanaged"), or whose service isn't on the list,
   can never be a mutation target — rejected identically to the unmanaged case.

Both gates are re-derived from the **existing read-only inspect path**
(`getRuntimeProvider().inspectContainer()`), not trusted from client input — the
service name a mutation request is checked against is whatever the Docker Engine
itself currently reports for that container ID, not whatever the caller claims.

### Audit trail

Every mutation attempt — denied by either gate, attempted, succeeded, or errored — is
logged as one structured JSON line to stdout (`{"event":"ops.mutation",...}`), built
via a single bound `audit()` closure so all five call sites share one object shape.
There is deliberately no database or file sink — this project owns no persistence
layer, in Phase 1 or Phase 2. There is also deliberately no per-user identity field:
this project has one shared bearer token, not per-operator accounts, so the audit
record can only ever say "someone holding `OPS_API_TOKEN`" acted, not *who* — an
explicit, documented limitation (see
[FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations)), not an
oversight.

### A second, dedicated socket proxy — not a widened read-only one

Mutations are served through a **second, separate** `docker-socket-proxy-mutate`
container, reached via its own dockerode client (`getMutatingProvider()`,
`MUTATE_DOCKER_HOST`/`MUTATE_DOCKER_PORT`) — never the same client or proxy instance
used for reads (`getRuntimeProvider()`, `DOCKER_HOST`/`DOCKER_PORT`). This design was
reached only after an initial, unsafe approach was caught mid-implementation by
verifying the proxy's real config; full rationale, the rejected first design, and why
it was unsafe: [DecisionLog](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one).

### Frontend gating

`GET /api/mutations-config` exposes only the two derived values the frontend needs —
`{ allowed, managedServices }` — never the token or any other secret. `app/components/
ContainerActions.vue` renders Stop/Start/Restart buttons for a container **only when**
mutations are globally allowed **and** that specific container is compose-managed
**and** on the allowlist — mirroring the server-side gate exactly so the UI never
shows a button that would just 403. When mutations are globally disabled the controls
are **absent**, not merely disabled/greyed-out, so the UI never implies a capability
that isn't actually there. Every action requires an additional native `confirm()`
before the request fires.

## Impacted Files

New project tree, `vue/ops-dashboard/` (see the README's "Project layout" section for
the full annotated tree). Outside that directory: `.github/workflows/
ci-ops-dashboard.yml` (new), `python/services/{api_gateway,auth_service,
product_service,inventory_service}/Dockerfile` (`HEALTHCHECK` line added to each, no
other changes). Full file-level table, both phases: [`Changes.md`](./Changes.md).

## Configuration / Feature Flags

No feature flags in Phase 1's sense (on/off toggles for optional UI), though Phase 2's
mutation gates function as one. All environment variables are read directly from
`process.env` at request time (`server/runtime/config.ts`), not just Nuxt's build-time
`runtimeConfig`, so the documented names work correctly even for a plain `node
.output/server/index.mjs` production start:

| Env var | Required | Default | Meaning |
|---|---|---|---|
| `OPS_API_TOKEN` | Yes | none — fails closed (503) if unset | Operator bearer token for all `/api/*` routes. |
| `DOCKER_HOST` | No | `docker-socket-proxy` | Hostname of the read-only socket proxy. |
| `DOCKER_PORT` | No | `2375` | TCP port of the read-only socket proxy. |
| `MUTATE_DOCKER_HOST` | No | `docker-socket-proxy-mutate` | Hostname of the **separate** mutate-only socket proxy (Phase 2). |
| `MUTATE_DOCKER_PORT` | No | `2375` | TCP port of the mutate-only socket proxy. |
| `OPS_ALLOW_MUTATIONS` | No | `false`-equivalent (any value other than exactly `"true"`) | Phase 2 global kill switch. |
| `OPS_MANAGED_SERVICES` | No | empty (nothing mutable) | Phase 2 comma-separated Compose service allowlist. |

Compose-only proxy toggles (not read by the app itself, only by
`docker-socket-proxy-mutate` in `docker-compose.ops.yml`): `OPS_PROXY_POST`,
`OPS_PROXY_ALLOW_START`, `OPS_PROXY_ALLOW_STOP`, `OPS_PROXY_ALLOW_RESTARTS` — all
default to `0`. Enabling mutations end to end requires setting all four of these
**and** `OPS_ALLOW_MUTATIONS=true` **and** a non-empty `OPS_MANAGED_SERVICES`; missing
any one of the seven leaves mutations off.

## Rollout Plan

Two supported run paths, both documented in `vue/ops-dashboard/README.md`:

1. **Bring your own proxy** — operator runs a `docker-socket-proxy` container
   themselves (example command in the README) and starts the dashboard with `npm
   install && npm run build && npm start`, pointed at it via `DOCKER_HOST`/`DOCKER_PORT`.
   Adding Phase 2 mutations this way means standing up a **second**, separately
   configured proxy instance and pointing `MUTATE_DOCKER_HOST`/`MUTATE_DOCKER_PORT` at
   it — the README is explicit that this second proxy must never be the same instance
   as the read-only one.
2. **Batteries included** — `docker compose -f docker-compose.ops.yml up --build` from
   `vue/ops-dashboard/`, which now brings up **three** containers on the dedicated
   `ops_network` bridge (never the platform's `ecom_network`): the read-only
   `docker-socket-proxy`, the new `docker-socket-proxy-mutate`, and the dashboard
   itself — with the dashboard's port published to `127.0.0.1` only. Mutations stay
   off by default even with this compose file (`OPS_ALLOW_MUTATIONS` and the four
   `OPS_PROXY_*` toggles all default to disabled); an operator must explicitly opt in.

`OPS_API_TOKEN` must be supplied by the operator in both paths — there is no default
and no compose-baked value. No database migrations, no cross-service coordination, and
no changes to `docker-compose.yml` (the platform's main compose file) are required;
`docker-compose.ops.yml` is a separate, additive compose project. The `HEALTHCHECK`
additions to the four Python service Dockerfiles are backward compatible — a
`HEALTHCHECK` directive only adds Docker-level health reporting, it does not change
any service's runtime behavior, port, or API surface. Phase 2's addition is also
backward compatible: an operator who upgrades and does nothing gets the read-only
Phase 1 behavior exactly as before, plus one extra idle proxy container in the
batteries-included path.

## Known Limitations

Full detail and status in [`FutureWork.md`](./FutureWork.md):

- **No rebuild, remove, or exec capability.** Rebuild in particular was evaluated and
  explicitly ruled out (not just deferred) as the single highest-RCE-risk capability
  named in the original ask — it would require build-context/source access this
  standalone project deliberately doesn't have. Stop/start/restart are the full extent
  of Phase 2's mutating surface. See [Phase 2: Gated Container Mutations](#phase-2-gated-container-mutations).
- **No Kubernetes/EKS integration.** This dashboard talks to one Docker Engine only.
  Deferred to Phase 3/4 — also blocked on the fact that this repo's `terraform/` EKS
  setup is currently a bare VPC+EKS skeleton with no real cluster provisioned yet.
- **Single static bearer token, no per-user identity.** Anyone holding the token has
  the same access as anyone else, for both reads (Phase 1) and now mutations
  (Phase 2); there's no way to distinguish *who* stopped/started/restarted a
  container beyond "someone with the token" — the Phase 2 audit log records the
  action, not the actor. Accepted for this phase; would need a real identity layer to
  improve.
- **The mutate-only proxy has no per-container ACL** — it restricts which *verbs*
  (start/stop/restart/kill) are reachable, not which *container IDs* they can target;
  `OPS_MANAGED_SERVICES` is enforced entirely at the app layer, not the proxy layer.
  This is an accepted residual risk, not a bug — full detail in
  [FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations) and
  [DecisionLog](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one).
- **A handful of Nuxt 4.5/h3-v2 framework helpers (`getRequestHeader`, `getQuery`,
  `createEventStream().send()`) had runtime bugs in the bundled version** and were
  worked around with manual equivalents (`server/middleware/auth.ts`'s `readHeader`,
  `server/routes/api/containers/[id]/logs.get.ts`'s `readQuery` and hand-rolled SSE via
  a raw `ReadableStream`/`Response`). These are workarounds for an apparent framework
  bug, not the intended long-term implementation — see
  [DecisionLog](./DecisionLog.md#manual-workarounds-for-nuxt-h3-runtime-bugs).
- **Container detail's environment section shows key names only, never values** — by
  design (values routinely contain secrets), not a gap to fill in later.
