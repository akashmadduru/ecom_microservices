# Ops Dashboard

A small, **standalone, read-only** observability dashboard for local Docker
containers — containers, networks, volumes, an aggregated health summary, and
live (streaming) container logs.

Phase 1 is **read-only**. Phase 2 adds **opt-in, allowlist-gated** stop / start
/ restart controls that are **disabled by default** and off unless explicitly
enabled at both the app and proxy layers (see "Phase 2: gated container
controls" below). There is still no rebuild/remove/exec capability and no
Kubernetes/EKS integration.

It is deliberately self-contained: its own `package.json` / `package-lock.json`
/ `node_modules`, no dependency on the surrounding monorepo. You can copy the
`ops-dashboard/` directory into any other repo and it still works unchanged.

## Why it talks to a socket proxy, never to the Docker socket

Access to the Docker Engine API is **host-root-equivalent**: any process that
can reach the socket can launch a privileged container that mounts the host
filesystem. Mounting `/var/run/docker.sock` as `:ro` does **not** fix this — it
only makes the socket *file* read-only, not the Docker *API*.

So this dashboard **never** touches `/var/run/docker.sock`. It talks over TCP to
a [`tecnativa/docker-socket-proxy`](https://github.com/Tecnativa/docker-socket-proxy)
sidecar, which holds the real socket and allowlists only read-style API calls.
The proxy is default-deny; we enable only `CONTAINERS`, `NETWORKS`, `VOLUMES`,
and `PING` (`INFO` is deliberately left off — nothing in this dashboard calls
it) and leave `POST` denied, so mutating endpoints are simply not reachable
through it.

Phase 2 (below) adds a **second, separate** proxy dedicated to mutations —
this one stays read-only, full stop.

## Authentication

Every `/api/*` request requires a static bearer token, checked with a
constant-time comparison. Set it via the **`OPS_API_TOKEN`** environment
variable. **If it is unset, the API fails closed (HTTP 503)** — there is no
default and no bypass.

```bash
# generate a token
openssl rand -hex 32
```

On first load the UI prompts you to paste the token; it is kept in the tab's
`sessionStorage` only (never `localStorage`, never build-baked) and sent as
`Authorization: Bearer <token>` on every request.

This is a separate, minimal trust domain — it shares nothing with the platform's
`auth_service` / JWT system.

## Phase 2: gated container controls (stop / start / restart)

Disabled by default. When enabled, the UI shows Stop/Start/Restart buttons for
eligible containers, and `POST /api/containers/{id}/(stop|start|restart)` become
available. Every mutation must pass **two independent gates** (both enforced
server-side, on top of the bearer token):

1. **Global kill switch** — `OPS_ALLOW_MUTATIONS` must equal exactly `"true"`.
   Anything else (unset, `1`, `TRUE`) → every mutating endpoint returns `403`
   without even inspecting the container.
2. **Per-service allowlist** — the container's compose service
   (`com.docker.compose.service` label) must be listed in
   `OPS_MANAGED_SERVICES` (comma-separated). Unmanaged containers (no compose
   label) can never be a target.

Every attempt — allowed or denied, succeeded or failed — is written as a single
structured JSON audit line to stdout (`{"event":"ops.mutation",...}`). Note that
with a single shared token there is no per-user identity: the audit trail records
"someone with the operator token", not *who*.

### The socket-proxy side: a SECOND, dedicated proxy — not a widened shared one

Mutations are served by a completely separate `docker-socket-proxy-mutate`
container (its own dockerode client on the app side: `MUTATE_DOCKER_HOST`/
`MUTATE_DOCKER_PORT`), not by widening the read-only proxy. This was a
deliberate correction after verifying the real `tecnativa/docker-socket-proxy`
`haproxy.cfg`:

- The granular `ALLOW_START` / `ALLOW_STOP` / `ALLOW_RESTARTS` toggles map to
  exactly `POST /containers/{id}/start|stop|(stop|restart|kill)`, and — this is
  the key fact — they are **independent, path-specific rules that do not
  require `CONTAINERS=1`** to take effect.
- The proxy denies **all** non-GET requests up front (`deny unless METH_GET ||
  env(POST)`), so the `ALLOW_*` toggles only activate once `POST` is also
  enabled on that proxy instance.
- Naively enabling `POST` on the *same* proxy that also has `CONTAINERS=1` (for
  reads/inspect/logs) would be a mistake: `CONTAINERS` matches the broad
  `/containers` prefix for **both** GET and POST, with no method-level
  carve-out, so it would also admit `POST /containers/create` and
  `/containers/prune` — reopening the exact host-root-equivalent capability the
  read-only proxy exists to prevent.

So `docker-socket-proxy-mutate` runs with `CONTAINERS=0` (and every other
section 0) and *only* the three `ALLOW_*` toggles enabled. Even with `POST=1`,
it can reach **only** `/containers/{id}/(start|stop|restart|kill)` on a
container it's given the ID for — no create, no prune, no exec, no image/build,
no list, no inspect. This is genuine proxy-layer least privilege, not an
app-layer promise on top of a wider grant. `DELETE` verbs (container removal)
stay blocked regardless, since the proxy's up-front rule admits only GET and
POST. To enable mutations end to end, set all of `OPS_PROXY_POST=1`,
`OPS_PROXY_ALLOW_START=1`, `OPS_PROXY_ALLOW_STOP=1`,
`OPS_PROXY_ALLOW_RESTARTS=1`, plus `OPS_ALLOW_MUTATIONS=true` and a non-empty
`OPS_MANAGED_SERVICES`.

## Run path A — bring your own socket proxy

Use this if you already run (or want to run) the proxy yourself.

**Prerequisite:** a running `docker-socket-proxy` reachable over TCP, e.g.:

```bash
docker run -d --name docker-socket-proxy \
  -e CONTAINERS=1 -e NETWORKS=1 -e VOLUMES=1 -e PING=1 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -p 127.0.0.1:2375:2375 \
  tecnativa/docker-socket-proxy:v0.4.2
```

If you also want Phase 2 mutations, run a **second, separate** proxy instance
dedicated to them (never widen this one) — see "Phase 2: gated container
controls" above for exactly why, and the `docker-socket-proxy-mutate` service
in `docker-compose.ops.yml` for the concrete config to mirror.

> Never expose a raw Docker socket / unprivileged 2375 endpoint to the network.
> Point the dashboard at the **proxy**, not at the real engine.

Then:

```bash
cd vue/ops-dashboard
cp .env.example .env      # then set OPS_API_TOKEN
npm install
npm run build
OPS_API_TOKEN=... DOCKER_HOST=127.0.0.1 DOCKER_PORT=2375 npm start
# dashboard on http://127.0.0.1:3000
```

## Run path B — batteries included (compose)

Brings up the proxy + dashboard together on a dedicated, isolated network, with
the dashboard published to loopback only:

```bash
cd vue/ops-dashboard
OPS_API_TOKEN=$(openssl rand -hex 32) \
  docker compose -f docker-compose.ops.yml up --build
# dashboard on http://127.0.0.1:9010
```

`OPS_API_TOKEN` **must** be set for either path — the API fails closed without
it.

## Configuration

| Env var | Required | Default | Meaning |
| - | - | - | - |
| `OPS_API_TOKEN` | yes | — (fails closed) | Operator bearer token for `/api/*`. |
| `DOCKER_HOST` | no | `docker-socket-proxy` | Hostname of the read-only socket proxy. |
| `DOCKER_PORT` | no | `2375` | TCP port of the read-only socket proxy. |
| `MUTATE_DOCKER_HOST` | no | `docker-socket-proxy-mutate` | Hostname of the SEPARATE mutate-only proxy (Phase 2). |
| `MUTATE_DOCKER_PORT` | no | `2375` | TCP port of the mutate-only proxy. |

Phase 2 mutation controls add `OPS_ALLOW_MUTATIONS`, `OPS_MANAGED_SERVICES`, and
the compose-only `OPS_PROXY_POST` / `OPS_PROXY_ALLOW_START` /
`OPS_PROXY_ALLOW_STOP` / `OPS_PROXY_ALLOW_RESTARTS` toggles — all disabled by
default. See "Phase 2: gated container controls" above and `.env.example`.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run type-check
npm test
```

## Project layout

```text
server/
  middleware/auth.ts             # bearer-token guard for /api/* (fails closed)
  runtime/
    types.ts                     # RuntimeProvider + DTO types (READ-ONLY interface)
    mutating-types.ts            # MutatingRuntimeProvider (Phase 2, separate interface)
    config.ts                    # env resolution (token, both proxies, mutation gates)
    token.ts                     # constant-time token comparison
    parse.ts                     # pure mapping helpers (health/status/timestamps)
    container-request.ts         # container-id validation + 404 translation (shared)
    docker-provider.ts           # DockerProvider implements RuntimeProvider via dockerode
    docker-mutating-provider.ts  # DockerMutatingProvider (Phase 2, separate client/proxy)
    mutation-guard.ts            # Phase 2 gate + audit-log orchestrator
    log-stream-limiter.ts        # caps concurrent live-log streams
    singleton.ts                 # TWO clients/providers: read-only + mutating
  routes/api/
    ping.get.ts                  # engine reachability
    health.get.ts                # aggregated health report
    mutations-config.get.ts      # { allowed, managedServices } for the frontend gate
    containers/index.get.ts      # container list (summaries)
    containers/[id].get.ts       # container detail (inspect)
    containers/[id]/logs.get.ts  # live logs (SSE, demuxed, self-cleaning)
    containers/[id]/stop.post.ts    # Phase 2
    containers/[id]/start.post.ts   # Phase 2
    containers/[id]/restart.post.ts # Phase 2
    networks/index.get.ts
    volumes/index.get.ts
app/                             # Nuxt SPA (pages, components, composables)
  components/ContainerActions.vue  # gated Stop/Start/Restart + confirm (Phase 2)
```
