# Decision Log (ops-build-runner)

Append-only, scoped to `ops-build-runner/`. Most recent first. Never edit historical
entries except to mark them superseded. Audience: engineering. Related:
[`Feature.md`](./Feature.md), `docs/apps/ops-dashboard/DecisionLog.md` (why this is a
fourth, structurally separate subsystem rather than an extension of ops-dashboard's
existing Docker-socket-proxies).

---

## 2026-07-25 — Phase 1 foundation build: two blocking findings explicitly accepted in writing by the user {#phase-1-two-blocking-findings-explicitly-accepted}

**Context.** Phase 1 build ([`Feature.md`](./Feature.md)). Before any code was written,
the architecture behind this feature identified two structural findings that a
security-conscious review would ordinarily treat as blocking. Per this platform's SDLC
(`docs/SDLC.md`'s mandatory Approval Gate), a high-risk feature like this one cannot
proceed on an implementer's own judgment that these findings are "acceptable" — they
were surfaced explicitly, and the user accepted both **in writing**, before
implementation began. This entry restates both findings verbatim-in-spirit so neither is
ever later mistaken for an oversight discovered after the fact.

**Finding 1 — the approval workflow is not a real security boundary against a
compromised token.** This service, like `nuxt/ops-dashboard`, authenticates every
request with a single shared bearer credential (`BUILD_RUNNER_TOKEN`). The two-action
approval model (a build-approval code, then a separate launch-approval code, each
delivered out-of-band via Slack) raises the bar against **casual or accidental**
misuse — a request cannot be approved by the same actor who created it without a second,
independently-delivered code reaching *someone* with access to the Slack channel. But it
is **not** a security boundary against an attacker who already holds a valid
`BUILD_RUNNER_TOKEN`: nothing stops that attacker from also being the person who reads
the Slack channel (or from compromising the Slack webhook's destination), at which point
they can complete both approval steps themselves. The approval codes are a genuine
control against unattended/accidental triggering and against a token being used by
someone who is not also watching the approval channel — they are not a control against a
determined attacker who holds the credential and controls, or can intercept, the
notification channel too.

**Finding 2 — this local-dev pass provides network-level isolation only, not the full
dedicated-host/VM isolation the approved architecture specifies as necessary.**
`docker-compose.yml`'s `ops_build_network` is a real, separate Docker bridge network,
deliberately never connected to `ecom_network` or `nuxt/ops-dashboard`'s `ops_network` —
that absence is a genuine isolation boundary at the network level, and is not nothing.
But it is **not** the complete answer for a service whose eventual job (Phase 2) is to
execute `docker build`/`docker run` on behalf of an approved request — a capability that,
if this service's own process or its `build-runner-db` were compromised, has a
meaningfully larger blast radius than "can reach one more Docker bridge network." The
approved architecture's own stated requirement for the complete security guarantee is a
genuinely separate host or VM for this service's build/launch execution surface,
isolated from the rest of this platform's infrastructure at the compute layer, not just
the network layer. That does not exist yet; Phase 1 ships with network-level
segmentation only.

**Decision.** Proceed with Phase 1 (this scaffold-only build) with both findings
explicitly, knowingly accepted by the user — not fixed, not silently worked around, and
not glossed over in any summary of what shipped. Every place this matters is stated
plainly: this document, `docker-compose.yml`'s own header comment, `.env.example`'s
relevant comments, and [`Feature.md`](./Feature.md)'s Known Limitations section.

**Why accept rather than block.** Blocking Phase 1 entirely on either finding would mean
never building the scaffold, the data model, the allowlist, the state machine, or the
REST API at all — none of which is where either risk actually lives. Finding 1 is a
property of this platform's current single-shared-credential auth model broadly (the
same limitation `nuxt/ops-dashboard`'s `OPS_API_TOKEN` already carries, restated here
rather than newly introduced); fixing it would mean building a real per-operator
identity/account system, which is a materially larger undertaking than this phase and
was not asked for. Finding 2 is explicitly a **later-phase** concern in practice — Phase
1 ships no orchestration at all, so there is nothing yet running `docker build`/`docker
run` inside `ops_build_network` for the missing host/VM isolation to actually bound; the
finding is disclosed now, before Phase 2 exists, specifically so it is on record ahead of
the point where it becomes operationally load-bearing, not discovered retroactively once
Phase 2 ships.

**Alternatives rejected.**
*Defer this entire feature until a real per-operator identity system exists (closing
Finding 1 structurally)* — rejected: this platform's auth model is a standing,
platform-wide characteristic, not something this one feature can or should fix
unilaterally; every other credential in this platform (`OPS_API_TOKEN`,
`BUILD_RUNNER_TOKEN` itself) shares the same shape.
*Defer this entire feature until dedicated-host/VM isolation infrastructure exists
(closing Finding 2 structurally)* — rejected for Phase 1 specifically: no build/launch
execution exists yet in this phase for the missing isolation to actually bound, so
blocking scaffold-level work on infrastructure that a *later* phase will need is
premature; it will be revisited as a hard gate before Phase 2's orchestration ships (see
Revisit-when below).

