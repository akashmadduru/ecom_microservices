# Decision Log (ops-dashboard)

Append-only, scoped to `vue/ops-dashboard/`. Most recent first. Never edit historical
entries except to mark them superseded. Audience: engineering. Related:
[`Feature.md`](./Feature.md), [`Changes.md`](./Changes.md), [`FutureWork.md`](./FutureWork.md).

---

## 2026-07-24 — Phase 3 shipped unverified against a real Kubernetes cluster {#phase-3-shipped-unverified-against-a-real-kubernetes-cluster}

**Context.** Phase 3 build ([`Feature.md`](./Feature.md#phase-3-generic-read-only-kubernetes-backend),
[`Changes.md`](./Changes.md#change-set-phase-3-build--generic-read-only-kubernetes-backend--2026-07-24)).
There is no kubeconfig, no kind/minikube, no live Kubernetes cluster anywhere in the
environment this project is built and reviewed in. Building a Kubernetes-backed
provider still required a concrete choice: build it anyway using the client library's
published contract, or don't build it until a real cluster is available to test
against.

**Decision.** Build `KubernetesProvider` and ship Phase 3 now, entirely against
`@kubernetes/client-node`'s published TypeScript types/documentation, exercised only
via hand-written mocks in `test/{kubernetes-provider,k8s-parse,k8s-mutation-mode}
.test.ts`. This code has **never been run against a real Kubernetes API server** —
not in development, not in CI, not in any review step of this phase.

**Why.** The user was offered three explicit options — (a) build unverified now
against the documented client contract, (b) skip Phase 3 entirely until a cluster
exists, or (c) stand up a local cluster (kind/minikube) first and build against that —
and chose (a). The reasoning: `@kubernetes/client-node` is the official, actively
maintained client library with a stable, well-documented API surface (typed request/
response shapes for `CoreV1Api`, `Log`, `VersionApi`), so building against its
documented contract is a materially lower-risk bet than it would be for an
undocumented or unstable API; deferring the whole phase until a cluster happens to
exist would block a feature whose design (see the interface-reuse decision above) is
otherwise ready to build and review now. This was made as an informed tradeoff, not
an oversight or a corner cut silently — it is called out explicitly in `Feature.md`,
`Changes.md`, and here specifically so nobody discovers it after the fact.

**Alternatives rejected.**
*Skip Phase 3 entirely until a real EKS/Kubernetes cluster exists in this repo's
infra* — rejected: the terraform EKS skeleton having no provisioned cluster yet
(see the pre-existing Phase 1/2 FutureWork item) would then block this feature
indefinitely with no clear timeline, when the design and implementation work was
otherwise ready.
*Stand up a local kind/minikube cluster first, then build and test against it* —
rejected for this pass: heavier setup cost than the task warranted given the explicit
three-option framing, and would still not exercise the actual EKS-shaped identity/
RBAC/network path this dashboard is ultimately meant to run against — a local kind
cluster verifies "does this work against *a* Kubernetes API server," which is
necessary but not sufficient, and was judged not worth blocking on for this pass.

**Consequences.** Every Kubernetes-path behavior in this phase — pod listing/
inspection, log streaming via the `Log` class, service/PVC mapping, RBAC-driven
error shapes, `ApiException`'s `.code`-based 404 handling — is verified only against
mocks that encode this team's *understanding* of the client library's contract, not
against the real API server's actual behavior. Any divergence between the mocked
behavior and a real cluster's behavior (a subtly different error shape, an
undocumented edge case in pagination, a `Log.log()` timing/backpressure quirk under
real network conditions) will not surface until Phase 3 is first pointed at a live
cluster. This is the single most important caveat about this phase and must not be
understated in any summary of what shipped.

**Revisit when.** The first real deployment against a live Kubernetes cluster —
**treat this as a verification milestone, not an afterthought.** Concretely: run
`listContainers`/`inspectContainer`/`streamLogs`/`listNetworks`/`listVolumes` against
a real cluster (kind/minikube is an acceptable first step; a real EKS cluster once
this repo's `terraform/` provisions one is the fuller test) before treating any of
Phase 3's behavior as confirmed correct, and update this entry to record what was
verified and what (if anything) needed fixing as a result. See
[FutureWork.md](./FutureWork.md#phase-3-build--generic-read-only-kubernetes-backend).

---

## 2026-07-24 — Kubernetes RBAC is guidance, not enforcement — an inherent asymmetry with Docker mode {#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode}

**Context.** Phase 3 build. Docker mode's entire read-only guarantee rests on a
real, app-controlled enforcement layer: the `docker-socket-proxy` sidecar, which
physically holds the socket and allowlists only read verbs (see
[Docker access via a socket-proxy sidecar](#docker-socket-proxy-not-a-direct-socket-mount)
above). Kubernetes mode needed an equivalent story for "how do we know this app can't
do more than read."

**Decision.** There is **no enforcement layer inside this app for Kubernetes access.**
`KubernetesProvider` uses whatever credentials the ambient kubeconfig
(`KubeConfig.loadFromDefault()`) hands it, with no code path that inspects, restricts,
or verifies those credentials' actual scope. The **only** enforcement point is the
target cluster's own RBAC, configured and controlled entirely by the operator, outside
this app. A sample read-only `ClusterRole`/`ClusterRoleBinding` is shipped at
`k8s/ops-dashboard-readonly-rbac.yaml`, granting exactly `get`/`list` on `pods`/
`services`/`persistentvolumeclaims` plus `get` on `pods/log` — matched precisely to
what the provider calls, nothing more — but this manifest is **guidance for the
operator to bind their own identity to**, not something the app enforces, checks
against, or can even detect is actually in effect.

**Why.** This is not a design gap to close — it is how Kubernetes RBAC works. Unlike
the Docker Engine API (a single undifferentiated socket that a sidecar proxy can sit
in front of and filter), Kubernetes RBAC is a first-class, cluster-native concept:
authorization is evaluated by the API server itself, per-request, based on the
credential presented. There is no equivalent of "run a filtering proxy in front of the
Kubernetes API" that this app could stand up and control the way it stands up
`docker-socket-proxy` — any such proxy would just be re-implementing a subset of what
the cluster's own RBAC already does, worse, and out of sync with the cluster's actual
authorization model (namespaces, resource versions, admission control, etc.). The
honest, correct design is therefore to be explicit that this app inherits whatever
access its credential has, and to hand the operator a precise, ready-to-apply
least-privilege manifest to bind that credential to — not to pretend an app-level
enforcement layer exists when it structurally cannot.

**Alternatives rejected.**
*Build an in-app authorization check that inspects the kubeconfig's granted
permissions before making calls (e.g. a `SelfSubjectAccessReview` pre-flight check)*
— rejected: this can confirm what the credential *can* do but cannot *restrict* what
it can do — a credential with `cluster-admin` still has `cluster-admin` no matter what
pre-flight check this app runs before using it; it would add complexity while
providing, at best, an informational warning, not an enforcement boundary.
*Require the operator to run a filtering reverse-proxy in front of the Kubernetes API
server, mirroring the Docker socket-proxy pattern* — rejected: no mature, widely-used
equivalent of `tecnativa/docker-socket-proxy` exists for the Kubernetes API surface,
and building one from scratch for this project would be a large, security-critical
undertaking disproportionate to this phase's scope — RBAC is the correct, native tool
for this job and reinventing it worse is not an improvement.

**Consequences.** The blast radius of a misconfigured (over-privileged) kubeconfig in
Kubernetes mode is entirely the operator's to control and is not bounded by anything
this app does — this is a real, inherent difference from Docker mode's blast-radius
story, not a bug. It is documented plainly in `Feature.md`, `README.md`, and the RBAC
manifest's own header comment, specifically so it is never mistaken for an oversight
that a future patch could "fix" — it cannot be fixed inside this app.

**Revisit when.** Never, absent a fundamentally different Kubernetes access
architecture (e.g. requiring a specific admission-controller-backed proxy as a hard
dependency) that this project has no current plan to build. If the RBAC manifest's
`rules` block ever drifts from what `kubernetes-provider.ts` actually calls (in either
direction), fix the manifest to match the code — not the other way around, per its own
header comment.

---

## 2026-07-24 — Generic Kubernetes provider via the ambient kubeconfig, reusing the unmodified `RuntimeProvider` interface {#generic-kubernetes-provider-via-ambient-kubeconfig}

**Context.** Phase 3 build. Phase 1's `RuntimeProvider` interface
(`server/runtime/types.ts`) was deliberately written narrow and Docker-agnostic even
though, at the time, Docker was the only backend that existed — see that phase's own
design. Phase 3 needed to decide how literally to take that narrowness, and separately
needed to decide how to authenticate against a Kubernetes cluster: build something
EKS-specific (this platform's actual eventual target), or something generic.

**Decision.** `KubernetesProvider` implements the **exact same** `RuntimeProvider`
interface `DockerProvider` implements — `types.ts` did not need a single line changed.
Provider selection is a single `RUNTIME_MODE` check in `singleton.ts`; no route, no
frontend component, and no shared helper (`container-request.ts`,
`health-aggregate.ts`) needed to branch on which backend is active, except the one
place that structurally must (`logs.get.ts`'s demux-vs-pipe branch, since that is a
genuine wire-format difference between the two backends' log streams, not an
abstraction leak). Authentication uses `@kubernetes/client-node`'s standard
`KubeConfig.loadFromDefault()` ambient resolution (`~/.kube/config` / `KUBECONFIG` /
in-cluster service-account token) — no AWS SDK, no IAM-specific auth code anywhere.

**Why.** The interface reuse is the direct payoff of Phase 1's own design discipline:
`RuntimeProvider` was kept free of anything Docker-specific in its method signatures
(no `Docker.ContainerInspectInfo` leaking into the interface, no assumption baked in
that "container" means "Docker container") specifically so a second backend would be
*architecturally plausible without a rewrite* — a possibility explicitly flagged,
though not committed to, in this project's own Phase 1 FutureWork notes. Phase 3 is
the concrete confirmation that flag was correct: zero interface changes were needed.

Choosing the ambient-kubeconfig approach over an EKS-specific one directly serves the
project's standing portability goal — "modular, so anyone can use it" (see
[stack pivot](#stack-pivot-python-fastapi--4th-workspace-member-to-standalone-nuxtnode)
and [standalone/copy-out-able design](#standalone-copy-outable-design) above, both
Phase 1 decisions this one is consistent with). An EKS-specific integration (AWS SDK,
IAM auth) would only work against this platform's own eventual EKS cluster and would
need its own credential/IAM-role story; the generic ambient-kubeconfig approach works
against *any* conformant cluster, including EKS, the moment an operator has run
`aws eks update-kubeconfig` themselves — a step entirely outside this app's concern,
exactly as `DOCKER_HOST`/`DOCKER_PORT` already assume the operator has a reachable
Docker Engine (via the socket proxy) without this app knowing anything about how that
engine was provisioned.

**Alternatives rejected.**
*Build an EKS-specific provider using the AWS SDK for authentication (e.g.
`aws-sdk` STS token generation for IAM-based cluster auth)* — rejected: ties the
dashboard to AWS specifically, defeating the "copy this into any repo" goal that
motivated the entire Phase 1 stack pivot, and adds a second, AWS-specific auth code
path to maintain and review alongside the generic kubeconfig path, for a benefit
(saving the operator one `aws eks update-kubeconfig` command) that doesn't justify the
added surface area or the narrower applicability.
*Introduce a new, broader interface (e.g. `GenericRuntimeProvider`) that both
`DockerProvider` and `KubernetesProvider` would migrate to, anticipating future
backends' needs* — rejected: no concrete need for anything beyond the existing
`RuntimeProvider` surface was identified while building `KubernetesProvider`; widening
the interface speculatively, without a second concrete requirement driving it, risked
the same kind of premature generalization Phase 1 avoided by keeping the original
interface narrow.

**Consequences.** Adding Phase 3 touched exactly the files that needed a new backend
implementation (`kubernetes-provider.ts`, `k8s-parse.ts`, `health-aggregate.ts` — the
last one existing only because of a review-time extraction, not a Phase 3 design
requirement — plus `config.ts`/`singleton.ts` for mode selection and
`mutation-guard.ts` for the 501 rejection) and touched no route file's business logic
and no frontend component at all. The cost of genericity: an operator wanting to point
this at EKS must run `aws eks update-kubeconfig` themselves first — a small, explicit,
well-understood step, not a gap in this app.

**Revisit when.** If a future requirement needs the dashboard to *provision* or
*discover* clusters itself (rather than being handed an already-configured
kubeconfig) — that would be a materially different scope needing its own design
discussion, not an incremental change to this decision.

---

## 2026-07-24 — Second, dedicated mutate-only `docker-socket-proxy` instead of widening the read-only one {#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one}

**Context.** Phase 2 build ([`Feature.md`](./Feature.md#phase-2-gated-container-mutations),
[`Changes.md`](./Changes.md#change-set-phase-2-build--gated-container-mutations-stopstartrestart--2026-07-24)).
Follows directly from Phase 1's [socket-proxy decision](#docker-socket-proxy-not-a-direct-socket-mount),
which explicitly flagged that Phase 2 "should not simply loosen the existing read-only
proxy config" — this entry is that revisit, and records why the first attempt at it
was wrong.

**Decision.** Mutations (stop/start/restart) are served by a **second, completely
separate** `docker-socket-proxy-mutate` container, configured with `CONTAINERS=0` (and
every other read-style section off) and *only* the `ALLOW_START`/`ALLOW_STOP`/
`ALLOW_RESTARTS` toggles enabled (plus `POST`, required for any of those to activate).
The dashboard reaches it through a **second, independent** dockerode client
(`getMutatingProvider()` in `singleton.ts`, using `MUTATE_DOCKER_HOST`/
`MUTATE_DOCKER_PORT`) — never the same client, and never the same proxy container, as
the read-only side (`getRuntimeProvider()`, `DOCKER_HOST`/`DOCKER_PORT`).

**Why (the mid-implementation correction that produced this decision).** The FIRST
implementation pass proposed the obvious-looking approach: widen the *existing*
read-only proxy by adding `POST=1` plus the three `ALLOW_*` toggles to it, since it
was already running and already had `CONTAINERS=1` enabled for reads/inspect/logs.
Before shipping that, the proxy's real `haproxy.cfg` was fetched and read (not
assumed) to verify the change was actually safe — and it wasn't: in
`tecnativa/docker-socket-proxy`, the `CONTAINERS` toggle matches the broad
`/containers` path prefix for **both** GET and POST, with no method-level carve-out.
So a single proxy with `CONTAINERS=1` (needed for the existing reads) plus `POST=1`
(needed for mutations) would **also** have admitted `POST /containers/create` and
`POST /containers/prune` — silently reopening the exact host-root-equivalent
capability the read-only proxy was built in Phase 1 specifically to prevent. This
would have been a severe, easy-to-miss regression: correct-looking config, catastrophic
actual behavior.

Further reading of the same `haproxy.cfg` then revealed the fact that made a *better*
design possible: `ALLOW_START`/`ALLOW_STOP`/`ALLOW_RESTARTS` are **independent,
path-specific** rules that match only `/containers/{id}/(start|stop|restart|kill)` —
they do **not** require `CONTAINERS=1` to function at all. That meant a proxy could be
built with `CONTAINERS=0` and only those three toggles (plus `POST`) on, and it would
be physically unable to reach `/containers/create`, `/containers/prune`, `/containers`
(list), or `/containers/{id}/json` (inspect) — only the four specific lifecycle verbs
on a container whose ID it's given. This is the design that shipped: two proxies, two
dockerode clients, two genuinely isolated network paths — not one proxy shared by two
app-level code paths.

**Alternatives rejected.**
*Widen the existing read-only proxy with `POST=1` + the three `ALLOW_*` toggles* —
the originally proposed design; rejected once the real `haproxy.cfg` showed
`CONTAINERS` has no GET/POST carve-out, so this would have also opened
`/containers/create` and `/containers/prune` at the proxy layer, undermining the
entire Phase 1 read-only guarantee.
*Give the dashboard's Nitro process a raw `/var/run/docker.sock` mount for mutations
only, keeping the existing proxy for reads* — rejected for the same reason a direct
socket mount was rejected in Phase 1: the socket is host-root-equivalent and
undifferentiated once opened; there is no way to grant "just start/stop/restart" at
the socket level, only at the proxy/API level.
*Run a single proxy config with `CONTAINERS=1` but rely on the app layer to never
call `/containers/create` or `/containers/prune`* — rejected: this reduces "no
create/prune" to a property of this codebase's discipline rather than one enforced by
infrastructure, exactly the failure mode the original socket-proxy decision was
designed to avoid; a future contributor or a compromised dependency could bypass it
silently, and — separately — it wouldn't even be true, since the *proxy itself* would
still accept those calls from anything else that could reach it on the network, not
just from this app's code.

**Consequences.** Two proxy containers to run and reason about instead of one
(operational cost), and a second thing that can fail or be misconfigured
independently. In exchange: the mutate proxy is real, proxy-layer least privilege —
even a `POST` call crafted by hand against it can reach only the four lifecycle
sub-paths, never create/prune/exec/build/list/inspect — not merely an app-layer
promise on top of a wider grant. This is also why both proxy images are pinned to
`tecnativa/docker-socket-proxy:v0.4.2` rather than `:latest` (security review
finding, fixed before merge): the entire least-privilege argument above depends on
this exact image's ACL behavior in its `haproxy.cfg`, and a silent version bump could
change it without anyone noticing.

A residual risk remains and is deliberately accepted, not fixed here: the mutate
proxy has no concept of "which container is allowed" — only "which verbs are
reachable." Per-container scoping (`OPS_MANAGED_SERVICES`) is enforced entirely at the
app layer (`mutation-guard.ts`), not the proxy layer, because the Docker Engine API
itself has no per-container ACL to delegate to. Full detail:
[FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations).

**Revisit when.** Any future phase that considers exposing more mutating verbs (e.g.
`kill` directly, or anything beyond stop/start/restart) — re-verify against the then-
current `docker-socket-proxy` image version's ACL behavior before assuming the same
independence-from-`CONTAINERS` property still holds; do not assume it transfers to a
different verb or a different proxy image/version without checking.

---

## 2026-07-24 — Phase 2 mutation scope: stop/start/restart only; rebuild explicitly ruled out {#phase-2-mutation-scope-stopstartrestart-only-rebuild-ruled-out}

**Context.** Phase 2 build. The original ask for "mutating controls" was broad enough
to plausibly include stop, start, restart, rebuild, remove, disable, and exec. Phase 1
explicitly deferred all of it as "Phase 2 (mutating controls)" without further
scoping.

**Decision.** Phase 2 implements exactly three actions — stop, start, restart — via
`MutatingRuntimeProvider` (`server/runtime/mutating-types.ts`). "Disable" is treated
as a synonym for stop, not built as a separate mechanism. Rebuild, remove, and exec
are not implemented; rebuild specifically was evaluated and explicitly rejected as
out of scope, not merely deferred for time.

**Why.** Rebuild requires build-context/source access — the running container's image
would need to be reconstructed from a Dockerfile and build context, which this
standalone, copy-out-able project (see
[standalone/copy-out-able design](#standalone-copy-outable-design)) deliberately does
not have and does not want: giving a network-reachable dashboard the ability to
execute arbitrary `Dockerfile` build instructions is a fundamentally larger trust
boundary than starting/stopping/restarting an *already-built* container, and was
judged the single highest-RCE-risk capability named in the original ask. Remove and
exec were never actually requested in the original scope and share the same
"unbounded blast radius vs. narrow lifecycle management" problem, so they were left
out rather than added speculatively. "Disable" collapsing into "stop" avoided building
a second code path (with its own gate-checking and audit logging) that would do
nothing a plain stop doesn't already do — a stopped container stays stopped until
explicitly started again, which satisfies "disable" as stated.

**Alternatives rejected.**
*Implement rebuild, scoped to only the four platform Python services with known
Dockerfiles* — rejected: even scoped narrowly, this requires the dashboard to have
(or fetch) build context and invoke a build, which is a materially different and
larger capability than anything else in this project; the "narrow lifecycle
management of an already-existing container" framing that justifies the rest of
Phase 2 doesn't extend to it.
*Build "disable" as a distinct action/route from "stop," perhaps with a different
audit-log verb* — rejected: no behavioral difference from stop was ever identified;
a distinct mechanism would mean maintaining two gate-checked, audited code paths that
do the same thing.

**Consequences.** The mutating surface stays small and reviewable: three methods on
one interface (`MutatingRuntimeProvider`), three new routes, one guard function. An
operator who genuinely needs to rebuild a container still has to do so outside this
dashboard (e.g. `docker compose build` directly against the host) — an accepted
friction cost, not a gap expected to close in a later phase without a fresh, separate
scoping/approval discussion.

**Revisit when.** If a future phase is explicitly asked to add rebuild/remove/exec —
treat it as a new trust-boundary design exercise (likely needing its own proxy/access-
path story, mirroring how Phase 2 itself needed one relative to Phase 1), not an
incremental extension of `MutatingRuntimeProvider`.

---

## 2026-07-24 — Mutation audit trail: structured stdout JSON lines, no persistence, no per-user identity {#mutation-audit-trail-stdout-json-no-persistence}

**Context.** Phase 2 build, `mutation-guard.ts`. Every mutation attempt needed some
record of what happened, for after-the-fact review of who did what to which
container.

**Decision.** Every mutation attempt — denied by either gate, attempted, succeeded, or
errored — is emitted as one structured JSON line to stdout (`{"event":"ops.mutation",
"ts":...,"action":...,"containerId":...,"containerName":...,"service":...,
"allowed":...,"outcome":...}`), built through a single bound `audit()` closure inside
`runContainerMutation` so every call site shares one shape. There is no database
table, no log file, and no `principal`/`actor` field.

**Why.** This project owns no persistence layer in either phase — adding one solely
for an audit trail would be a disproportionate new dependency (a database, or at
minimum a file with rotation/retention concerns) for a small internal tool, and stdout
is already the right integration point for anyone who wants durable retention: this
dashboard is expected to run as a container, and container stdout is exactly what any
operator's existing log-aggregation setup already collects. The absence of a
`principal` field is not an oversight: this project authenticates with a single
shared `OPS_API_TOKEN`, not per-operator accounts, so there genuinely is no "who"
value to record beyond "someone holding the token" — inventing a fake identity field
that's always the same value would be actively misleading, implying a granularity of
accountability the auth model doesn't provide.

**Alternatives rejected.**
*Write audit entries to a local SQLite file or similar embedded database* —
rejected: introduces a persistence layer and its own failure modes (disk space,
corruption, concurrent-write handling) into a project whose whole architecture,
across both phases, has been "own no state, read/act on live Docker Engine state
only."
*Add a placeholder `principal`/`user` field populated with a static value like
`"shared-token"`* — rejected: a field that's always the same value adds noise
without adding information, and risks being read by a future maintainer as more
meaningful than it is.

**Consequences.** The audit trail is only as durable as wherever stdout is shipped —
an operator running the dashboard without a log-aggregation setup effectively has no
retained audit trail once the container's log buffer rotates. This is called out
explicitly in the audit-logging code's own comment and in
[FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations), not left
implicit.

**Revisit when.** If per-operator identity is ever added (see the residual-risk
discussion in [FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations)),
the audit entry shape should gain a real `principal` field at that point — not before.

---

## 2026-07-24 — Docker access via a `docker-socket-proxy` sidecar, never a direct socket mount {#docker-socket-proxy-not-a-direct-socket-mount}

**Context.** Phase 1 build ([`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md#change-set-phase-1-build--read-only-docker-observability-dashboard--2026-07-24)).
The dashboard needs to read container/network/volume state and stream logs from the
Docker Engine API.

**Decision.** The dashboard's own Nitro process never mounts or opens
`/var/run/docker.sock`. All Docker access goes over plain TCP to a
`tecnativa/docker-socket-proxy` sidecar (`docker-provider.ts` talks to it via
dockerode configured with `DOCKER_HOST`/`DOCKER_PORT`). The proxy is default-deny;
only `CONTAINERS`, `NETWORKS`, `VOLUMES`, `INFO`, and `PING` sections are enabled, and
`POST=0` is set explicitly in `docker-compose.ops.yml`.

**Why.** The Docker Engine API is host-root-equivalent: any process that can reach the
socket can ask the engine to launch a new container with an arbitrary bind mount of
the host filesystem (e.g. `-v /:/host`), then read/write anything on the host from
inside that new container — full host compromise, regardless of how confined the
*calling* container itself is. Mounting the socket `:ro` into a container does **not**
close this: `:ro` only makes the socket *file* read-only (the file can't be deleted or
replaced), it has no effect on which Docker API calls the process behind that socket
can make — every endpoint, mutating ones included, is still fully reachable through a
read-only-mounted socket. A socket-proxy is the only mechanism that actually enforces
"read-only" at the API-call level, by allowlisting specific URL sections and denying
`POST` outright.

**Alternatives rejected.**
*Mount `/var/run/docker.sock:ro` directly into the dashboard container* — rejected for
the reason above: it looks safe (the word "read-only" is right there in the mount
flag) but provides no actual mutation protection, since the Docker API itself doesn't
distinguish "read-only socket access" from "full access" — the socket is a single,
undifferentiated privilege boundary once opened.
*Give the dashboard the full Docker socket and rely entirely on the application layer
(UI + route handlers) to never call a mutating endpoint* — rejected: this makes "no
mutation" a property of this codebase's discipline rather than a property enforced
by infrastructure; a single bug, a future contributor adding a Phase-2-shaped route
without re-reading this doc, or a compromised dependency in the Node process would all
bypass it silently. The proxy makes "no mutation" true even if the application code
is wrong.
*Run the socket proxy in-process (embed a proxy library) rather than as a separate
sidecar container* — rejected: a separate container/process boundary is what
actually gives the guarantee; embedding it in the same Node process as the (much
larger, more frequently-changed) application code reintroduces exactly the shared-fate
risk sidecar isolation avoids.

**Consequences.** The dashboard genuinely cannot mutate Docker state even if a route
handler tried to — this is enforced by the proxy's allowlist, not by application code
review. The cost: an extra container to run (the proxy) in every deployment topology,
and a second thing (proxy reachability) that can fail independently of the dashboard
process itself — surfaced via `/api/ping` returning `false` rather than the dashboard
silently reporting stale/empty state.

**Revisit when.** Phase 2 (mutating controls) is approved — at that point a *second*,
separately-scoped proxy config (or a different access path entirely) will be needed for
the specific allowlisted mutating calls Phase 2 exposes; the existing read-only proxy
config should not simply be loosened.

**Addressed:** Phase 2 shipped 2026-07-24 — see
[Second, dedicated mutate-only `docker-socket-proxy`](#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one)
above for the resulting design (and the mid-implementation correction that produced
it). This entry's guidance — "don't simply loosen the existing read-only proxy" —
was followed.

---

## 2026-07-24 — Stack pivot: Python/FastAPI + 4th Vue workspace member → standalone Nuxt/Node {#stack-pivot-python-fastapi--4th-workspace-member-to-standalone-nuxtnode}

**Context.** The project was originally architected as a Python/FastAPI backend
service (consistent with this repo's existing `python/services/*` pattern) paired
with a 4th member of the `vue/` npm workspace that would consume
`vue/packages/lib`/`vue/packages/core` for its UI primitives, matching how `apps/
ecom-web` is structured.

**Decision.** Partway through, this was explicitly overridden: "build the entire
dashboard in Vue, standalone." The shipped implementation is Nuxt 4.5 + Nitro +
dockerode end-to-end — no Python component, no workspace membership, no dependency on
`vue/packages/lib` or `vue/packages/core`.

**Why.** The stated goal for this project was portability — "modular, so anyone can
use it" — meaning the whole point is that `vue/ops-dashboard/` should be copyable into
an unrelated repo and work unmodified. A Python/FastAPI backend would have added a
second language/runtime to stand up (and its own Dockerfile/CI lane) for a project
whose only real job is calling one HTTP-ish API (the Docker Engine API via the socket
proxy) and rendering the result — Node's dockerode client covers that directly, with
no cross-language boundary needed between "the server that talks to Docker" and "the
server that serves the UI." Depending on `vue/packages/lib`/`core` would also have
directly defeated the copy-out-able goal, since those packages don't exist outside
this monorepo.

**Alternatives rejected.**
*Keep the original Python/FastAPI + 4th-workspace-member plan* — rejected once the
standalone/portability requirement was made explicit; a cross-language split (Python
API + Vue frontend workspace member) is strictly harder to copy out of this repo
whole than a single self-contained Node project.
*Nuxt app as a proper `vue/apps/*` workspace member, consuming `packages/lib`* —
rejected for the same portability reason: workspace membership ties the project's
build to this monorepo's npm workspace resolution and to internal packages that don't
travel with it.

**Consequences.** The dashboard has its own `package.json`/`package-lock.json`/
`node_modules`, is not discovered by `vue/`'s npm workspaces glob, and its CI workflow
(`ci-ops-dashboard.yml`) deliberately does not reuse `_reusable-node-app-ci.yml` (that
template assumes workspace semantics this project doesn't have) — it runs its own
install/lint/type-check/test/build steps instead. Any future shared-UI-primitive work
done in `vue/packages/lib` will not automatically benefit this project; that's an
accepted, deliberate tradeoff of the portability goal, not an oversight.

**Revisit when.** If the standalone/portability goal is ever deprioritized in favor of
tighter integration with the rest of `vue/` (e.g. wanting to reuse `packages/lib`
components), this decision would need to be revisited alongside the CI workflow and
package.json structure.

---

## 2026-07-24 — Standalone, copy-out-able project structure {#standalone-copy-outable-design}

**Context.** Phase 1 build. Follows directly from the stack-pivot decision above.

**Decision.** `vue/ops-dashboard/` carries its own `package.json`/`package-lock.json`,
is excluded from `vue/package.json`'s `workspaces` globs (`["apps/*", "packages/*"]`),
and has zero imports from `vue/packages/lib` or `vue/packages/core`.
`docker-compose.ops.yml` is colocated inside `vue/ops-dashboard/` itself (not at the
repo root, unlike the platform's main `docker-compose.yml`).

**Why.** The explicit design goal is "copy the `ops-dashboard/` directory into any
other repo and it still works unchanged" (verbatim from the project's own README).
Anything that made the project reach outside its own directory — a shared package
dependency, a workspace-relative build config, a repo-root compose file — would break
that on day one.

**Alternatives rejected.**
*Root-level `docker-compose.ops.yml`, alongside the platform's main compose file* —
rejected: would make the ops-dashboard's own compose recipe depend on its position
relative to the rest of the repo, which a copy-out operation wouldn't preserve.
*Share ESLint/TypeScript base configs from elsewhere in `vue/`* — not done; the
project carries its own `eslint.config.mjs`/`tsconfig.json`, consistent with owning
its full toolchain rather than inheriting monorepo-relative config.

**Consequences.** Some duplication versus the rest of `vue/` (its own lint/type-check/
test tooling, its own lockfile, no shared version pinning with `apps/ecom-web`) — an
accepted cost of portability. `git status`/`git diff` at the repo root shows
`vue/ops-dashboard/` as a fully self-contained addition with no ripple into
`vue/package.json`'s workspace list.

---

## 2026-07-24 — Manual workarounds for apparent Nuxt/h3-v2 runtime bugs {#manual-workarounds-for-nuxt-h3-runtime-bugs}

**Context.** Phase 1 build, implementation phase. While wiring the auth middleware,
the log-streaming route, and query parsing, three framework helpers behaved
incorrectly at runtime on the bundled Nuxt 4.5 / h3 v2 versions: `getRequestHeader`
(assumes a web `Headers` object; throws against the plain-object header shape the
Nitro node build actually produces in some code paths), `getQuery` (didn't reliably
parse query strings off the already-resolved `event.url`/`event.path` in this build),
and `createEventStream().send()` (the h3 SSE helper) had reliability problems under
long-lived streaming connections.

**Decision.** Rather than chase the framework bug, each call site got a small, local,
manual replacement: `server/middleware/auth.ts`'s `readHeader()` (reads `event.req
.headers` defensively, branching on whether it's a `Headers` instance or a plain
object), `server/routes/api/containers/[id]/logs.get.ts`'s `readQuery()` (parses
`event.url.searchParams` directly, falling back to slicing `event.path`), and that
same route's hand-rolled SSE implementation (a raw `ReadableStream` wrapped in a
standard web `Response`, with its own heartbeat interval and explicit cleanup on
`cancel()`/stream end/error, instead of `createEventStream()`).

**Why.** These are narrowly-scoped, well-commented workarounds for what reads as
framework-version-specific breakage, not a rejection of the framework's intended
patterns. Given this is a small, standalone project without an internal team actively
tracking every Nuxt/h3 patch release, working around the specific broken call sites
directly was judged lower-risk and faster to verify (each workaround is covered by the
unit-test suite in `test/`) than pinning to a different Nuxt version and re-testing the
whole app's compatibility surface, or filing upstream and blocking on a fix.

**Alternatives rejected.**
*Downgrade/pin to an earlier Nuxt/h3 version known not to have these bugs* — not
attempted; would trade one set of unknowns (which earlier version is actually clean)
for another, and Nuxt 4.5 was the version already in use elsewhere when this was hit.
*File upstream issues and block on a fix* — rejected as impractical for a Phase 1
deliverable with a concrete deadline; nothing prevents filing them separately, but the
workarounds don't block on that happening.

**Consequences.** Three call sites carry non-idiomatic, manually-implemented logic
that duplicates what the framework's own helpers are supposed to do. This is a
maintenance liability if Nuxt/h3's actual API surface for these helpers changes shape
in a future major version — the manual code would need to be re-verified against the
new version, not just left in place. Flagged explicitly in
[`FutureWork.md`](./FutureWork.md) so a future Nuxt upgrade prompts someone to check
whether the underlying bugs are fixed and the workarounds can be deleted, rather than
carrying them forward indefinitely by default.

**Revisit when.** The next Nuxt major/minor upgrade for this project — re-test
`getRequestHeader`/`getQuery`/`createEventStream().send()` against the new version
before assuming the workarounds are still needed.

---

## 2026-07-24 — Token comparison hashes both inputs before `timingSafeEqual` {#hash-before-timingsafeequal}

**Context.** Phase 1 build, auth design (`server/runtime/token.ts`,
`server/middleware/auth.ts`).

**Decision.** `constantTimeEquals(a, b)` computes `sha256(a)` and `sha256(b)` (fixed
32-byte digests) and passes those to Node's `crypto.timingSafeEqual`, rather than
passing the raw presented/expected token strings directly.

**Why.** `timingSafeEqual` throws a synchronous exception if its two buffer arguments
have different lengths — and that exception path itself is a timing/behavioral side
channel: an attacker submitting a wrong-length token gets a fast, distinguishable
failure (thrown error) versus a right-length-but-wrong-content token's genuinely
constant-time comparison. Hashing both sides to a fixed-length digest first means
`timingSafeEqual` always receives equal-length (32-byte) inputs, so it can never take
the throwing branch — the length-mismatch case and the wrong-content case become
indistinguishable in timing and code path, which is the actual property a
constant-time comparison is supposed to guarantee end-to-end, not just inside the
library call.

**Alternatives rejected.**
*Manually pad/truncate the presented token to the expected length before calling
`timingSafeEqual`* — rejected: padding logic is easy to get subtly wrong (e.g. what
the pad byte reveals, whether truncation vs. padding is chosen based on a comparison
that itself leaks length) and reinvents what a digest already does correctly and
simply.
*Length-check first, return `false` immediately on mismatch* — rejected: this is
exactly the leaking short-circuit the hash-first approach avoids — an early return on
length gives an attacker a timing/response-shape oracle for the token's length before
any real comparison happens.

**Consequences.** Every token comparison, regardless of the presented value's length,
takes the same code path and (to the precision `timingSafeEqual` guarantees) the same
time. Verified in `test/token.test.ts`.

---

## 2026-07-24 — Container detail exposes environment variable keys only, never values {#env-keys-only-not-values}

**Context.** Phase 1 build, `DockerProvider.inspectContainer()`.

**Decision.** `ContainerDetail.envKeys` is a list of environment variable *names*
parsed off `info.Config.Env` (splitting each `KEY=VALUE` entry at its first `=`); the
values are discarded before the DTO is constructed and never sent to the client.

**Why.** Container environment variables routinely carry secrets (database
credentials, API keys, tokens for other services) by construction in this platform —
every one of the four Python services' Dockerfiles/compose config injects credentials
this way. A read-only observability tool whose entire security model rests on "no
mutation, but broad read access" would otherwise become the single easiest place to
exfiltrate every running container's secrets in plaintext, undermining the whole
socket-proxy trust-boundary design elsewhere in this project. Key names alone (e.g.
knowing a container has `DATABASE_URL` set) are useful for debugging "is this
configured at all" without disclosing the secret itself.

**Alternatives rejected.**
*Show values, with a hardcoded deny-list of well-known secret-shaped key names (e.g.
`*_KEY`, `*_TOKEN`, `*_PASSWORD`)* — rejected: a deny-list is enumerable and wrong by
default for any key that doesn't match a recognized pattern (e.g. a bespoke internal
secret name) — it fails open for the exact case that matters most.
*Show values but masked/truncated (e.g. first 4 characters)* — rejected: partial
disclosure of a secret is still disclosure, and a masked prefix is often enough to
narrow a brute-force or confirm a guessed value.

**Consequences.** An operator debugging a real config problem (e.g. "is `DOCKER_HOST`
actually reaching this container correctly") can see the key exists but must go
elsewhere (e.g. `docker inspect` with real socket access, or the platform's own
config source) to see the value — an accepted friction cost for not being a secrets
leak vector.

**Revisit when.** Never, absent a fundamentally different trust model (e.g. per-user
scoped access with an audit trail) that could justify value disclosure to a
specifically authorized operator — not planned in this phase or the next.

---

## 2026-07-24 — `HEALTHCHECK` directives added to four existing Python service Dockerfiles {#healthcheck-directives-added-to-existing-services}

**Context.** Phase 1 build. The dashboard's `/health` route aggregates each
container's `State.Health.Status` (via `normalizeHealthStatus` in
`server/runtime/parse.ts`) into a per-Compose-service rollup. Docker only populates
`State.Health` at all if the container's image defines a `HEALTHCHECK` — without one,
the field is simply absent and the container falls into the "no-healthcheck" bucket
regardless of whether it's actually behaving correctly.

**Decision.** Added an identically-shaped `HEALTHCHECK --interval=30s --timeout=3s
--start-period=10s --retries=3 CMD ...` directive (hitting each service's own
`/healthz`) to `python/services/{api_gateway,auth_service,product_service,
inventory_service}/Dockerfile`. No other line in any of the four files changed.

**Why.** Every one of these four services already exposes a `/healthz` endpoint (used
elsewhere in this platform), so this is exposing existing liveness information to
Docker's own health-tracking mechanism, not inventing a new health signal — the
dashboard's aggregated `/health` view would otherwise be structurally unable to report
anything more meaningful than "container is running" for the platform's own backend
services, which defeats a core stated goal of the feature.

**Alternatives rejected.**
*Have the dashboard itself poll each service's `/healthz` directly, bypassing Docker's
`State.Health`* — rejected: this would require the dashboard to know each service's
health-check URL/port out of band (breaking the "generic Docker observability tool"
shape of the project, which otherwise knows nothing about what any specific container
is or does) and would duplicate health-check logic Docker already provides a
standard mechanism for.
*Ship the dashboard without this companion change, document the gap instead* —
considered, but rejected once it was clear the fix was a single additive line per
Dockerfile with no behavioral risk — cheaper to fix than to carry as a permanently
documented limitation.

**Consequences.** A change that is conceptually part of the ops-dashboard feature
touches four files outside `vue/ops-dashboard/`'s own directory tree — worth knowing
for anyone reviewing "what changed" by directory alone. The change is purely additive
and backward compatible (see [`Changes.md`](./Changes.md)); it does not require a
version bump or migration for any of the four services.

**Revisit when.** Any other Python service is added to this platform — its Dockerfile
should get the same `HEALTHCHECK` pattern applied at creation time, not retrofitted
later as a gap.
