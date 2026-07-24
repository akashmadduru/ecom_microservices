# Ops Dashboard

A small, **standalone, read-only** observability dashboard for local Docker
containers — containers, networks, volumes, an aggregated health summary, and
live (streaming) container logs.

This is Phase 1: **read-only**. There are no stop/restart/rebuild/remove
actions and no mutating endpoints of any kind. There is no Kubernetes/EKS
integration.

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
`INFO`, and `PING` (and leave `POST` denied), so mutating endpoints are simply
not reachable through it.

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

## Run path A — bring your own socket proxy

Use this if you already run (or want to run) the proxy yourself.

**Prerequisite:** a running `docker-socket-proxy` reachable over TCP, e.g.:

```bash
docker run -d --name docker-socket-proxy \
  -e CONTAINERS=1 -e NETWORKS=1 -e VOLUMES=1 -e INFO=1 -e PING=1 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -p 127.0.0.1:2375:2375 \
  tecnativa/docker-socket-proxy
```

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

| Env var         | Required | Default                | Meaning                                   |
| --------------- | -------- | ---------------------- | ----------------------------------------- |
| `OPS_API_TOKEN` | yes      | — (fails closed)       | Operator bearer token for `/api/*`.       |
| `DOCKER_HOST`   | no       | `docker-socket-proxy`  | Hostname of the read-only socket proxy.   |
| `DOCKER_PORT`   | no       | `2375`                 | TCP port of the socket proxy.             |

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run type-check
npm test
```

## Project layout

```
server/
  middleware/auth.ts           # bearer-token guard for /api/* (fails closed)
  runtime/
    types.ts                   # RuntimeProvider + DTO types (read-only interface)
    config.ts                  # env resolution (OPS_API_TOKEN/DOCKER_HOST/DOCKER_PORT)
    token.ts                   # constant-time token comparison
    parse.ts                   # pure mapping helpers (health/status/timestamps)
    docker-provider.ts         # DockerProvider implements RuntimeProvider via dockerode
    singleton.ts               # shared Docker() client + provider
  routes/api/
    ping.get.ts                # engine reachability
    health.get.ts              # aggregated health report
    containers/index.get.ts    # container list (summaries)
    containers/[id].get.ts     # container detail (inspect)
    containers/[id]/logs.get.ts# live logs (SSE, demuxed, self-cleaning)
    networks/index.get.ts
    volumes/index.get.ts
app/                           # Nuxt SPA (pages, components, composables)
```