**Consequences.** Anyone reading `Feature.md` or this service's own README encounters
both limitations before they encounter a claim that this workflow is "secure" in any
unqualified sense. `docker-compose.yml`'s header comment and `.env.example`'s relevant
sections restate Finding 2 specifically so an operator standing this up for the first
time sees it at the point of deployment, not only in this document.

**Revisit when.** Finding 2 is a **hard blocking gate before Phase 2's real
orchestration** (actual `docker build`/`docker run` execution) ships — that phase must
either implement genuine host/VM-level isolation for the build/launch execution surface,
or bring this exact tradeoff back to the user for a fresh, explicit accept/reject
decision; it must not simply inherit this Phase 1 acceptance by default. Finding 1
should be revisited if/when this platform ever adopts per-operator identity for any of
its shared-token surfaces (`OPS_API_TOKEN`, `BUILD_RUNNER_TOKEN`) — not planned
currently.

---

## 2026-07-25 — A fourth, structurally separate system, not an ops-dashboard extension {#fourth-structurally-separate-system}

**Context.** `nuxt/ops-dashboard` already runs three Docker-socket-proxies (read-only,
container-mutate, resource-mutate — see `docs/apps/ops-dashboard/DecisionLog.md`'s own
entries on each). The natural first question for a build+launch feature was whether it
belongs inside that same app as a fourth proxy/route surface.

**Decision.** No — `ops-build-runner` is a new, standalone service in its own top-level
directory, with its own `package.json`/lockfile/`tsconfig.json`/`Dockerfile`/test setup
and its own dedicated Postgres instance, per the monorepo's established convention that
each top-level component (`python/`, `vue/`, `nuxt/ops-dashboard/`) is independently
deployable (see the root `README.md`). It shares no dependency, no credential
(`BUILD_RUNNER_TOKEN` is new and separate from `OPS_API_TOKEN`), and no Docker-socket
access path with `nuxt/ops-dashboard`.

**Why.** `docs/apps/ops-dashboard/DecisionLog.md` already establishes, across three
separate entries, that `tecnativa/docker-socket-proxy` has no per-verb carve-out that
would let a fourth proxy instance safely admit `docker build`/container-create without
also reopening capabilities those three existing proxies were each deliberately built to
exclude (see that doc's "Second, dedicated mutate-only proxy" and "Phase 5... Option A"
entries for the verified `haproxy.cfg` findings this conclusion rests on). Build+launch
is also a categorically larger trust boundary than anything ops-dashboard's existing
mutation surface (stop/start/restart, named remove/prune) ever took on — `docs/apps/
ops-dashboard/DecisionLog.md`'s Phase 2 entry explicitly ruled out "rebuild" for exactly
this reason ("giving a network-reachable dashboard the ability to execute arbitrary
Dockerfile build instructions is a fundamentally larger trust boundary"). A genuinely new
trust boundary gets a genuinely separate system, own credential, own audit trail, own
data store — not a fourth proxy bolted onto an app whose entire existing security
argument depends on staying narrowly scoped.

**Alternatives rejected.**
*A fourth `docker-socket-proxy` instance inside `nuxt/ops-dashboard`, following the
existing three-proxy pattern* — rejected: no proxy-layer configuration of that image
admits `docker build`/container-create without also admitting create/pull/push/exec-
adjacent capabilities those existing three proxies were each built specifically to deny;
this is not a gap a fourth instance of the same image can close.
*A new route/module inside `nuxt/ops-dashboard` that shells out to `docker build`
directly, bypassing the socket-proxy pattern entirely* — rejected: this would reintroduce
exactly the host-root-equivalent risk the read-only proxy (Phase 1 of ops-dashboard) was
built to eliminate, inside the same process as that app's much larger, more
frequently-changed UI/route surface.

**Consequences.** Two services to run/deploy/monitor instead of one for the platform's
Docker-adjacent tooling. In exchange: `ops-build-runner`'s compromise (or misconfigured
deployment) cannot, by construction, also compromise `nuxt/ops-dashboard`'s read-only
guarantee or its existing mutation gates, and vice versa — the two systems share nothing
to fail together on.

**Revisit when.** Never, absent a fundamentally different Docker-access architecture for
this platform that neither this decision nor `nuxt/ops-dashboard`'s own decision log
currently anticipates.
