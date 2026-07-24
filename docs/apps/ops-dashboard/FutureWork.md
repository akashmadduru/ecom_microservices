# Future Work (ops-dashboard)

Open items surfaced during the Phase 1 and Phase 2 builds, grouped by change set,
most urgent first within each group. Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md), [`DecisionLog.md`](./DecisionLog.md).

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
| Phase 3/4 — Kubernetes/EKS integration | Feature | Low (blocked on infra) | Deferred not just by scope choice but by real infra state: this repo's `terraform/` EKS setup is a bare VPC+EKS skeleton with no cluster actually provisioned yet. Revisit once a real EKS cluster exists to point a K8s-aware version of this dashboard at. |
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
- **Phase 3/4 (Kubernetes/EKS):** would need a second `RuntimeProvider` implementation
  (the existing interface in `server/runtime/types.ts` was written narrow enough that
  a Kubernetes-backed implementation is at least architecturally plausible without a
  rewrite, though this wasn't verified in depth as a concrete design target for this
  phase) once a real EKS cluster exists in this repo's infra to target.
- **Per-operator identity/audit trail**, if Phase 2 or broader-than-loopback exposure
  ever makes the single-shared-token model insufficient — see the security item above.
