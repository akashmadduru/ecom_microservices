# Feature: Ops Dashboard — Phase 1 (Read-Only Docker Observability) + Phase 2 (Gated Mutations) + Phase 3 (Read-Only Kubernetes Backend) + Phase 4 (Image Listing/Inspect + Detail-View Gaps) + Phase 5 (Gated Image/Volume/Network Mutations) + Phase 6 (Read-Only Dockerfile Discovery)

Last verified against: `nuxt/ops-dashboard/` as built (Nuxt 4.5 / Nitro / dockerode;
this is a rename of the `vue/ops-dashboard/` path used in this file's Phase 1–3
prose below — left as-is rather than a repo-wide find/replace, per this doc's own
history), `.github/workflows/ci-ops-dashboard.yml`, `python/services/{api_gateway,
auth_service,product_service,inventory_service}/Dockerfile`, and, for Phase 2,
`server/runtime/{mutating-types,docker-mutating-provider,mutation-guard,singleton,
config}.ts`, `docker-compose.ops.yml`, `app/components/ContainerActions.vue`; and,
for Phase 3, `server/runtime/{kubernetes-provider,k8s-parse,health-aggregate,config,
singleton,mutation-guard,container-request}.ts`, `k8s/ops-dashboard-readonly-rbac.yaml`,
`README.md`, `.env.example`; and, for Phase 4, `server/runtime/{types,docker-provider,
kubernetes-provider,k8s-parse,container-request}.ts`, `server/routes/api/{images/
[index,[id]],networks/[id],volumes/[id]}.get.ts`, `app/composables/useApiClient.ts`,
`app/pages/{images.vue,images/[id].vue,networks/[id].vue,volumes/[id].vue,volumes.vue,
networks.vue,app.vue}`, `docker-compose.ops.yml`; and, for Phase 5,
`server/runtime/{config,singleton,types,docker-provider,kubernetes-provider,
resource-mutating-types,docker-resource-mutating-provider,resource-mutation-guard}.ts`,
`server/routes/api/{images/[id]/remove,images/prune,volumes/[id]/remove,volumes/prune,
networks/[id]/remove,networks/prune,resource-mutations-config}.{post,get}.ts`,
`app/composables/useApiClient.ts`, `app/components/{Image,Volume,Network}Actions.vue`,
`app/pages/{images.vue,images/[id].vue,volumes.vue,volumes/[id].vue,networks.vue,
networks/[id].vue}`, `docker-compose.ops.yml`, `.env.example`; and, for Phase 6,
`server/runtime/{types,dockerfile-parse,dockerfile-registry}.ts`, `server/routes/api/
dockerfiles/{index,[id]}.get.ts`, `scripts/snapshot-dockerfiles.mjs`, `nuxt.config.ts`,
`app/composables/useApiClient.ts`, `app/pages/{dockerfiles.vue,dockerfiles/[id].vue,
app.vue}`, `package.json`, `.gitignore`, `.github/workflows/ci-ops-dashboard.yml`,
`README.md`.

