# Feature: Ops Dashboard — Phase 1 (Read-Only Docker Observability)

Last verified against: `vue/ops-dashboard/` as built (Nuxt 4.5 / Nitro / dockerode),
`.github/workflows/ci-ops-dashboard.yml`, `python/services/{api_gateway,auth_service,
product_service,inventory_service}/Dockerfile`.

**Grounding:** Built. Everything described below is shipped code, not a proposal.
Phase 2 (mutating controls) and Phase 3/4 (Kubernetes/EKS integration) are explicitly
**not** built — see Known Limitations and
[`FutureWork.md`](./FutureWork.md).

Related docs: [`Changes.md`](./Changes.md) (file-level changelog),
[`DecisionLog.md`](./DecisionLog.md) (rationale for the socket-proxy trust boundary,
the Python→Node stack pivot, and other structural calls), [`FutureWork.md`](./FutureWork.md)
(Phase 2/3/4 and other deferred items).

## Summary

A small, standalone, **read-only** observability dashboard for the Docker Engine this
platform's containers run on — in the user's own framing, "a replication of Docker
Desktop, but with customized features." It lists containers, networks, and volumes;
maps containers to the logical service they belong to via Docker Compose labels;
shows an aggregated health rollup per service; and streams live container logs. There
are deliberately **no** mutating actions (no stop/restart/rebuild/remove/disable of
anything) and **no** Kubernetes/EKS integration in this phase — both are real,
explicitly-named future phases requiring separate approval before they're built, not
oversights.

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

Every screen is read-only: there is no button, menu, or endpoint anywhere in the app
that stops, restarts, rebuilds, or removes a container, network, or volume.

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
  `containers` (list + detail), `containers/[id]/logs` (SSE), `networks`, `volumes`.
  All Docker access goes through `server/runtime/docker-provider.ts`
  (`DockerProvider implements RuntimeProvider`), a thin dockerode wrapper that maps raw
  Docker Engine payloads into narrow, stable DTOs (`server/runtime/types.ts`) — routers
  never see dockerode's own types directly. `server/runtime/singleton.ts` holds the one
  shared `Docker()` client + provider instance for the process lifetime.
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
`VOLUMES`, `INFO`, and `PING` are enabled, and `POST=0` is set explicitly, so even
within the enabled sections the mutating endpoints are not reachable. This is the
mechanism that actually delivers "read-only," not the socket mount flag. Full rationale
and rejected alternatives: [DecisionLog](./DecisionLog.md#docker-socket-proxy-not-a-direct-socket-mount).

## Impacted Files

New project tree, `vue/ops-dashboard/` (see the README's "Project layout" section for
the full annotated tree). Outside that directory: `.github/workflows/
ci-ops-dashboard.yml` (new), `python/services/{api_gateway,auth_service,
product_service,inventory_service}/Dockerfile` (`HEALTHCHECK` line added to each, no
other changes). Full file-level table: [`Changes.md`](./Changes.md).

## Configuration / Feature Flags

No feature flags. Three environment variables, all read directly from `process.env` at
request time (`server/runtime/config.ts`), not just Nuxt's build-time `runtimeConfig`,
so the documented names work correctly even for a plain `node .output/server/index.mjs`
production start:

| Env var | Required | Default | Meaning |
|---|---|---|---|
| `OPS_API_TOKEN` | Yes | none — fails closed (503) if unset | Operator bearer token for all `/api/*` routes. |
| `DOCKER_HOST` | No | `docker-socket-proxy` | Hostname of the read-only socket proxy. |
| `DOCKER_PORT` | No | `2375` | TCP port of the socket proxy. |

## Rollout Plan

Two supported run paths, both documented in `vue/ops-dashboard/README.md`:

1. **Bring your own proxy** — operator runs a `docker-socket-proxy` container
   themselves (example command in the README) and starts the dashboard with `npm
   install && npm run build && npm start`, pointed at it via `DOCKER_HOST`/`DOCKER_PORT`.
2. **Batteries included** — `docker compose -f docker-compose.ops.yml up --build` from
   `vue/ops-dashboard/`, which brings up both the proxy and the dashboard together on a
   dedicated `ops_network` bridge (never the platform's `ecom_network`), with the
   dashboard's port published to `127.0.0.1` only.

`OPS_API_TOKEN` must be supplied by the operator in both paths — there is no default
and no compose-baked value. No database migrations, no cross-service coordination, and
no changes to `docker-compose.yml` (the platform's main compose file) are required;
`docker-compose.ops.yml` is a separate, additive compose project. The `HEALTHCHECK`
additions to the four Python service Dockerfiles are backward compatible — a
`HEALTHCHECK` directive only adds Docker-level health reporting, it does not change
any service's runtime behavior, port, or API surface.

## Known Limitations

Full detail and status in [`FutureWork.md`](./FutureWork.md):

- **No mutating actions of any kind** — no stop/restart/rebuild/remove/disable, by
  design, not because dockerode/the API can't do it. The socket proxy's `POST=0`
  makes this a structural guarantee, not just a UI omission. Deferred to Phase 2,
  pending separate approval, scoped to an allowlist of repo-known services.
- **No Kubernetes/EKS integration.** This dashboard talks to one Docker Engine only.
  Deferred to Phase 3/4 — also blocked on the fact that this repo's `terraform/` EKS
  setup is currently a bare VPC+EKS skeleton with no real cluster provisioned yet.
- **Single static bearer token, no per-user identity or audit trail.** Anyone holding
  the token has the same (read-only) access as anyone else; there's no way to
  distinguish who looked at what. Acceptable for Phase 1's read-only scope; would need
  revisiting before any Phase 2 mutating action ships.
- **A handful of Nuxt 4.5/h3-v2 framework helpers (`getRequestHeader`, `getQuery`,
  `createEventStream().send()`) had runtime bugs in the bundled version** and were
  worked around with manual equivalents (`server/middleware/auth.ts`'s `readHeader`,
  `server/routes/api/containers/[id]/logs.get.ts`'s `readQuery` and hand-rolled SSE via
  a raw `ReadableStream`/`Response`). These are workarounds for an apparent framework
  bug, not the intended long-term implementation — see
  [DecisionLog](./DecisionLog.md#manual-workarounds-for-nuxt-h3-runtime-bugs).
- **Container detail's environment section shows key names only, never values** — by
  design (values routinely contain secrets), not a gap to fill in later.
