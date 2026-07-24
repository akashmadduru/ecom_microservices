# Future Work (ops-dashboard)

Open items surfaced during the Phase 1 build, grouped by change set, most urgent
first within each group. Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md), [`DecisionLog.md`](./DecisionLog.md).

---

## Phase 1 build — read-only Docker observability dashboard

Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md#change-set-phase-1-build--read-only-docker-observability-dashboard--2026-07-24).

### Backlog Items Identified During This Task

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Phase 2 — mutating controls (stop/restart/rebuild), scoped to an allowlist of repo-known services | Feature | High (pending separate approval) | Explicitly out of scope for Phase 1 by design — the user's own framing draws a hard line at read-only for this phase. Requires its own trust-boundary design (a second, narrower socket-proxy allowlist or a different access path entirely — see [DecisionLog](./DecisionLog.md#docker-socket-proxy-not-a-direct-socket-mount)) and an explicit approval gate before any implementation starts. |
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

- **Phase 2 (mutating controls):** a second, narrower Docker access path (or a
  differently-scoped socket-proxy allowlist) limited to an explicit allowlist of
  repo-known services, with its own approval gate, audit trail, and likely a
  confirmation step in the UI before any stop/restart/rebuild action executes. Not
  designed yet beyond this scope statement.
- **Phase 3/4 (Kubernetes/EKS):** would need a second `RuntimeProvider` implementation
  (the existing interface in `server/runtime/types.ts` was written narrow enough that
  a Kubernetes-backed implementation is at least architecturally plausible without a
  rewrite, though this wasn't verified in depth as a concrete design target for this
  phase) once a real EKS cluster exists in this repo's infra to target.
- **Per-operator identity/audit trail**, if Phase 2 or broader-than-loopback exposure
  ever makes the single-shared-token model insufficient — see the security item above.
