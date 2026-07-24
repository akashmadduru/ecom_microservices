# Decision Log (ops-dashboard)

Append-only, scoped to `vue/ops-dashboard/`. Most recent first. Never edit historical
entries except to mark them superseded. Audience: engineering. Related:
[`Feature.md`](./Feature.md), [`Changes.md`](./Changes.md), [`FutureWork.md`](./FutureWork.md).

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