**Grounding:** Built. Everything described below is shipped code, not a proposal.
Phase 2 (gated stop/start/restart) shipped on top of Phase 1's read-only foundation;
Phase 3 (a generic, read-only Kubernetes backend) shipped on top of both; Phase 4
(read-only image listing/inspect, plus the `/networks/:id` and `/volumes/:id` detail
routes Phase 3's own FutureWork entry flagged as a natural follow-up) shipped on top
of all three; Phase 5 (gated named-remove + prune for images/volumes/networks) shipped
on top of all four; Phase 6 (read-only display of this monorepo's own 7 Dockerfiles)
shipped on top of all five. This file covers all six. Rebuild, exec, and any
create/pull/push/connect capability remain explicitly **not** built for either
backend — see [Phase 5](#phase-5-gated-imagevolumenetwork-mutations), Known
Limitations, and [`FutureWork.md`](./FutureWork.md). Phase 6 in particular ships
NO build/rebuild capability of any kind — it only displays existing Dockerfile
*content*, parsed, never executes anything it parses (see
[Phase 6](#phase-6-read-only-dockerfile-discovery) below). **Phase 3 has never been
run against a real Kubernetes cluster**, and this remains true of Phase 4's and
Phase 5's Kubernetes-mode code too (Phase 5's mutations are Docker-only and reject
kubernetes mode outright, but the underlying read-only inspect calls the guard relies
on inherit the same unverified status) — see
[Phase 3: Generic Read-Only Kubernetes Backend](#phase-3-generic-read-only-kubernetes-backend)
below and [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster)
for why, and what "verified" will mean going forward.

Related docs: [`Changes.md`](./Changes.md) (file-level changelog),
[`DecisionLog.md`](./DecisionLog.md) (rationale for the socket-proxy trust boundary,
the Python→Node stack pivot, the Phase 2 two-proxy correction, the Phase 3
unverified-against-a-real-cluster decision, the Phase 4 namespace-qualified-id
correction, the Phase 5 Option-A residual-risk decision, the Phase 6 CI-snapshot-vs-
bind-mount decision, and other structural calls),
[`FutureWork.md`](./FutureWork.md) (deferred items).

## Summary

A small, standalone observability dashboard for the container runtime this platform's
services run on — in the user's own framing, "a replication of Docker Desktop, but
with customized features." Phase 1 shipped it **read-only**: it lists containers,
networks, and volumes; maps containers to the logical service they belong to via
Docker Compose labels; shows an aggregated health rollup per service; and streams live
container logs. Phase 2, covered in this same doc, adds a narrow, **gated, opt-in**
set of mutating actions — stop / start / restart of specific, allowlisted containers —
on top of that read-only foundation. Rebuild, remove, and exec are still deliberately
**not** implemented (rebuild in particular was evaluated and ruled out — see
[Phase 2: Gated Container Mutations](#phase-2-gated-container-mutations) below).

Phase 3, also covered in this doc, adds a second, **alternative, strictly read-only**
backend: instead of the Docker Engine, the same dashboard — same routes, same UI, same
auth — can observe a Kubernetes cluster, selected at process start via `RUNTIME_MODE`.
This is the payoff of Phase 1's `RuntimeProvider` interface design: the new
`KubernetesProvider` implements that exact interface unchanged, so no route or
frontend code needed to change to add an entirely different backend. Kubernetes mode
carries no mutating surface at all — the Phase 2 stop/start/restart routes return
`501 Not Implemented` when `RUNTIME_MODE=kubernetes`. See
[Phase 3: Generic Read-Only Kubernetes Backend](#phase-3-generic-read-only-kubernetes-backend)
below.

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
  containers are attached; **`/networks/:id`** (Phase 4) — per-network detail: the same
  fields plus per-container endpoint attachments (IPv4/IPv6/MAC in Docker mode) and
  driver `Options`.
- **`/volumes`** — every named volume, its driver, mountpoint, and labels; **`/volumes/:id`**
  (Phase 4) — per-volume detail: the same fields plus driver `Options` and the opaque
  `Status` blob (Docker mode only — see [Phase 4](#phase-4-read-only-image-listinginspect--detail-view-gaps)).
- **`/images`** (Phase 4) — every image, its tags, size, creation time, dangling status,
  and how many currently-listed containers reference it; **`/images/:id`** — per-image
  detail: labels, filesystem layer digests, `docker history` output, and which
  containers/pods currently reference it.
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
  plus the Phase 2 mutation routes (below). All read-only access goes through
  `server/runtime/{docker-provider,kubernetes-provider}.ts`, both implementing the
  **same, unmodified** `RuntimeProvider` interface (`server/runtime/types.ts`) — routes
  never see dockerode's or `@kubernetes/client-node`'s own types directly, and never
  branch on which backend is active (only the shared logs route branches, and only on
  the stream-demuxing step — see [Phase 3](#phase-3-generic-read-only-kubernetes-backend)
  below). `server/runtime/singleton.ts` selects the read-only provider (Docker or
  Kubernetes) by `RUNTIME_MODE`, and separately holds **two** independent `Docker()`
  clients for the Docker-only read/mutate split (Phase 2, see below) — never sharing a
  client between those two.
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

## Phase 3: Generic Read-Only Kubernetes Backend

Phase 3 adds a second backend the dashboard can observe — a Kubernetes cluster —
selected at process start with `RUNTIME_MODE=kubernetes` (default remains `docker`,
byte-identical to before). It is implemented as `KubernetesProvider`
(`server/runtime/kubernetes-provider.ts`), implementing the **exact same**
`RuntimeProvider` interface `DockerProvider` implements — `server/runtime/types.ts` did
not need a single line changed. That interface having been written narrow and
Docker-agnostic in Phase 1 (deliberately, per that phase's own design) is what made
Phase 3 possible without touching any route or any frontend code; only
`server/runtime/singleton.ts` needed to learn to pick a provider based on
`RUNTIME_MODE`.

Kubernetes mode is **strictly read-only**, matching Phase 1's posture, not Phase 2's:
there is no pod deletion, no deployment scaling, no exec. The Phase 2 mutation routes
(`stop`/`start`/`restart`) return an explicit `501 Not Implemented` when
`RUNTIME_MODE=kubernetes` — checked first thing in `mutation-guard.ts`'s
`runContainerMutation`, before any inspect call or provider construction, and
independently enforced again in `getMutatingProvider()` (defense in depth: even a
future caller that skips the guard function can't obtain a Docker-shaped mutating
provider in kubernetes mode). This isn't an oversight to fill in later — Docker's
stop/start/restart verbs have no clean Kubernetes analog: you don't "stop" a pod, you
delete it and a controller reconciles a replacement, which is a fundamentally
different operation with its own trust-boundary questions Phase 3 deliberately did not
take on.

### Why generic, not EKS-specific

`KubernetesProvider` is built entirely on `@kubernetes/client-node`'s standard, ambient
kubeconfig resolution (`KubeConfig.loadFromDefault()` — `~/.kube/config` / `KUBECONFIG`
/ an in-cluster service-account token, whichever is present). There is no AWS SDK, no
IAM auth code, nothing EKS-specific anywhere in the implementation. This means it works
against **any** conformant Kubernetes cluster — EKS included, once the operator has run
`aws eks update-kubeconfig` themselves, entirely outside this app's concern. This
directly serves the project's standing "modular, so anyone can use it" goal
(see [standalone/copy-out-able design](./DecisionLog.md#standalone-copy-outable-design))
better than a bespoke EKS integration would have.

### Semantic mapping: Kubernetes has no exact analog for any Docker concept here

Every mapping below is a deliberate, documented approximation, not a 1:1 translation —
see the per-method comments in `kubernetes-provider.ts` and `k8s-parse.ts`:

- **Pods → `ContainerSummary`/`ContainerDetail`** (the "container" abstraction). A
  pod's id is encoded as `namespace_podname` (or `namespace_podname_container` to
  address one container of a multi-container pod). `_` was chosen deliberately: it
  cannot appear in a DNS-1123 namespace, pod, or container name, so the encoding
  round-trips unambiguously, and it survives the existing `assertValidContainerId`
  route-boundary allowlist (`[a-zA-Z0-9_.-]`) unchanged — the same validation that
  protects the Docker id path protects this one too.
- **Services → `NetworkSummary`** (the closest analog to a stable network identity
  Docker networks provide).
- **PersistentVolumeClaims → `VolumeSummary`**.
- **Health** (`derivePodHealth` in `k8s-parse.ts`) is derived from pod phase, the
  `Ready` condition, and container waiting/terminated reasons — a real semantic gap,
  documented in code: e.g. a `Succeeded` (Completed) pod tallies as
  `stopped`+`noHealthcheck`, a `Failed` pod as `stopped`+`unhealthy`, since neither has
  a Docker equivalent state.
- **Namespace scope** via `K8S_NAMESPACE` — empty/unset means all namespaces, matching
  Docker mode's "sees the whole engine" default; a specific value scopes every
  pod/service/PVC listing to just that namespace.
- **Log streaming branches on backend, not on a new interface method.** Kubernetes pod
  logs arrive as plain text with stdout/stderr already merged by the API server —
  unlike Docker's frame-multiplexed stream, which requires demuxing. The shared
  `containers/[id]/logs.get.ts` route branches purely on this one point: Docker mode
  demuxes via `modem.demuxStream`, Kubernetes mode pipes the stream straight through
  with no demuxing (demuxing it would misread the first plain-text bytes as a Docker
  frame header and corrupt the output).
- **Health aggregation logic is shared, not duplicated**, via the new
  `server/runtime/health-aggregate.ts` (`aggregateHealth`/`tallyHealth`), consumed by
  both `DockerProvider.getHealth()` and `KubernetesProvider.getHealth()` — extracted
  during code review once it was clear the ~60 lines of rollup logic operate purely on
  the shared `ContainerSummary` DTO both providers already normalize to, with nothing
  backend-specific left in it (see Changes.md's review outcomes).

### RBAC is guidance, not enforcement — a genuine, inherent difference from Docker mode

On the Docker side, the socket-proxy **is** an enforcement layer this app controls: it
physically holds the socket and allowlists only read verbs — a real, independently
verifiable security boundary. On the Kubernetes side, there is **no equivalent
enforcement inside this app**: `KubernetesProvider` uses whatever credentials the
ambient kubeconfig hands it, and the **cluster's own RBAC is the only enforcement
point**, entirely outside this app's control or visibility. If the kubeconfig is bound
to a cluster-admin identity, the app *has* cluster-admin access, and has no way to know
or prevent it. A sample read-only `ClusterRole`/`ClusterRoleBinding` manifest is
provided at `k8s/ops-dashboard-readonly-rbac.yaml` (verbs `get`/`list` on `pods`,
`services`, `persistentvolumeclaims`, plus `get` on the `pods/log` subresource —
matched exactly to what the provider calls, nothing more) as **guidance for the
operator to bind their own identity to**, not something this app enforces or can
enforce. This is a genuine, inherent difference in blast-radius control between the
two modes, not an oversight to silently fix later — it cannot be fixed by this app; it
is how Kubernetes RBAC works. See
[DecisionLog](./DecisionLog.md#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode).

### Built and shipped without ever running against a real cluster

This entire phase was implemented and reviewed **without a live Kubernetes cluster
anywhere in the build environment** — no kubeconfig, no kind/minikube, no real API
server. Every Kubernetes interaction is implemented against
`@kubernetes/client-node`'s published types/docs and exercised only via hand-written
mocks in `test/{kubernetes-provider,k8s-parse,k8s-mutation-mode}.test.ts`. This was an
explicit, informed decision (three options were on the table — build unverified now,
skip Phase 3 entirely, or set up a local cluster first — the choice was to build
unverified now), not an oversight, and is the single most important caveat about this
phase. See
[DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster)
and [FutureWork.md](./FutureWork.md#phase-3-build--generic-read-only-kubernetes-backend)
for the explicit "first real cluster run is a verification milestone" plan.

## Phase 4: Read-Only Image Listing/Inspect + Detail-View Gaps

Phase 4 adds the last of the four core Docker Engine resource types this dashboard
observes — **images** — and closes two pre-existing gaps flagged in Phase 3's own
FutureWork entry: neither `/networks/:id` nor `/volumes/:id` existed before this
phase (both resources only had list views). Like Phase 1 and Phase 3, this phase is
**strictly read-only**: no image pull/remove/prune, no network/volume create/remove.
`MutatingRuntimeProvider`, `mutation-guard.ts`, and both Docker-mode socket-proxy
instances are untouched — see [Explicitly out of scope](#phase-4-explicitly-out-of-scope)
below.

### Images: a genuinely asymmetric feature across the two backends

Docker mode gets a real `docker.listImages()` / `docker.getImage(id).inspect()` /
`.history()` — full size, creation time, labels, `RootFS.Layers` digests, and
`docker history` output, plus which containers currently reference each image
(cross-referenced against `listContainers()` by the container's resolved `ImageID`,
the same pattern used for both `listImages`'s `containerCount` and `inspectImage`'s
`referencedBy`).

Kubernetes mode has **no per-image API at all** — there is no Kubernetes object that
represents "an image" the way a Pod represents "a container." `listImages`/
`inspectImage` there are a documented approximation: every pod's
`containerStatuses[]` is scanned and grouped by the image it reports (the real
`sha256:` digest when cleanly extractable from `containerStatus.imageID`, regardless
of which container runtime's prefix wraps it; otherwise a synthetic, route-safe id —
base64url-encoding the raw image reference, since a reference like `repo/name:tag`
contains `/` and `:`, characters the route id charset doesn't admit — see
`computeImageId`/`groupPodImages` in `k8s-parse.ts`). `size`, `createdAt`, `labels`,
`layers`, and `history` are all `null`/`{}` in this mode — structural gaps, not
oversights: no Kubernetes API surfaces any of that data for a bare image reference.
`inspectImage` re-runs the exact same pod scan `listImages` does (there is no
per-image lookup call to make instead) and finds the matching group by id.

### `/networks/:id` and `/volumes/:id`: the two detail-view gaps close differently per backend

Docker's `inspectNetwork`/`inspectVolume` are real `docker.getNetwork(id).inspect()`/
`docker.getVolume(id).inspect()` calls — richer than slicing the list response, the
same way `inspectContainer` has always been a real inspect rather than a reuse of
`listContainers()`'s summary shape. This surfaces per-container endpoint detail
(IPv4/IPv6/MAC address per network attachment) and driver `Options` for networks,
and driver `Options` plus the opaque, driver-specific `Status` blob for volumes —
none of which the list endpoints exposed before this phase (`NetworkDetail`/
`VolumeDetail` are new types in `server/runtime/types.ts`).

Kubernetes's `inspectNetwork` does the one extra labelSelector-scoped pod query per
Service that `listNetworks()` deliberately skips at list scale (an N+1 query
problem across every Service in scope) — exactly the follow-up
[FutureWork.md](./FutureWork.md) named when that list-scale gap was first
identified: "if a `/networks/:id` detail view is ever added... this would be the
natural place to do the one extra query per-Service instead of N-per-list."

Kubernetes's `inspectVolume` required a genuine, pre-existing bug fix, not just a
new route. `VolumeSummary` had no `id` field distinct from `name` before this phase.
A PersistentVolumeClaim name is only unique **within its namespace** — with this
project's default "all namespaces" scope (`K8S_NAMESPACE` unset), two different
namespaces can produce two `VolumeSummary` rows with the identical `name`, a real
collision no code before this phase needed to resolve, because nothing looked a
volume up by name/id; `/volumes/:id` is the first thing that does. `VolumeSummary.id`
is now `name` in Docker mode (identical — a Docker volume name already is its
identity) and `namespace_name` in Kubernetes mode (the same encoding `k8s-parse.ts`
already uses for pod ids, via `encodePodId`). A bare, separator-less volume id (a
plausible thing for an operator to type by hand) is genuinely ambiguous in
all-namespaces mode, not just malformed input, so `decodeVolumeId` throws its own
distinct, actionable 400 rather than reusing the pod-id decoder's generic
malformed-input message.

`NetworkSummary.id` in Kubernetes mode changed for a related reason: it used to be
`svc.metadata.uid`, falling back to `namespace_name` only when a uid was absent
(which real clusters never leave absent) — a bare Kubernetes uid cannot actually be
used to look up a Service (there is no "get by uid" call, and `metadata.uid` isn't a
supported field selector), so the id had to become the decodable `namespace_name`
form for `/networks/:id` to be implementable at all. Full reasoning:
[DecisionLog](./DecisionLog.md#volumesummaryid-and-networksummaryid-are-namespace-qualified-in-kubernetes-mode-phase-4).

### Explicitly out of scope {#phase-4-explicitly-out-of-scope}

No mutating capability for any of images/networks/volumes — no pull, no remove, no
prune, no create. This is a deliberate, narrow read-only extension of the existing
Phase 1/3 read-only surface, not a step toward Phase 2-style mutations for these
resource types; any future request to add mutation for images/networks/volumes needs
its own scoping/approval pass, mirroring how Phase 2 itself needed one relative to
Phase 1 (see [DecisionLog](./DecisionLog.md#phase-2-mutation-scope-stopstartrestart-only-rebuild-ruled-out)).

**Addressed:** Phase 5 shipped 2026-07-25 — see
[Phase 5: Gated Image/Volume/Network Mutations](#phase-5-gated-imagevolumenetwork-mutations)
below for the resulting design, built via exactly the fresh scoping/approval pass this
note anticipated.

## Phase 5: Gated Image/Volume/Network Mutations

Phase 5 extends Phase 2's gated-mutation posture — global kill switch + per-target
eligibility, off by default, fully audit-logged — to the three resource types Phase 4
made read-only-observable. Unlike Phase 2's stop/start/restart, this phase implements
**named remove**, not merely prune, per an explicit product requirement resolved at an
Approval Gate ("Option A" — see
[DecisionLog](./DecisionLog.md#phase-5-resource-mutations-option-a-app-layer-narrowing-third-proxy)
for the full four-option tradeoff analysis). Create, pull, push, and connect remain
explicitly **not** built for any of the three resource types, and no route or provider
method exists that could reach those verbs — see
[Explicitly out of scope](#phase-5-explicitly-out-of-scope) below.

### Named remove, not just prune — and the proxy-layer tradeoff that comes with it

Before implementation, the pinned `tecnativa/docker-socket-proxy:v0.4.2` image's real
`haproxy.cfg.template` was read directly (repeating the verification discipline that
caught Phase 2's own near-miss). The finding: containers have independent, path-specific
`ALLOW_START`/`ALLOW_STOP`/`ALLOW_RESTARTS` rules that work without needing
`CONTAINERS=1` at all — that's what makes Phase 2's mutate proxy genuinely narrow.
**Images/volumes/networks have no equivalent per-verb carve-out.** The only way to admit
`DELETE /images/{id}`, `POST /images/prune`, `DELETE /volumes/{name}`,
`POST /volumes/prune`, `DELETE /networks/{id}`, or `POST /networks/prune` through this
proxy is enabling the resource's own section (`IMAGES`/`VOLUMES`/`NETWORKS`) together
with `POST` — and each section also covers other verbs under the same path prefix:
`IMAGES=1` also admits `POST /images/create` (pull) and `/images/{name}/push`;
`VOLUMES=1` also admits `POST /volumes/create`; `NETWORKS=1` also admits
`POST /networks/create`, `/networks/{id}/connect`, `/networks/{id}/disconnect`.

The accepted tradeoff (Option A): disclose this proxy-layer residual risk explicitly
(here, in `docker-compose.ops.yml`'s own comment block, and in `.env.example`) and
narrow the *actual* behavior at the **app layer** instead.
`docker-resource-mutating-provider.ts`'s dockerode calls are hardcoded to only ever
issue `getImage(id).remove()`, `pruneImages({filters:{dangling:['true']}})` (filter
hardcoded, never caller-supplied), `getVolume(name).remove()`, `pruneVolumes()`,
`getNetwork(id).remove()`, `pruneNetworks()` — never create/pull/push/connect, and no
`ImageMutatingProvider`/`VolumeMutatingProvider`/`NetworkMutatingProvider` method exists
that could reach those verbs even by accident. This mirrors the already-accepted
precedent that Phase 2's `ALLOW_RESTARTS` also technically covers `kill` at the proxy
layer even though this app never calls it.

### A third, separate proxy — never shared with either existing one

Resource mutations run through a **third** `docker-socket-proxy-mutate-resources`
container, reached via a **third**, independent dockerode client
(`getResourceMutatingDockerClient()`/`get{Image,Volume,Network}MutatingProvider()` in
`singleton.ts`, using `RESOURCE_MUTATE_DOCKER_HOST`/`PORT`) — never the read-only
client/proxy, and never Phase 2's container-mutate client/proxy either. This extends
Phase 2's own "never share a client/proxy across mutation surfaces" discipline by one
more instance, specifically so a compromised network path to this (real pull/create/
push/connect-capable, once enabled) proxy cannot also reach the container-lifecycle
proxy's blast radius, or vice versa.

### The two gates, per resource type

Enforced in `server/runtime/resource-mutation-guard.ts` — a new sibling file;
`mutation-guard.ts` itself is completely untouched by this phase.

- **Named remove** (two gates, mirrors `runContainerMutation` exactly): (1) the global
  kill switch `OPS_ALLOW_RESOURCE_MUTATIONS`, checked before any inspect; (2) a
  per-target eligibility check. For **volumes** and **networks** this is a Compose-label
  allowlist — `OPS_MANAGED_VOLUMES`/`OPS_MANAGED_NETWORKS` matched against the
  `com.docker.compose.volume`/`com.docker.compose.network` label value, re-derived from
  a fresh inspect, same shape as Phase 2's `OPS_MANAGED_SERVICES`. For **images** this is
  a state check instead — the target must currently have **zero** referencing containers
  (`containerCount === 0`, re-derived from a fresh `inspectImage` call) — because an
  image has no Compose-label identity of its own to allowlist against: the same image can
  back zero, one, or many containers at once, unlike a container, which belongs to
  exactly one compose service. This is a deliberate deviation from the allowlist shape
  used everywhere else in this project, not an inconsistency.
- **Prune** (single gate only): the global kill switch, and nothing else — there is no
  target, so there is deliberately no per-target eligibility check. Docker's own
  engine-level prune (images: hardcoded `dangling: true`; volumes/networks: no filter,
  relying on the engine's own "unused only" default scoping) is the real backstop that
  keeps prune bounded to unused resources.

Both gates reject kubernetes mode outright with `501 Not Implemented`, checked first,
before any inspect or provider construction — resource mutations are Docker-only,
matching Phase 2's existing kubernetes rejection.

### Audit trail (Phase 5)

Same shape and philosophy as Phase 2's audit trail (structured JSON lines to stdout, no
persistence, no per-user identity — see
[DecisionLog](./DecisionLog.md#mutation-audit-trail-stdout-json-no-persistence)), with a
distinct event name (`ops.resource_mutation` vs. Phase 2's `ops.mutation`) and
`resourceType`/`resourceId` fields in place of `service`/`containerId`, so a log
consumer can tell the two mutation surfaces apart without parsing free text.

### Frontend gating (Phase 5)

`GET /api/resource-mutations-config` exposes `{allowed, managedVolumes, managedNetworks}`
— a **separate** endpoint from Phase 2's `mutations-config`, which is untouched (its
`{allowed, managedServices}` contract still backs `ContainerActions.vue` exactly as
before). `ImageActions.vue`/`VolumeActions.vue`/`NetworkActions.vue` render a Remove
button only when eligible, mirroring `ContainerActions.vue`'s "controls absent, not
disabled, when ineligible" pattern and its native-`confirm()` guard exactly.
`ImageActions` checks `allowed && containerCount === 0` (images have no managed-list to
check against, matching the server-side gate's own state-based shape). `VolumeActions`/
`NetworkActions` check `allowed && managedVolumes/managedNetworks.includes(name)` — a
client-side name-based approximation of the server's label-based check (the two could
theoretically diverge for a volume/network whose name differs from its own compose-label
value; the server-side gate is the actual authority in either direction, so at worst this
shows a button the server would then correctly 403, or hides one the server would have
allowed). A page-level "Prune unused" button on `images.vue`/`volumes.vue`/`networks.vue`
is gated only on the global switch (prune has no per-target eligibility), with its own
`confirm()` guard.

### Explicitly out of scope {#phase-5-explicitly-out-of-scope}

Image create/pull/push, volume/network create/connect/disconnect, container create/run/
exec/rebuild, `docker cp` — none of these are implemented, and no route or provider
method exists that could enable them. No existing proxy's `POST`/section toggles were
loosened beyond what's specified above; the read-only proxy and the Phase 2
container-mutate proxy are both untouched. Any future request to add pull/push/create/
connect needs its own fresh scoping/approval pass, exactly as this phase itself was
Phase 4's own deferred item revisited with one.

## Phase 6: Read-Only Dockerfile Discovery

Phase 6 adds a fifth, small observability surface: a **read-only, display-only**
view of this monorepo's own Dockerfiles — `/dockerfiles` (list) and
`/dockerfiles/:id` (parsed detail + raw source). It is unrelated to the
Docker-Engine-facing `RuntimeProvider` abstraction every earlier phase is built
on (`server/runtime/docker-provider.ts`/`kubernetes-provider.ts`) — this phase
reads Dockerfile *source text*, a build-time artifact, never anything from a
live Docker Engine or Kubernetes API, so `types.ts`'s `RuntimeProvider`
interface itself is untouched.

### A fixed, hardcoded allowlist of exactly 7 Dockerfiles — never a filesystem glob

`server/runtime/dockerfile-registry.ts` exposes exactly these 7, and only
these 7, regardless of what else might exist on disk: this app's own
(`nuxt/ops-dashboard/Dockerfile`, build context its own directory), the 4
Python services' (`python/services/{api_gateway,auth_service,
inventory_service,product_service}/Dockerfile`, build context the repo root),
and the 2 Vue apps' (`vue/apps/{ecom-admin,ecom-web}/Dockerfile`, build
context `vue/`). No request parameter is ever used to construct a filesystem
path anywhere in this feature — an id that isn't one of the 7 fixed entries
gets a 404, never a lookup against the real filesystem.

### CI-time snapshot, not a runtime bind-mount — and why

This dashboard has zero filesystem access to any monorepo-relative path at
runtime today — a deliberate property of its
[standalone, copy-out-able design](./DecisionLog.md#standalone-copy-outable-design):
its own Dockerfile's `COPY . .` only ever brings in its own directory, and a
`../../python/services/...`-shaped runtime read would both break that property
and simply not exist inside the running container. So the other 6
Dockerfiles' content is captured **once, ahead of time**, wherever the full
monorepo checkout genuinely is present (CI's own checkout, or a developer's
local clone) — `scripts/snapshot-dockerfiles.mjs` — rather than read live at
request time. Full rationale, and the bind-mount alternative that was rejected
instead: [DecisionLog](./DecisionLog.md#phase-6-ci-time-manifest-snapshot-not-a-runtime-bind-mount).

The script writes `server/generated/dockerfile-manifest.json` (gitignored — a
build artifact, regenerated fresh every time, never committed source)
containing, per entry, `{ id, label, dockerfilePath, buildContext, rawContent
}`. `server/runtime/dockerfile-parse.ts` is a pure function parsing that raw
text into `stages` (base image + optional `AS <name>` alias per `FROM`),
`exposedPorts`, `entrypoint`/`cmd` (exec-JSON or shell form, either way
normalized to a single string), and `argNames`/`envNames` — **names only,
never values**, mirroring this app's existing `ContainerDetail.envKeys`-only
precedent (see [DecisionLog](./DecisionLog.md#env-keys-only-not-values)),
even though the risk profile here is genuinely lower: a Dockerfile's `ARG`/
`ENV` defaults are already-committed source in this repo, not a
runtime-injected secret. Only the **final** build stage's `EXPOSE`/
`ENTRYPOINT`/`CMD`/`ENV` are surfaced — everything in an earlier stage is
build-time-only and doesn't describe the image that actually ships, mirroring
how `docker inspect` itself only ever reports the final image's config.

### Bundled as a Nitro server asset, not read via a runtime `fs` path

The manifest is registered as a Nitro `serverAssets` entry (`nuxt.config.ts`,
baseName `generated`, pointed at `server/generated/`) and read at runtime via
`useStorage('assets:generated')` — the same bare-global-Nitro-import pattern
`server/routes/api/**` already relies on for `defineEventHandler`/
`getRouterParam`. This was a deliberate, verified choice, not an assumption: a
plain runtime `fs.readFileSync()` call would NOT survive Nitro's production
bundling (the bundler has no static visibility into an opaque runtime fs
path), which was confirmed by actually building `.output/server` and
inspecting it before finalizing this design — `serverAssets` correctly
inlines the manifest's content into the compiled bundle at build time, and a
missing/malformed manifest degrades to an empty list plus a console warning
(never a crash), verified by actually running the built server both with and
without the manifest present.

### Local dev and CI wiring

`npm run snapshot-dockerfiles` (`node scripts/snapshot-dockerfiles.mjs`) must
be run before `npm run dev`/`npm run build` for the manifest to exist; the
`prebuild` npm lifecycle hook runs it automatically for `npm run build`. The
script resolves the repo root from **its own file location**
(`import.meta.url`), not `process.cwd()`, so it behaves identically whether
invoked as `node nuxt/ops-dashboard/scripts/snapshot-dockerfiles.mjs` from the
repo root (CI) or as `npm run snapshot-dockerfiles` from within
`nuxt/ops-dashboard/` (local dev). If the full monorepo isn't visible from
where it runs (the narrowed Docker build context is the expected case) it
leaves an already-correct, previously-generated manifest untouched rather than
overwriting it with an inferior one; if no manifest exists yet either, it
writes an empty-but-valid fallback with a warning, so a fresh clone never
crashes the app — only shows an empty Dockerfiles list until the script is run
for real.

This also required a **prerequisite bug fix**, unrelated to this feature but
blocking it: `.github/workflows/ci-ops-dashboard.yml` still referenced the
stale `vue/ops-dashboard` path from before this app's rename to
`nuxt/ops-dashboard` in its `paths:` filter, `working-directory`,
`cache-dependency-path`, and Docker build `context:`/`file:` — meaning this
workflow was not actually triggering on real changes to this app before this
fix. The `docker` job also stopped calling the shared
`_reusable-docker-build-push.yml` (used by 6 other services' CI) and instead
runs its own inline checkout + snapshot step + `docker/build-push-action`
sequence, so the snapshot script can run **before** the Docker build narrows
its context to `nuxt/ops-dashboard/` alone — the same "own its own CI steps
rather than force-fit a shared template" judgment call this workflow's
`lint-test-build` job already made for install/lint/type-check/test/build.

### Explicitly out of scope {#phase-6-explicitly-out-of-scope}

No build, rebuild, or "launch a container from this Dockerfile" capability of
any kind — this phase only displays already-committed Dockerfile *content*,
parsed, and never executes or builds anything it parses. That is a
deliberately separate, much larger, and separately-scoped system (tracked
elsewhere, not part of this phase) — mirrors how Phase 2's rebuild was
evaluated and explicitly ruled out for the exact same reason (build-context
execution is a fundamentally larger trust boundary than anything else this
app does). No new mutating route, no new socket-proxy toggle, no change to
`docker-compose.ops.yml`.

## Impacted Files

New project tree, `nuxt/ops-dashboard/` (see the README's "Project layout" section for
the full annotated tree, though note it was not kept in sync with Phase 4/5/6's
additions — Changes.md's file-level table is the authoritative record). Outside that
directory: `.github/workflows/ci-ops-dashboard.yml` (new in Phase 1, fixed in Phase 6
— see [Phase 6](#phase-6-read-only-dockerfile-discovery)), `python/services/
{api_gateway,auth_service,product_service,inventory_service}/Dockerfile`
(`HEALTHCHECK` line added to each in Phase 1; read, never modified, by Phase 6's
snapshot script); `k8s/ops-dashboard-readonly-rbac.yaml` (new, Phase 3 — guidance-only
RBAC manifest, not consumed by any code; unchanged by Phase 4/5/6 — no Phase 5/6 code
path touches Kubernetes, so the manifest needs no new grants). Full file-level table,
all six phases: [`Changes.md`](./Changes.md).

## Configuration / Feature Flags

No feature flags in Phase 1's sense (on/off toggles for optional UI), though Phase 2's
mutation gates function as one. All environment variables are read directly from
`process.env` at request time (`server/runtime/config.ts`), not just Nuxt's build-time
`runtimeConfig`, so the documented names work correctly even for a plain `node
.output/server/index.mjs` production start:

| Env var | Required | Default | Meaning |
|---|---|---|---|
| `OPS_API_TOKEN` | Yes | none — fails closed (503) if unset | Operator bearer token for all `/api/*` routes. |
| `RUNTIME_MODE` | No | `docker` | Phase 3: backend to observe. Only the exact string `"kubernetes"` switches; anything else resolves to `docker`. |
| `K8S_NAMESPACE` | No | empty (all namespaces) | Phase 3, kubernetes mode only: namespace scope for pod/service/PVC listings. |
| `DOCKER_HOST` | No | `docker-socket-proxy` | Hostname of the read-only socket proxy (docker mode only). |
| `DOCKER_PORT` | No | `2375` | TCP port of the read-only socket proxy (docker mode only). |
| `MUTATE_DOCKER_HOST` | No | `docker-socket-proxy-mutate` | Hostname of the **separate** mutate-only socket proxy (Phase 2, docker mode only). |
| `MUTATE_DOCKER_PORT` | No | `2375` | TCP port of the mutate-only socket proxy (docker mode only). |
| `OPS_ALLOW_MUTATIONS` | No | `false`-equivalent (any value other than exactly `"true"`) | Phase 2 global kill switch. No effect in kubernetes mode — mutation routes already return `501` there regardless. |
| `OPS_MANAGED_SERVICES` | No | empty (nothing mutable) | Phase 2 comma-separated Compose service allowlist. |
| `RESOURCE_MUTATE_DOCKER_HOST` | No | `docker-socket-proxy-mutate-resources` | Hostname of the **third**, dedicated image/volume/network mutate-only socket proxy (Phase 5, docker mode only). |
| `RESOURCE_MUTATE_DOCKER_PORT` | No | `2375` | TCP port of the resource mutate-only socket proxy (docker mode only). |
| `OPS_ALLOW_RESOURCE_MUTATIONS` | No | `false`-equivalent (any value other than exactly `"true"`) | Phase 5 global kill switch, independent of `OPS_ALLOW_MUTATIONS`. No effect in kubernetes mode — these routes already return `501` there regardless. |
| `OPS_MANAGED_VOLUMES` | No | empty (nothing removable) | Phase 5 comma-separated `com.docker.compose.volume` label allowlist. |
| `OPS_MANAGED_NETWORKS` | No | empty (nothing removable) | Phase 5 comma-separated `com.docker.compose.network` label allowlist. Images have no equivalent var — eligibility there is state-based (zero live container references). |

In `kubernetes` mode, `DOCKER_*`/`MUTATE_DOCKER_*`/`RESOURCE_MUTATE_DOCKER_*` are
ignored entirely and the cluster is reached via the ambient kubeconfig
(`KUBECONFIG`/`~/.kube/config`/in-cluster service account) — not via any env var this
app defines.

Compose-only proxy toggles (not read by the app itself, only by
`docker-socket-proxy-mutate` in `docker-compose.ops.yml`): `OPS_PROXY_POST`,
`OPS_PROXY_ALLOW_START`, `OPS_PROXY_ALLOW_STOP`, `OPS_PROXY_ALLOW_RESTARTS` — all
default to `0`. Enabling mutations end to end requires setting all four of these
**and** `OPS_ALLOW_MUTATIONS=true` **and** a non-empty `OPS_MANAGED_SERVICES`; missing
any one of the seven leaves mutations off. Separately, `docker-socket-proxy-mutate-resources`
has its own four Compose-only toggles: `OPS_PROXY_RESOURCE_IMAGES`,
`OPS_PROXY_RESOURCE_VOLUMES`, `OPS_PROXY_RESOURCE_NETWORKS`, `OPS_PROXY_RESOURCE_POST` —
all default to `0`; enabling resource mutations end to end requires all four of these
**and** `OPS_ALLOW_RESOURCE_MUTATIONS=true` **and** (for volumes/networks) a non-empty
`OPS_MANAGED_VOLUMES`/`OPS_MANAGED_NETWORKS`.

## Rollout Plan

Two supported Docker run paths, both documented in `vue/ops-dashboard/README.md`:

1. **Bring your own proxy** — operator runs a `docker-socket-proxy` container
   themselves (example command in the README) and starts the dashboard with `npm
   install && npm run build && npm start`, pointed at it via `DOCKER_HOST`/`DOCKER_PORT`.
   Adding Phase 2 mutations this way means standing up a **second**, separately
   configured proxy instance and pointing `MUTATE_DOCKER_HOST`/`MUTATE_DOCKER_PORT` at
   it; adding Phase 5 resource mutations means standing up a **third**, separately
   configured proxy instance and pointing `RESOURCE_MUTATE_DOCKER_HOST`/`PORT` at it —
   the README is explicit that none of these three proxy instances may ever be the same
   one.
2. **Batteries included** — `docker compose -f docker-compose.ops.yml up --build` from
   `vue/ops-dashboard/`, which now brings up **four** containers on the dedicated
   `ops_network` bridge (never the platform's `ecom_network`): the read-only
   `docker-socket-proxy`, `docker-socket-proxy-mutate` (Phase 2), the new
   `docker-socket-proxy-mutate-resources` (Phase 5), and the dashboard itself — with the
   dashboard's port published to `127.0.0.1` only. Mutations of both kinds stay off by
   default even with this compose file (`OPS_ALLOW_MUTATIONS`/`OPS_ALLOW_RESOURCE_MUTATIONS`
   and all eight `OPS_PROXY_*` toggles default to disabled); an operator must explicitly
   opt in to each independently.

Phase 3's Kubernetes mode is a **third, independent run path**, not wired into either
compose file above: `RUNTIME_MODE=kubernetes` plus a `KUBECONFIG` pointed at a
read-only-bound identity (see [Phase 3](#phase-3-generic-read-only-kubernetes-backend)
and the RBAC manifest at `k8s/ops-dashboard-readonly-rbac.yaml`), same
`npm install && npm run build && npm start`. It does not require or interact with any
`docker-socket-proxy*` container — `DOCKER_HOST`/`MUTATE_DOCKER_HOST`/
`RESOURCE_MUTATE_DOCKER_HOST` are simply ignored in this mode, and Phase 5's mutation
routes reject it outright with `501`.

`OPS_API_TOKEN` must be supplied by the operator in all paths — there is no default
and no compose-baked value. No database migrations, no cross-service coordination, and
no changes to `docker-compose.yml` (the platform's main compose file) are required;
`docker-compose.ops.yml` is a separate, additive compose project. The `HEALTHCHECK`
additions to the four Python service Dockerfiles are backward compatible — a
`HEALTHCHECK` directive only adds Docker-level health reporting, it does not change
any service's runtime behavior, port, or API surface. Phase 2's addition is also
backward compatible: an operator who upgrades and does nothing gets the read-only
Phase 1 behavior exactly as before, plus one extra idle proxy container in the
batteries-included path. Phase 3's addition is fully backward compatible for the same
reason: `RUNTIME_MODE` defaults to `docker`, so an operator who sets nothing gets
exactly the pre-Phase-3 behavior. Phase 5's addition is backward compatible for the
same reason as Phase 2's: an operator who upgrades and sets nothing gets exactly the
pre-Phase-5 behavior, plus one more idle proxy container in the batteries-included path.

## Known Limitations

Full detail and status in [`FutureWork.md`](./FutureWork.md):

- **Phase 6's Dockerfile-discovery feature is repo-specific and NOT copy-out-able**,
  the one documented exception to this project's standing standalone/copy-out-able
  design goal — its 7-entry allowlist is hardcoded to this exact monorepo's paths. See
  [Phase 6](#phase-6-read-only-dockerfile-discovery) and
  [DecisionLog](./DecisionLog.md#phase-6-ci-time-manifest-snapshot-not-a-runtime-bind-mount).
- **No container rebuild, remove, or exec capability.** Rebuild in particular was
  evaluated and explicitly ruled out (not just deferred) as the single highest-RCE-risk
  capability named in the original ask — it would require build-context/source access
  this standalone project deliberately doesn't have. Stop/start/restart are the full
  extent of Phase 2's *container* mutating surface — this remains true after Phase 5,
  which only added remove/prune for images/volumes/networks, never for containers. See
  [Phase 2: Gated Container Mutations](#phase-2-gated-container-mutations).
- **No image pull/push, and no volume/network create/connect/disconnect.** Phase 5 added
  named remove + prune for images/volumes/networks, deliberately nothing else — see
  [Phase 5](#phase-5-gated-imagevolumenetwork-mutations) and
  [Explicitly out of scope](#phase-5-explicitly-out-of-scope).
- **Phase 5's resource-mutate proxy has a disclosed, accepted proxy-layer residual
  risk broader than Phase 2's.** Unlike the container-mutate proxy's per-verb
  `ALLOW_START`/`ALLOW_STOP`/`ALLOW_RESTARTS` carve-out, `tecnativa/docker-socket-proxy`
  has no equivalent for images/volumes/networks — enabling `IMAGES`/`VOLUMES`/
  `NETWORKS`+`POST` on `docker-socket-proxy-mutate-resources` also technically admits
  pull/create/push/connect at the *proxy* layer. This app's own dockerode calls never
  issue those verbs (narrowed at the app layer instead), and this was an explicit,
  informed Approval Gate decision ("Option A"), not an oversight. See
  [Phase 5](#phase-5-gated-imagevolumenetwork-mutations) and
  [DecisionLog](./DecisionLog.md#phase-5-resource-mutations-option-a-app-layer-narrowing-third-proxy).
- **Phase 3's Kubernetes backend has never been run against a real cluster.** Built,
  reviewed, and shipped entirely against `@kubernetes/client-node`'s published
  types/docs and hand-written mocks — no kubeconfig, no kind/minikube, no live API
  server anywhere in the build environment. An explicit, informed decision, not an
  oversight; the first real run against a live cluster should be treated as a
  verification milestone. See [Phase 3](#phase-3-generic-read-only-kubernetes-backend),
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster),
  and [FutureWork.md](./FutureWork.md#phase-3-build--generic-read-only-kubernetes-backend).
- **Kubernetes mode has no mutating surface, and Kubernetes RBAC is guidance, not
  enforcement.** Unlike Docker mode's socket-proxy (an enforcement layer this app
  controls), the Kubernetes mode relies entirely on the cluster's own RBAC, bound to
  whatever identity the ambient kubeconfig provides — this app cannot verify or
  enforce that those credentials are actually read-only. See
  [Phase 3](#phase-3-generic-read-only-kubernetes-backend) and
  [DecisionLog](./DecisionLog.md#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode).
- **No EKS-specific integration.** Phase 3 is generic Kubernetes only — there is no
  AWS SDK/IAM code, and this repo's `terraform/` EKS setup is currently a bare
  VPC+EKS skeleton with no real cluster provisioned yet, which is also why Phase 3
  could not be verified against a live cluster (see above). (Previous revisions of
  this doc referred to this gap as "Phase 4" before that number was taken by the
  image-listing/detail-view-gaps phase actually shipped below — an EKS-specific
  integration remains unplanned and unnumbered.)
- **Kubernetes-mode image data is structurally thinner than Docker mode's.**
  `size`, `createdAt`, `labels`, `layers`, and `history` are all `null`/`{}` for
  every image in Kubernetes mode — there is no per-image Kubernetes API to source
  any of that data from, so this is a permanent, structural gap, not a temporary
  one. See [Phase 4](#phase-4-read-only-image-listinginspect--detail-view-gaps).
- **`NetworkSummary.id`'s value changed in Kubernetes mode (Phase 4).** Existing
  Kubernetes-mode `/api/networks` consumers relying on the previous uid-shaped id
  will see a `namespace_name`-shaped one instead — necessary for `/networks/:id` to
  be implementable at all (a bare uid cannot be looked up via the Kubernetes API).
  See [DecisionLog](./DecisionLog.md#volumesummaryid-and-networksummaryid-are-namespace-qualified-in-kubernetes-mode-phase-4).
- **Single static bearer token, no per-user identity.** Anyone holding the token has
  the same access as anyone else, for both reads (Phase 1) and mutations of every kind
  (Phase 2 container lifecycle, Phase 5 resource remove/prune); there's no way to
  distinguish *who* acted beyond "someone with the token" — both audit logs record the
  action, not the actor. Accepted for this phase; would need a real identity layer to
  improve.
- **The mutate proxies have no per-resource ACL** — the Phase 2 mutate proxy restricts
  which *verbs* (start/stop/restart/kill) are reachable, not which *container IDs* they
  can target (`OPS_MANAGED_SERVICES` is enforced entirely at the app layer); the Phase 5
  resource-mutate proxy is the same shape, one level broader (see the dedicated bullet
  above). This is an accepted residual risk, not a bug — full detail in
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
