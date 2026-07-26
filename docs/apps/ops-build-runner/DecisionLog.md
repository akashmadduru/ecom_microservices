# Decision Log (ops-build-runner)

Append-only, scoped to `ops-build-runner/`. Most recent first. Never edit historical
entries except to mark them superseded. Audience: engineering. Related:
[`Feature.md`](./Feature.md), `docs/apps/ops-dashboard/DecisionLog.md` (why this is a
fourth, structurally separate subsystem rather than an extension of ops-dashboard's
existing Docker-socket-proxies).

---

## 2026-07-26 — Phase 2 orchestration go-live: Finding 2's hard gate closed by a fresh, separate re-confirmation (not inherited from Phase 1) {#phase-2-finding-2-fresh-reconfirmation}

**Context.** Phase 1's entry below (`#phase-1-two-blocking-findings-explicitly-accepted`)
closed with an explicit **Revisit when** clause for Finding 2 (network-level-only
isolation): "a hard blocking gate before Phase 2's real orchestration... ships — that
phase must either implement genuine host/VM-level isolation for the build/launch
execution surface, or bring this exact tradeoff back to the user for a fresh, explicit
accept/reject decision; it must not simply inherit this Phase 1 acceptance by default."
Phase 2 (this build: `GitCheckoutManager`, `RealGitAncestorGuard`, `BuildOrchestrator`,
`LaunchOrchestrator`, `src/worker.ts`, and the `build-daemon` service in
`docker-compose.yml`) is exactly that real orchestration. The implementer building this
phase halted before writing any orchestration code specifically on this gate, and
correctly declined to treat a plan description alone, or an unverified relayed claim of
user approval, as satisfying it — escalating for the gate to be closed properly before
proceeding. Recorded here per that requirement, sourced exactly as it reached this
document: relayed via the orchestrating agent (the only agent with a direct conversation
with the user in this session; subagents, including the implementer, have no separate
channel to the user) from two direct `AskUserQuestion` exchanges with the user in that
same conversation, quoted as given, not paraphrased by the implementer.

**First exchange (initial architecture question, earlier in the same conversation).**
Question: "Where will the isolated build daemon actually run?" Options offered: "Local
network segmentation only, for now (Recommended)" vs. "You'll provision a separate
VM/host yourself." **User's answer:** "Local network segmentation only, for now
(Recommended)."

