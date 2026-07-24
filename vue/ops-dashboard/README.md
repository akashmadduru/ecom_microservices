# Ops Dashboard

A small, **standalone, read-only** observability dashboard for local Docker
containers — containers, networks, volumes, an aggregated health summary, and
live (streaming) container logs.

Phase 1 is **read-only**. Phase 2 adds **opt-in, allowlist-gated** stop / start
/ restart controls that are **disabled by default** and off unless explicitly
enabled at both the app and proxy layers (see "Phase 2: gated container
controls" below). There is still no rebuild/remove/exec capability.

Phase 3 adds an optional, **generic read-only Kubernetes** backend: the same
dashboard can observe a Kubernetes cluster (any conformant cluster, EKS
included) instead of local Docker, selected with `RUNTIME_MODE=kubernetes`. It
is **read-only, like Phase 1 — not Phase 2**: there is deliberately no pod
deletion, deployment scaling, or exec, and the Phase 2 mutation routes return
`501` in Kubernetes mode. See "Phase 3: generic Kubernetes mode" below.

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

## Phase 3: generic Kubernetes mode (read-only)

Set **`RUNTIME_MODE=kubernetes`** to point the dashboard at a Kubernetes cluster
instead of Docker. The default is `docker`, so existing deployments are
completely unaffected — only the exact string `"kubernetes"` switches backends.

This mode is **generic, not EKS-specific**. It uses the standard
`@kubernetes/client-node` ambient kubeconfig resolution
(`KubeConfig.loadFromDefault()`: `~/.kube/config` / `KUBECONFIG` / an in-cluster
service-account token — whatever is present), with **no AWS/EKS SDK, no IAM
auth, nothing AWS-specific**. It works against EKS exactly the same as any other
conformant cluster, once you have run `aws eks update-kubeconfig` yourself
(outside this app's concern). That genericity is the point: it serves the
"modular, anyone can use it" goal better than an EKS-specific integration would.

### Namespace scope

`K8S_NAMESPACE` selects the scope. **Empty/unset means all namespaces** (the
default — parity with Docker mode seeing the whole engine). Set it to a single
namespace to scope every pod/service/PVC listing to just that one.

### How Kubernetes concepts map onto the dashboard's Docker-shaped DTOs

Kubernetes has no exact analog to Docker containers/networks/volumes, so each of
these is a **deliberate, documented approximation** (see
`server/runtime/kubernetes-provider.ts` and `k8s-parse.ts`):

| Dashboard call | Kubernetes source | Mapping notes |
| - | - | - |
| `listContainers` / `inspectContainer` | **Pods** | `id` = `namespace_podname` (an underscore-joined pair, since neither part can contain `_`; it round-trips through the same route-boundary id validation as a Docker id). `name` = pod name. `image` = the single container image, or all container images joined with `, ` for multi-container pods. `state` = the lowercased pod phase. `health` (see below). `service` = resolved owner/label (see below). `project` = the pod's **namespace**. `managed` = true when a `service` resolved. `networks` = the pod's IP(s) as **informational strings** (Kubernetes has no Docker-style named networks — a deliberate approximation). `createdAt` = `creationTimestamp`. |
| `listNetworks` | **Services** | `driver` = the Service `type` (`ClusterIP`/`NodePort`/`LoadBalancer`). `scope` = namespace. `internal` = `type == ClusterIP`. `ipamSubnets` = the Service's clusterIP(s) as informational addresses (headless `None` dropped). `containers` = **empty** (resolving backing pods would be an N+1 label-selector query per Service — deliberately skipped for a list endpoint). |
| `listVolumes` | **PersistentVolumeClaims** | `driver` = the PVC's `storageClassName`. `mountpoint` = the bound PersistentVolume name (`spec.volumeName`), empty while unbound — a PVC has no host path. `scope` = namespace. |
| `getHealth` | **Pod readiness rollup** | Same shape as Docker's report; see the health-mapping note below. |
| `streamLogs` | **Pod log endpoint** (`Log` class, `follow: true`) | A 2-part id (what `listContainers` emits) defaults to the pod's **first container**; a 3-part `namespace_podname_container` id addresses a specific container of a multi-container pod. Returns the same `Promise<ReadableStream>` shape as Docker. |
| `ping` | **`GET /version`** | A cheap, un-privileged reachability probe; returns a boolean, never throws. |

**Health derivation** (`derivePodHealth`) maps a pod onto Docker's
`healthy`/`unhealthy`/`starting`/`none`:

- `Running` + `Ready` condition `True` → **healthy**
- `Running` + a container waiting with a crash/image-pull reason
  (`CrashLoopBackOff`, `ImagePullBackOff`, …) → **unhealthy** (this is the
  concrete signal behind a high `restartCount`)
- `Running` + up but not yet `Ready` → **starting**
- `Pending` → **starting**
- `Succeeded` (ran to completion) → **none** (no ongoing health notion, like a
  healthcheck-less container that exited 0)
- `Failed` → **unhealthy**; `Unknown` (node lost contact) → **unhealthy**

**`service` (managed) resolution** checks, in order: the pod's controller owner
reference — a `ReplicaSet` resolves to its **Deployment** name by stripping the
pod-template-hash suffix (no extra API call, so no extra RBAC); a `StatefulSet` /
`DaemonSet` / `Job` / `ReplicationController` is used directly. If there is no
usable owner reference, it falls back to labels: `app.kubernetes.io/name` first
(the current recommended-labels standard), then the legacy `app` label.

**Health rollup / the `stopped` gap:** only `state == running` (i.e. phase
`Running`) counts as running; every other phase counts as `stopped`. So a
**Completed** pod (`Succeeded`) tallies as `stopped` + `noHealthcheck`, while a
**Failed** pod tallies as `stopped` + `unhealthy`. This is a defensible
approximation of a Docker-shaped report onto a model that has no direct
equivalent.

### RBAC — guidance, not enforcement (important, blast-radius difference)

Unlike Docker mode — where the socket-proxy is an enforcement layer **this app
controls** — the Kubernetes mode has **no enforcement layer inside the app**. It
uses whatever your ambient kubeconfig grants, and **it cannot verify or enforce
that those credentials are actually read-only.** The **cluster's own RBAC is the
only enforcement point**, entirely outside this app's control. This is a real,
inherent difference in blast-radius control between the two modes, stated here
plainly rather than glossed over: if you bind the dashboard to a broad identity,
it will have broad access, and the app has no way to know or prevent it.

So bind the identity in the kubeconfig you give the dashboard to a **read-only**
role. A ready-to-apply `ClusterRole` + `ClusterRoleBinding` (verbs `get`/`list` on
`pods`, `services`, `persistentvolumeclaims`, plus `get` on the `pods/log`
subresource — matched exactly to what the provider calls, no `namespaces`, no
`watch`, nothing else) is provided at
[`k8s/ops-dashboard-readonly-rbac.yaml`](k8s/ops-dashboard-readonly-rbac.yaml).

### Run it

```bash
cd vue/ops-dashboard
npm install
npm run build
OPS_API_TOKEN=$(openssl rand -hex 32) \
  RUNTIME_MODE=kubernetes \
  KUBECONFIG=/path/to/readonly.kubeconfig \
  npm start
# K8S_NAMESPACE unset = all namespaces; set it to scope to one namespace.
```

The bearer-token auth (`OPS_API_TOKEN`), the same `/api/*` surface, and the same
frontend all work unchanged — only the backend provider is swapped.

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
| `RUNTIME_MODE` | no | `docker` | Backend to observe: `docker` or `kubernetes`. Only the exact string `kubernetes` switches; anything else = `docker` (Phase 3). |
| `K8S_NAMESPACE` | no | *(empty = all)* | Kubernetes-only: namespace scope. Empty/unset = all namespaces (Phase 3). |
| `DOCKER_HOST` | no | `docker-socket-proxy` | Docker-only: hostname of the read-only socket proxy. |
| `DOCKER_PORT` | no | `2375` | Docker-only: TCP port of the read-only socket proxy. |
| `MUTATE_DOCKER_HOST` | no | `docker-socket-proxy-mutate` | Docker-only: hostname of the SEPARATE mutate-only proxy (Phase 2). |
| `MUTATE_DOCKER_PORT` | no | `2375` | Docker-only: TCP port of the mutate-only proxy. |

In `kubernetes` mode the `DOCKER_*` / `MUTATE_DOCKER_*` vars are ignored, and the
Kubernetes API is reached via the ambient kubeconfig (`KUBECONFIG` /
`~/.kube/config` / in-cluster service account) — see "Phase 3" above.

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
    config.ts                    # env resolution (mode, namespace, token, proxies, gates)
    token.ts                     # constant-time token comparison
    parse.ts                     # pure Docker mapping helpers (health/status/timestamps)
    k8s-parse.ts                 # pure Kubernetes mapping helpers (id/health/service) (Phase 3)
    container-request.ts         # container-id validation + 404 translation (shared)
    docker-provider.ts           # DockerProvider implements RuntimeProvider via dockerode
    kubernetes-provider.ts       # KubernetesProvider implements RuntimeProvider (Phase 3, read-only)
    docker-mutating-provider.ts  # DockerMutatingProvider (Phase 2, separate client/proxy)
    mutation-guard.ts            # Phase 2 gate + audit-log orchestrator (501 in k8s mode)
    log-stream-limiter.ts        # caps concurrent live-log streams
    singleton.ts                 # provider selection by RUNTIME_MODE; read-only + mutating
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
k8s/
  ops-dashboard-readonly-rbac.yaml # read-only ClusterRole/Binding for k8s mode (Phase 3)
```
