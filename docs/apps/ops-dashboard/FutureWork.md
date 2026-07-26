# Future Work (ops-dashboard)

Open items surfaced during the Phase 1 through Phase 6 builds, grouped by change set,
most urgent first within each group. Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md), [`DecisionLog.md`](./DecisionLog.md).

---

## Phase 6 build — read-only Dockerfile discovery

Related: [`Feature.md`](./Feature.md#phase-6-read-only-dockerfile-discovery),
[`Changes.md`](./Changes.md#change-set-phase-6-build--read-only-dockerfile-discovery--2026-07-25),
[`DecisionLog.md`](./DecisionLog.md#phase-6-ci-time-manifest-snapshot-not-a-runtime-bind-mount).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| The Dockerfile-discovery feature is the one part of this project that is NOT copy-out-able unchanged | Debt/DX | Medium (explicitly accepted and disclosed, not a silent gap) | The 7-entry allowlist and `scripts/snapshot-dockerfiles.mjs` hardcode monorepo-relative paths. Copying `ops-dashboard/` into another repo will leave every other page/route working, but this one feature will not work unmodified. Disclosed in the script's own doc comment, README.md, and DecisionLog — revisit only if this project's copy-out-able goal is ever prioritized above this feature's convenience. |
| The manifest cache (`dockerfile-registry.ts`) is loaded once per process lifetime, not re-read if the manifest changes on disk while the server is running | Debt/DX | Low | Mirrors this app's existing lazy-singleton pattern (dockerode clients in `singleton.ts`), reasonable for a small tool restarted on every deploy whose manifest is itself a build-time artifact. A developer regenerating the manifest mid-`npm run dev` session would need to restart the dev server to see the change — not expected to be a real friction point in practice. |
| No frontend/component tests for `dockerfiles.vue`/`dockerfiles/[id].vue` | Test/DX | Low | Consistent with the pre-existing, carried-forward Phase 1 gap ("no tests for the Nuxt SPA pages/components themselves") — the 197-test suite covers the new parser/registry logic exhaustively but not Vue component rendering, same as every prior phase's equivalent note. |
| The fixed 7-Dockerfile allowlist requires a manual code change (both the snapshot script and, implicitly, nothing else) whenever a new service/Dockerfile is added to this monorepo | Feature/DX | Low (deliberate design, not a gap) | A real filesystem glob was explicitly rejected in favor of a fixed, hardcoded allowlist (see DecisionLog) — a new service's Dockerfile will not automatically appear in `/dockerfiles` until `scripts/snapshot-dockerfiles.mjs`'s `FIXED_ENTRIES` array is updated by hand. Accepted tradeoff for "never a filesystem glob," mirroring this project's general preference for explicit, reviewable allowlists over automatic discovery (e.g. `OPS_MANAGED_SERVICES`/`OPS_MANAGED_VOLUMES`/`OPS_MANAGED_NETWORKS`). |
| CI's `paths:` trigger for `ci-ops-dashboard.yml` does not include the 6 other services' Dockerfile paths | DX | Low | Editing e.g. `python/services/api_gateway/Dockerfile` alone will not re-trigger this workflow, even though the resulting manifest snapshot (once regenerated) would differ — not treated as a correctness bug since the manifest is regenerated fresh on every real trigger of this workflow anyway (nothing stale ships), just a "the CI badge won't reflect that specific edit" DX gap. Not addressed this phase to keep the trigger-path change minimal and reviewable; candidate follow-up if this is ever reported as confusing. |

### Deferred Technical Debt

- **The copy-out-able exception is permanent, not temporary** — accepted at
  design time, not an oversight to close later. See the backlog row above and
  [DecisionLog](./DecisionLog.md#phase-6-ci-time-manifest-snapshot-not-a-runtime-bind-mount).
- **The fixed 7-entry allowlist requires manual maintenance as this monorepo's
  own service list changes** — deliberate (never a filesystem glob), not a gap.

### Architecture Evolution Candidates

- **A custom, verb-scoped mechanism for auto-discovering new services'
  Dockerfiles** (e.g. a repo-wide convention/manifest file every service
  maintains, that this snapshot script reads instead of a hardcoded array)
  would remove the manual-maintenance cost above, at the cost of no longer
  being a simple, fully-reviewable fixed allowlist. Not planned — the fixed
  allowlist was a deliberate choice this phase made, not a placeholder for
  this idea.
- **Build/rebuild/launch capability from a displayed Dockerfile** — explicitly
  out of scope for this phase and not an implicit next step; a separate, much
  larger, separately-scoped system, mirroring how Phase 2's rebuild was
  evaluated and explicitly ruled out for containers. See
  [Explicitly out of scope](./Feature.md#phase-6-explicitly-out-of-scope).

---

## Phase 5 build — gated image/volume/network mutations (named remove + prune)

Related: [`Feature.md`](./Feature.md#phase-5-gated-imagevolumenetwork-mutations),
[`Changes.md`](./Changes.md#change-set-phase-5-build--gated-imagevolumenetwork-mutations-named-remove--prune--2026-07-25),
[`DecisionLog.md`](./DecisionLog.md#phase-5-resource-mutations-option-a-app-layer-narrowing-third-proxy).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| `docker-socket-proxy-mutate-resources` has no per-verb carve-out — enabling it also technically admits pull/create/push/connect at the proxy layer | Security | Medium (explicitly accepted at an Approval Gate, not a silent gap) | This is the Option A tradeoff itself, not a bug found afterward. Narrowed at the app layer (`docker-resource-mutating-provider.ts` never issues those verbs), same shape as the pre-existing `ALLOW_RESTARTS`/`kill` precedent. Revisit if a future review judges this unacceptable — Option D (a custom, verb-scoped proxy) is the concrete next step, not a config tweak. See [DecisionLog](./DecisionLog.md#phase-5-resource-mutations-option-a-app-layer-narrowing-third-proxy). |
| The volume/network client-side gate (`VolumeActions.vue`/`NetworkActions.vue`) compares `name`, but the server-side gate compares the `com.docker.compose.volume`/`com.docker.compose.network` LABEL value | Debt/DX | Low (server-side gate is the actual authority either way) | A volume/network whose name differs from its own compose-label value would show (or hide) a Remove button that the server would then correctly 403 (or allow). Not a security gap — the server re-derives the real label and is never fooled by the client's approximation — but a possible source of a confusing "button showed, then 403'd" UX for an unusual naming setup. Candidate fix: have `resource-mutations-config` (or a per-resource endpoint) return the actual label value per resource so the client can match exactly, if this is ever reported as a real annoyance. |
| No frontend/component tests for `ImageActions.vue`/`VolumeActions.vue`/`NetworkActions.vue` or the updated list/detail pages | Test/DX | Low | Consistent with the pre-existing, carried-forward Phase 1 gap ("no tests for the Nuxt SPA pages/components themselves") — the 185-test suite covers the new server-side gate/provider/route logic exhaustively but not Vue component rendering, same as every prior phase's equivalent note. |
| Phase 5 was not exercised against a real Docker Engine / real `docker-socket-proxy` instance | Test/Debt | Medium | Consistent with every prior Docker-mode phase in this project — verified via unit tests against dockerode/RuntimeProvider mocks, not an integration test against a live proxy. A real end-to-end run (enable all the switches, remove a real dangling image/unused volume/unused network through the UI) is the natural verification milestone before treating this phase as fully confirmed in a live deployment. |
| Images have no configurable managed-list, only a state-based check | Feature | Low (deliberate design, not a gap) | An operator cannot restrict image removal to a named subset the way `OPS_MANAGED_VOLUMES`/`OPS_MANAGED_NETWORKS` do for those resource types — "zero references" is the only eligibility rule. This is documented as a deliberate deviation (images have no Compose-label identity to allowlist against), not an oversight; revisit only if a future need for finer-grained image allowlisting is identified. |

### Deferred Technical Debt

- **The Phase 5 resource-mutate proxy's broader residual risk (pull/create/push/connect
  technically reachable at the proxy layer) is a permanent, accepted tradeoff of Option
  A, not temporary** — mirrors how Phase 2's own residual risk (no per-container ACL at
  the proxy layer) is carried forward rather than treated as an open bug. See the
  backlog row above and [DecisionLog](./DecisionLog.md#phase-5-resource-mutations-option-a-app-layer-narrowing-third-proxy).
- **Phase 5's client-side name-based allowlist approximation for volumes/networks** is a
  one-time, already-documented simplification, not an ongoing concern — see the backlog
  row above and each component's own doc comment.
- **Phase 5 inherits the project's standing "no live-proxy integration test" gap** —
  carried forward alongside Phase 1/2's own equivalent items, not tracked as a new,
  separate debt item.

### Architecture Evolution Candidates

- **A custom, verb-scoped Docker socket proxy (Option D from the Phase 5 Approval
  Gate)** would close the residual proxy-layer risk described above properly, rather
  than relying on app-layer discipline for images/volumes/networks the way this phase
  does. Explicitly not built this phase — judged disproportionate to the benefit given
  the already-accepted, structurally identical `ALLOW_RESTARTS`/`kill` precedent — but
  listed here as the concrete next step if that judgment ever changes.
- **Real-cluster verification pass** (carried forward from Phase 3/4) remains this
  project's top overall architecture-evolution candidate — see the Phase 3 section
  below. Not directly relevant to Phase 5 (which is Docker-only and rejects kubernetes
  mode outright), but still the standing top item for the project as a whole.
- **Image pull/push, or volume/network create/connect**, if ever requested, would need
  the same kind of fresh scoping/trust-boundary design Phase 5 itself needed relative to
  Phase 4 — explicitly not planned today, listed here only so it isn't mistaken for
  "just not built yet."

---

## Phase 4 build — read-only image listing/inspect + detail-view gaps

Related: [`Feature.md`](./Feature.md#phase-4-read-only-image-listinginspect--detail-view-gaps),
[`Changes.md`](./Changes.md#change-set-phase-4-build--read-only-image-listinginspect--two-pre-existing-detail-view-gaps--2026-07-25),
[`DecisionLog.md`](./DecisionLog.md#volumesummaryid-and-networksummaryid-are-namespace-qualified-in-kubernetes-mode-phase-4).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Kubernetes-mode image data is structurally thinner than Docker's | Debt/Feature | Low (permanent structural gap, not a bug) | `size`, `createdAt`, `labels`, `layers`, `history` are all `null`/`{}` in kubernetes mode — there is no per-image Kubernetes API to source any of it from. This is carried forward as a permanent, documented limitation the same way Phase 3's health-derivation and RBAC-asymmetry gaps are — not something a future patch is expected to close. |
| Phase 4's new Kubernetes-mode code (`inspectNetwork`, `inspectVolume`, `listImages`, `inspectImage`) inherits the pre-existing "unverified against a real cluster" gap | Test/Debt | High (same priority as the carried-forward Phase 3 item below) | Exercised only against hand-written `@kubernetes/client-node` mocks, exactly like every other Phase 3 method — no new live-cluster testing was introduced or attempted this phase. When the Phase 3 real-cluster verification milestone finally happens, these four methods should be included in that pass, not treated as separately already-verified. |
| `NetworkSummary.id`'s value changed in kubernetes mode (uid → `namespace_name`) | Debt | Low (one-time, already communicated) | A real response-shape change for any existing kubernetes-mode `/api/networks` consumer, even though nothing inside this app depended on the old value (no detail route existed to round-trip it before this phase). Called out in [`Changes.md`](./Changes.md#change-set-phase-4-build--read-only-image-listinginspect--two-pre-existing-detail-view-gaps--2026-07-25)'s Breaking Changes and [DecisionLog](./DecisionLog.md#volumesummaryid-and-networksummaryid-are-namespace-qualified-in-kubernetes-mode-phase-4); no further action expected unless an external consumer reports breakage. |
| No mutating capability added for images/networks/volumes | Feature | Low (deliberately out of scope, not deferred for time) | Mirrors Phase 2's own scoping discipline: this phase is a narrow read-only extension, not a step toward image pull/remove/prune or network/volume create/remove. Any future ask for that needs its own scoping/approval pass and its own trust-boundary design (a registry-pull capability in particular would be a materially different, larger surface than anything shipped so far — closer in spirit to Phase 2's rejected "rebuild" than to stop/start/restart). **Addressed in part:** Phase 5 (2026-07-25) added named remove + prune for all three resource types via exactly the fresh scoping/approval pass this row anticipated — pull/push/create/connect remain out of scope, unchanged. See [Phase 5 build](#phase-5-build--gated-imagevolumenetwork-mutations-named-remove--prune) above. |
| No frontend/component tests for the four new pages (`images.vue`, `images/[id].vue`, `networks/[id].vue`, `volumes/[id].vue`) | Test/DX | Low | Consistent with the pre-existing, carried-forward Phase 1 gap ("no tests for the Nuxt SPA pages/components themselves") — the 152-test suite covers the new server-side logic exhaustively but not Vue component rendering. Candidate for coverage expansion if the UI grows, same reasoning as every prior phase's equivalent note. |
| Kubernetes's `inspectNetwork` pays a real extra network round-trip (the labelSelector-scoped pod query) beyond the base `readNamespacedService` call | Perf | Low (informational, accepted tradeoff) | Exactly the tradeoff `listNetworks()`'s own FutureWork entry anticipated when flagging this as the natural place to pay the N+1 cost — acceptable at single-resource detail scale, would not be at list scale (which is why `listNetworks()` itself still doesn't do it). Not expected to matter in practice for a human clicking into one network's detail page. |

### Deferred Technical Debt

- **Kubernetes-mode image data's structural thinness (`size`/`createdAt`/`labels`/
  `layers`/`history` all absent) is permanent, not temporary** — there is no
  Kubernetes API this could be sourced from for a bare image reference. Mirrors
  Phase 3's own "documented approximation, not a bug" framing for its other
  Docker-concept mappings.
- **The `NetworkSummary.id` value change in kubernetes mode is a one-time,
  already-fully-documented breaking change**, not an ongoing concern — see the
  backlog row above.
- **Phase 4's Kubernetes-mode additions inherit Phase 3's unverified-against-a-
  real-cluster status** — carried forward into that same open item, not tracked
  separately. See
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster).

### Architecture Evolution Candidates

- **Real-cluster verification pass** (carried forward from Phase 3, now also
  covering Phase 4's four new Kubernetes-mode methods) remains this project's top
  architecture-evolution candidate overall — see the Phase 3 section below.
- **Image pull/remove/prune, or network/volume create/remove**, if ever requested,
  would need the same kind of fresh scoping/trust-boundary design Phase 2's
  mutating surface needed relative to Phase 1 — explicitly not planned today, and
  listed here only so it isn't mistaken for "just not built yet."

---

## Phase 3 build — generic read-only Kubernetes backend

Related: [`Feature.md`](./Feature.md#phase-3-generic-read-only-kubernetes-backend),
[`Changes.md`](./Changes.md#change-set-phase-3-build--generic-read-only-kubernetes-backend--2026-07-24),
[`DecisionLog.md`](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| **Verify against a real Kubernetes cluster.** | Test/Debt | **High — the single most important open item from this phase** | This entire phase was built, reviewed, and shipped without ever running against a live cluster (no kubeconfig, no kind/minikube in the build environment) — an explicit, informed decision, not an oversight. Every Kubernetes interaction is exercised only via hand-written mocks of `@kubernetes/client-node`'s published contract. Treat the FIRST real run against any live cluster (kind/minikube as a first step; a real EKS cluster once `terraform/` provisions one, as the fuller test) as a verification milestone, not an afterthought — run `listContainers`/`inspectContainer`/`streamLogs`/`listNetworks`/`listVolumes` against it and record what was confirmed / what needed fixing. See [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster). |
| Kubernetes RBAC is guidance only — this app cannot enforce or verify the actual scope of the credential it's handed | Security | Medium-High (accepted, inherent — not a bug) | Unlike Docker mode's app-controlled socket-proxy, there is no enforcement layer inside this app for Kubernetes access: whatever the ambient kubeconfig grants, the app has. `k8s/ops-dashboard-readonly-rbac.yaml` is guidance for the operator to bind their own identity to, not something checked or enforced in code. A future enhancement could add a `SelfSubjectAccessReview` pre-flight check purely as an informational warning (it cannot restrict access, only report on it) if this is ever judged worth the added complexity. See [DecisionLog](./DecisionLog.md#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode). |
| No EKS-specific integration (IAM auth, cluster discovery) | Feature | Low (deliberately out of scope) | Phase 3 is generic-Kubernetes-only by design — it relies on the operator having already run `aws eks update-kubeconfig` (or equivalent) themselves. An EKS-specific integration was evaluated and rejected in favor of genericity, consistent with this project's portability goal. See [DecisionLog](./DecisionLog.md#generic-kubernetes-provider-via-ambient-kubeconfig). Revisit only if a concrete need for in-app cluster provisioning/discovery emerges — not planned. |
| `resolvePodService`'s ReplicaSet → Deployment name derivation strips a pod-template-hash suffix via a regex heuristic, not a real Deployment lookup | Debt | Low | Deliberate — avoids requiring RBAC on `replicasets`/`deployments` this app doesn't otherwise need (see `deploymentNameFromReplicaSet`'s own doc comment). A ReplicaSet name that doesn't match the expected `<name>-<hash>` shape falls back to the literal ReplicaSet name, which would show as a slightly-off "service" grouping in the health rollup for non-standard manifests. Not observed as a problem against any real workload yet (see the cluster-verification item above — this is exactly the kind of edge case a real cluster run would surface). |
| ~~`listNetworks`'s Service→pod mapping is deliberately empty (`containers: []`)~~ | Debt/Feature | **Done — Phase 4 added `/networks/:id`, 2026-07-25** | Resolving backing pods per Service would require an N+1 labelSelector query per Service on a list endpoint — deliberately skipped at list scale; `listNetworks()` itself is unchanged. Phase 4's `inspectNetwork` now does the one extra query at single-resource scale, exactly the follow-up this row originally named. See the [Phase 4 build](#phase-4-build--read-only-image-listinginspect--detail-view-gaps) section below. |
| No frontend/component changes were needed for Phase 3, so there's no new frontend test coverage to speak of, but the existing "no component tests" gap (carried from Phase 1/2) now also applies implicitly to whether `ContainerActions.vue` correctly stays hidden in kubernetes mode | Test/DX | Low | `GET /api/mutations-config` still reports gate state; in kubernetes mode `mutationsAllowed` is only true if `OPS_ALLOW_MUTATIONS=true` was also set, which would make the config endpoint say mutations are "allowed" even though the actual mutation routes would 501 — the frontend has no explicit kubernetes-mode awareness. Worth a small follow-up: either have `/api/mutations-config` report `allowed: false` outright in kubernetes mode, or add an explicit test confirming the UI degrades gracefully (a 501 on click, not a broken button) rather than assuming it. |
| Kubernetes mode's `ping()` uses `GET /version`, a cheap but different reachability signal than Docker mode's `PING` | DX | Low (informational) | Not a bug — both are cheap, unauthenticated-content reachability probes appropriate to their respective backend — but worth noting for anyone debugging "the dashboard says the engine is unreachable" across the two modes, since the actual failure surface differs (proxy-down vs. API-server-down/kubeconfig-invalid). |

### Deferred Technical Debt

- **Phase 3 is unverified against a real cluster — this is carried forward as
  technical debt, not just a one-time caveat, until it is closed by a real run.** See
  the backlog row above and
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster).
  Do not treat any Kubernetes-path behavior as confirmed correct until this is done.
- **The RBAC guidance/enforcement asymmetry is a permanent architectural property of
  using Kubernetes this way, not a bug to schedule a fix for** — mirrors the
  equivalent Phase 2 note about the mutate-proxy's lack of per-container ACL. See
  [DecisionLog](./DecisionLog.md#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode).
- **No EKS-specific auth/discovery** — deliberate, not planned absent a concrete new
  requirement. See
  [DecisionLog](./DecisionLog.md#generic-kubernetes-provider-via-ambient-kubeconfig).

### Architecture Evolution Candidates

- **Real-cluster verification pass**, promoted here as the top architecture-evolution
  candidate for this project generally, not just a backlog line item — see the
  backlog row above. This should also be the point at which any mocked assumptions
  that turn out wrong get corrected and this FutureWork entry updated to reflect what
  was actually found.
- ~~**A `/networks/:id` and `/volumes/:id` detail view**~~ — **done, shipped
  2026-07-25.** See the [Phase 4 build](#phase-4-build--read-only-image-listinginspect--detail-view-gaps)
  section above for what shipped (including the `VolumeSummary.id`/
  `NetworkSummary.id` correction it required) and what's still open from it.
- **Kubernetes-mode-aware `/api/mutations-config`** — have it explicitly report
  `allowed: false` when `runtimeMode === 'kubernetes'`, regardless of
  `OPS_ALLOW_MUTATIONS`, so the frontend gate and the actual route behavior can never
  disagree. Small, not yet done.

---

## Phase 2 build — gated container mutations

Related: [`Feature.md`](./Feature.md#phase-2-gated-container-mutations),
[`Changes.md`](./Changes.md#change-set-phase-2-build--gated-container-mutations-stopstartrestart--2026-07-24),
[`DecisionLog.md`](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Rebuild / remove / exec capability | Feature | Low (explicitly ruled out for now) | Rebuild was evaluated and explicitly rejected as out of scope — it requires build-context/source access this standalone project deliberately doesn't have, and was judged the single highest-RCE-risk capability named in the original ask. Remove/exec were never requested. Any future work here needs its own scoping/approval pass and its own trust-boundary design, not an incremental extension of the current `MutatingRuntimeProvider`. See [DecisionLog](./DecisionLog.md#phase-2-mutation-scope-stopstartrestart-only-rebuild-ruled-out). |
| Per-operator identity / real audit trail | Security/Feature | Medium-High | Now that mutating actions exist (not just reads), "who stopped/restarted this container" is a real operational question the current shared-token model cannot answer — the audit log records the action, not the actor. Was acceptable to defer for Phase 1's read-only scope; the bar is higher now that state-changing actions are live. Needs a real identity layer (even lightweight per-operator tokens) before this matters at scale. See [DecisionLog](./DecisionLog.md#mutation-audit-trail-stdout-json-no-persistence). |
| Mutate-proxy has no per-container ACL — allowlist scoping lives only at the app layer | Security | Medium (accepted residual risk, not a bug) | `docker-socket-proxy-mutate` can only restrict WHICH VERBS (start/stop/restart/kill) are reachable, not WHICH CONTAINER IDS — the Docker Engine API itself has no per-container ACL to delegate to. `OPS_MANAGED_SERVICES` is enforced entirely in `mutation-guard.ts`. Consequence: if the dashboard's own server process were ever compromised (e.g. a future dependency RCE), an attacker with direct network access to the mutate-proxy could stop/start/restart/kill ANY container on the host, not just allowlisted ones — the allowlist protects against a well-behaved dashboard being pointed at the wrong target, not against a fully compromised dashboard process. Mitigated today by: mutations off by default; the mutate-proxy having zero read/list/inspect capability of its own; network isolation (`ops_network`, not published to the host). Not fixable by more proxy config — inherent to how the Docker Engine API works. See [DecisionLog](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one). |
| Audit trail durability depends entirely on the operator's own log shipping | Security/DX | Low-Medium | Audit lines go to stdout only — no database, no file, no built-in retention. An operator who doesn't ship container logs somewhere durable effectively loses the audit trail once the log buffer rotates. Deliberate (this project owns no persistence layer in either phase), but worth calling out explicitly for anyone deploying Phase 2 mutations in a context where after-the-fact review actually matters. See [DecisionLog](./DecisionLog.md#mutation-audit-trail-stdout-json-no-persistence). |
| `ALLOW_RESTARTS` on the mutate proxy also permits `kill`, not just `restart` | Security | Low (informational, security-review finding) | The app exposes no `kill` route, but the underlying proxy toggle admits `POST /containers/{id}/kill` to anything that can reach the proxy directly, regardless of what this app's own routes expose. Noted in `docker-compose.ops.yml`'s comments; not currently mitigated beyond documentation, since the same network-isolation argument that bounds the ACL-scoping risk above also bounds this one. |
| Benign TOCTOU between the read-only proxy's inspect call and the mutate-proxy's action call in `mutation-guard.ts` | Security | Low (informational, security-review finding, judged non-exploitable) | A container's compose service could theoretically change between the allowlist check (via the read-only inspect) and the actual stop/start/restart call. Judged non-exploitable in practice: compose labels are immutable for a given container's lifetime and Docker container IDs are not recycled, so there is no realistic sequence that swaps a disallowed container in during that narrow window. Not fixed; flagged here in case that assumption ever needs re-verifying (e.g. if a future Docker Engine version changes ID-recycling behavior). |
| No frontend/component tests for `ContainerActions.vue` | Test/DX | Low | The 77-test suite (up from 65 at end of Phase 1) covers the new server-side logic (`docker-mutating-provider.test.ts`, `mutation-route.test.ts`, `container-request.test.ts`) but, consistent with the existing gap noted below for Phase 1 components, does not cover the new Vue component's rendering/gating logic directly. Same reasoning as the pre-existing gap: reasonable for a tool of this size, candidate for coverage expansion if the UI grows. |
| `docker-compose.ops.yml`'s mutations-enabled state (all seven Phase 2 toggles set) is never run against a real Docker Engine in CI | DX/Test | Low | Mirrors the pre-existing Phase 1 gap (see below) — `ci-ops-dashboard.yml` verifies `docker compose config` is valid in both the default and mutations-enabled states, but doesn't bring either up against a live engine. Same cost/benefit judgment as Phase 1: not worth the CI complexity yet, flagged in case a later phase raises the stakes. |

### Deferred Technical Debt

- **Rebuild/remove/exec remain unimplemented and are not simply "coming later."**
  Rebuild in particular was actively rejected, not deferred for lack of time — see
  [DecisionLog](./DecisionLog.md#phase-2-mutation-scope-stopstartrestart-only-rebuild-ruled-out).
  Any future request to add them needs a fresh scoping/approval conversation.
- **The mutate-proxy's lack of per-container ACL is a permanent architectural
  property of using the Docker Engine API this way, not a bug to schedule a fix
  for.** See the backlog row above and
  [DecisionLog](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one).
  The mitigations (mutations off by default, mutate-proxy has zero read capability,
  network isolation) are the accepted long-term posture, not a stopgap.
- **Single shared bearer token now gates state-changing actions, not just reads.**
  Carried forward from Phase 1's equivalent item below, but the stakes are higher now
  — see the backlog row above.

### Architecture Evolution Candidates

- **Per-operator identity/audit trail**, promoted from a Phase 1 "nice to have" to a
  more pressing candidate now that mutating actions exist — see the backlog row
  above and [DecisionLog](./DecisionLog.md#mutation-audit-trail-stdout-json-no-persistence).
- **A durable audit sink** (even something as lightweight as an appended local file
  with rotation, short of a full database) if stdout-only logging proves insufficient
  in practice for a deployment that actually needs after-the-fact mutation review.
  Not designed; stdout was judged sufficient for the current scope.
- **Rebuild, remove, exec** — explicitly not on this project's roadmap absent a new,
  separate approval and trust-boundary design; listed here only so it isn't
  mistakenly treated as "just not built yet."

---

## Phase 1 build — read-only Docker observability dashboard

Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md#change-set-phase-1-build--read-only-docker-observability-dashboard--2026-07-24).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| ~~Phase 2 — mutating controls (stop/restart/rebuild), scoped to an allowlist of repo-known services~~ | Feature | **Done — shipped 2026-07-24** | Explicitly out of scope for Phase 1 by design — the user's own framing drew a hard line at read-only for that phase. Shipped as stop/start/restart only; rebuild was evaluated and explicitly rejected, not built (see [DecisionLog](./DecisionLog.md#phase-2-mutation-scope-stopstartrestart-only-rebuild-ruled-out)). Full detail: [`Feature.md`](./Feature.md#phase-2-gated-container-mutations), and the [Phase 2 build](#phase-2-build--gated-container-mutations) section above for its own follow-on backlog. |
| ~~Phase 3/4 — Kubernetes/EKS integration~~ | Feature | **Partially done — generic read-only Kubernetes backend shipped 2026-07-24** | Shipped as a generic (not EKS-specific) read-only `KubernetesProvider`, unverified against a real cluster (see the [Phase 3 build](#phase-3-build--generic-read-only-kubernetes-backend) section above — that unverified status is itself now the top-priority open item). No EKS-specific auth/IAM integration was built, by design — see [DecisionLog](./DecisionLog.md#generic-kubernetes-provider-via-ambient-kubeconfig). This repo's `terraform/` EKS setup is still a bare VPC+EKS skeleton with no cluster provisioned, which is exactly why Phase 3 could not be verified live. Full detail: [`Feature.md`](./Feature.md#phase-3-generic-read-only-kubernetes-backend). |
| Re-verify the three manual Nuxt/h3 workarounds on every future Nuxt upgrade | Debt | Medium | `readHeader` (auth middleware), `readQuery`, and the hand-rolled SSE `ReadableStream`/`Response` in `logs.get.ts` all exist because of apparent bugs in the bundled Nuxt 4.5/h3-v2 runtime helpers (`getRequestHeader`, `getQuery`, `createEventStream().send()`). See [DecisionLog](./DecisionLog.md#manual-workarounds-for-nuxt-h3-runtime-bugs). Action: on the next Nuxt version bump, re-test whether the framework helpers now work correctly, and delete the manual workarounds if so — don't carry them forward by default. |
| Single static bearer token has no per-user identity or audit trail | Security/Feature | Medium | Acceptable for Phase 1's fully-read-only scope (worst case of a leaked token today is unauthorized *read* access), but would need real reconsideration — likely per-operator tokens or a lightweight identity layer — before any Phase 2 mutating action is exposed behind the same auth mechanism. |
| No rate limiting on `/api/*` | Security/DX | Low | Not a live concern at Phase 1's read-only, single-operator-tool scale, but worth adding if the dashboard is ever exposed beyond a trusted local/loopback context (it currently isn't — see the compose file's `127.0.0.1`-only publish). |
| Log stream (`logs.get.ts`) has no line-count/back-pressure cap beyond the initial `tail` parameter (clamped to 5000) | Perf | Low | A container producing an extremely high log volume after the initial tail could still push data into the SSE stream indefinitely; there's no server-side throttling once the stream is live, only the heartbeat/cleanup-on-disconnect logic. Not observed as a problem yet; worth a cap if it becomes one. |
| No tests for the Nuxt SPA pages/components themselves | Test/DX | Low | The 20-test suite in `test/` covers the pure server-side logic (token comparison, `DockerProvider` DTO mapping, parse helpers) but not `TokenGate.vue`, `LogViewer.vue`, `HealthBadge.vue`, `DataTable.vue`, or the pages. Reasonable for a Phase 1 internal tool of this size, but a candidate for coverage expansion if the UI grows. |
| `docker-compose.ops.yml` and the platform's main `docker-compose.yml` are never run together in CI | DX/Test | Low | `ci-ops-dashboard.yml` builds and tests the dashboard in isolation; there's no CI job that brings up the full batteries-included compose stack (proxy + dashboard) and hits a real Docker Engine end-to-end. Would need a Docker-in-Docker or privileged CI runner to do meaningfully — judged not worth the CI complexity for a Phase 1 internal tool, but flagged in case a later phase raises the stakes enough to justify it. |

### Deferred Technical Debt

- **Environment variable values are permanently hidden, keys only.** Deliberate,
  not planned to change absent a fundamentally different trust model — see
  [DecisionLog](./DecisionLog.md#env-keys-only-not-values).
- **Standalone project, zero shared code with `vue/packages/lib`/`vue/packages/core`.**
  Deliberate tradeoff of the portability goal (see
  [DecisionLog](./DecisionLog.md#standalone-copy-outable-design)) — any future UI
  primitive built in `packages/lib` will not automatically reach this project; if that
  divergence becomes painful, it would need its own reconciliation pass, not a silent
  fix.
- **`HEALTHCHECK` was added to 4 of this platform's services (api_gateway,
  auth_service, product_service, inventory_service) but not to every service that
  might ever exist on this platform.** Any new Python service added later needs the
  same pattern applied at creation, or its containers will silently sit in the
  dashboard's "no-healthcheck" bucket — see
  [DecisionLog](./DecisionLog.md#healthcheck-directives-added-to-existing-services).

### Architecture Evolution Candidates

- ~~**Phase 2 (mutating controls):** a second, narrower Docker access path...~~ —
  **done, shipped 2026-07-24.** Built as a second, dedicated `docker-socket-proxy-mutate`
  instance + a second dockerode client, gated by a global kill switch and a
  per-service allowlist, with a confirm() step in the UI and a structured stdout
  audit trail (no rebuild). See the [Phase 2 build](#phase-2-build--gated-container-mutations)
  section above for what shipped and what's still open from it.
- ~~**Phase 3/4 (Kubernetes/EKS):** would need a second `RuntimeProvider`
  implementation...~~ — **done (generic backend), shipped 2026-07-24, unverified
  against a real cluster.** The narrow, Docker-agnostic `RuntimeProvider` interface
  hypothesized here turned out to need zero changes — `KubernetesProvider` implements
  it unmodified. What did **not** ship: any EKS-specific auth/discovery (deliberately —
  the generic ambient-kubeconfig approach was chosen instead, see
  [DecisionLog](./DecisionLog.md#generic-kubernetes-provider-via-ambient-kubeconfig))
  and any verification against a real cluster of any kind (the top-priority open item
  from this phase — see the [Phase 3 build](#phase-3-build--generic-read-only-kubernetes-backend)
  section above and
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster)).
- **Per-operator identity/audit trail**, if Phase 2 or broader-than-loopback exposure
  ever makes the single-shared-token model insufficient — see the security item above.