**Second exchange (fresh re-confirmation at this specific go-live gate, per the
implementer's explicit insistence that Finding 2 not be closed by inheritance alone).**
Question, presented verbatim: "Confirm: proceed with Phase 2's real docker build/run
execution using network-segmentation-only isolation (rootless DinD, separate compose
network, no host/VM boundary) — same choice as before, now that it's about to become a
live, executing system rather than scaffolding?" Options offered, verbatim:

- "Yes, proceed as scoped (Recommended given earlier answer)" — description shown to the
  user: "Confirm the earlier decision applies here too. I'll have the implementer
  document this as a fresh, explicit re-confirmation in DecisionLog.md (not a silent
  carryover), then build the real orchestration."
- "No — require real host/VM isolation first" — description shown: "Pause Phase 2's
  orchestration. This means provisioning an actual separate VM/host for the build daemon
  before any real docker build/run code ships — real infrastructure work beyond what I
  can provision myself in this environment."

**User's answer:** "Yes, proceed as scoped (Recommended given earlier answer)."

**Decision.** Finding 2's hard gate is satisfied by the "fresh, explicit accept/reject
decision" branch of Phase 1's Revisit-when clause, not the "genuine host/VM-level
isolation" branch: Phase 2 ships with the SAME network-level-only isolation as Phase 1
(the isolated daemon is a sibling container on `ops_build_network`, not a separate
host/VM), now carrying the materially larger blast radius this entry restates plainly
below, with the user's own fresh decision on record for exactly this point rather than
an inherited Phase 1 default.

**The blast-radius change, stated plainly.** Phase 1 shipped a service that could only
accept or reject an API request — a compromise of `build-runner-api` or
`build-runner-db` could, at worst, forge/deny approval-workflow state. Phase 2 ships a
service that ACTUALLY EXECUTES `docker build` and `docker run` against a real (if
rootless) Docker daemon on `ops_build_network`. A compromise of `build-runner-api` now
means an attacker-controlled process that can direct real container builds/launches
against that daemon — a categorically larger capability than anything Phase 1's
scaffold-only build could do, bounded only by network segmentation and the rootless
daemon's own user-namespace boundary (see the next entry), not by a host/VM boundary.

**Why accept rather than require host/VM isolation now.** Same practical reasoning
Phase 1's entry gave for deferring Finding 2 in the first place, now revisited and
re-affirmed rather than assumed: provisioning a genuinely separate host/VM for the
build/launch execution surface is real infrastructure work outside what this
implementation environment can provision itself (see the second exchange's own
"No — require real host/VM isolation first" option description). The user, presented
with that concrete tradeoff a second time and told plainly what accepting it now means
(a live, executing system, not scaffolding), chose to proceed on the same basis as the
original architecture decision rather than pause for that infrastructure work.

**Alternatives rejected.** *Treat the plan document's description of network-only
isolation as itself satisfying the gate* — rejected: a plan/task description authored by
an agent is not the user's own accept/reject decision, which is exactly what this gate
requires; the implementer correctly declined to proceed on that basis alone.
*Treat the orchestrating agent's first, unverified relayed claim of user approval as
sufficient* — rejected for the same reason, until the orchestrating agent supplied the
actual verbatim question/option/answer record above and confirmed this relay is the only
channel by which user decisions reach a subagent in this session.
*Require real host/VM isolation before any Phase 2 code ships* — rejected, per the
user's own second answer above, which explicitly weighed and declined that option's
described cost ("real infrastructure work beyond what I can provision myself in this
environment").

**Consequences.** `docker-compose.yml`'s `build-daemon` service header comment and
`docs/apps/ops-build-runner/Feature.md`'s Known Limitations section both restate this
blast-radius change and the network-only posture, so an operator or reviewer encounters
it before assuming Phase 2 is fully isolated at the compute layer.

**Revisit when.** If this platform ever provisions genuine dedicated-host/VM isolation
infrastructure, `build-daemon` should move onto it and this entry should be marked
superseded. Until then, this is the operative decision for the build/launch execution
surface's isolation posture — not Phase 1's entry, which this one supersedes for
Finding 2 specifically (Finding 1, the shared-credential approval-workflow limitation, is
untouched by this entry and remains governed by Phase 1's own Revisit-when clause).

---

## 2026-07-26 — Rootless Docker-in-Docker instead of classic privileged DinD: a third, freely-available risk reduction {#rootless-dind-risk-reduction}

**Context.** Phase 2's `build-daemon` needs an actual Docker daemon to build/run
against, isolated from the rest of this platform. The two readily-available shapes for a
"Docker daemon running inside a container" are classic Docker-in-Docker (`docker:*-dind`,
which needs `--privileged` or an equivalent broad capability grant) and rootless
Docker-in-Docker (`docker:*-dind-rootless`, which runs dockerd inside user namespaces via
`rootlesskit`, needing no `--privileged` and no extra Linux capabilities beyond
`seccomp`/`apparmor` profile relaxations for rootlesskit's own namespace/mount setup).

**Decision.** Use rootless DinD (`docker:27-dind-rootless`, pinned). Not offered to the
user as a tradeoff, because it is not one: unlike Finding 2 (network-only isolation vs.
host/VM isolation), there is no cost or capability this project actually needs that
rootless DinD gives up relative to classic DinD -- builds are sequential, one at a time,
per the approved architecture's own scalability section (`src/worker.ts` serializes
them), so rootless DinD's single-daemon, non-Swarm posture is not a real limitation here.

**Why this matters, stated plainly.** A classic, privileged DinD container can typically
break out to the HOST KERNEL directly if compromised -- a kernel-level breakout is not
stopped by a Docker bridge network boundary at all, so running `build-daemon` as
privileged classic DinD would have UNDERCUT `ops_build_network`'s own segmentation (the
isolation boundary the entry above re-accepts), not merely left it unimproved. Rootless
DinD avoids that specific escalation path by construction (no `--privileged`, no
CAP_SYS_ADMIN-equivalent grant), narrowing the blast radius of a compromised build daemon
without touching the network-level-isolation tradeoff at all.

**This is a third accepted-risk-reduction, not a fourth blocking finding.** Findings 1
and 2 (Phase 1's entry) and the blast-radius change above (this phase's re-confirmation)
are places where a real gap remains and was knowingly accepted. This is different: the
safer option was available at no functional cost, so it was simply taken. Recorded here
for the same reason Phase 1's findings were recorded plainly -- so the security posture
of this stack is fully legible from its decision log, not just its code -- not because
this one carries residual risk requiring the user's own sign-off the way the two findings
above do.

**Alternatives rejected.** *Classic privileged DinD* — rejected for the kernel-breakout
reason above. *Skip DinD entirely and mount this host's own `/var/run/docker.sock` into
`build-runner-api`* — rejected: this is exactly the host-root-equivalent access pattern
`docs/apps/ops-dashboard/DecisionLog.md` already established this platform avoids
wherever an alternative exists (see that doc's own docker-socket-proxy rationale); a
rootless, isolated daemon is a materially narrower blast radius than the literal host
socket, and was readily available here.

**Consequences.** `docker-compose.yml`'s `build-daemon` service requires
`security_opt: [seccomp=unconfined, apparmor=unconfined]` and `devices: [/dev/fuse]` to
actually start (verified empirically: without both, `rootlesskit` fails immediately with
"failed to start the child: fork/exec /proc/self/exe: operation not permitted" before
dockerd ever starts) -- these are rootlesskit's own namespace/mount-setup requirements,
not a broader capability grant, and do not reintroduce `--privileged`'s host-kernel-
breakout exposure.

**Revisit when.** Never, absent Docker deprecating rootless DinD or a future phase
needing genuinely concurrent (not sequential) builds against this daemon, which would
require re-evaluating this daemon's architecture entirely regardless of privileged vs.
rootless.

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
