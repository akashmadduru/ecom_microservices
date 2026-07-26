# Changes (ops-dashboard)

This doc covers every change set in the ops-dashboard documentation history, most
recent first. Related: [`Feature.md`](./Feature.md), [`DecisionLog.md`](./DecisionLog.md),
[`FutureWork.md`](./FutureWork.md).

---

## Change set: Phase 6 build — read-only Dockerfile discovery — 2026-07-25

Built on top of Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5
([`Changes.md`](#change-set-phase-5-build--gated-imagevolumenetwork-mutations-named-remove--prune--2026-07-25)).
Related decisions: [`DecisionLog.md`](./DecisionLog.md#phase-6-ci-time-manifest-snapshot-not-a-runtime-bind-mount).

### Summary

Adds a fifth, **read-only, display-only** observability surface: `/dockerfiles`
(list) and `/dockerfiles/:id` (parsed detail + raw source) for a **fixed,
hardcoded allowlist of exactly 7 Dockerfiles** in this monorepo (this app's own,
the 4 Python services', the 2 Vue apps') — never a filesystem glob. No build,
rebuild, or execute capability of any kind; this phase only parses and displays
already-committed Dockerfile *content*.

Because 6 of the 7 Dockerfiles live outside `nuxt/ops-dashboard/`'s own
directory tree, and this app has zero runtime filesystem access to any
monorepo-relative path (a deliberate, pre-existing design property — see
DecisionLog), their content is captured **once, ahead of time** by a new script,
`scripts/snapshot-dockerfiles.mjs`, into a gitignored, regenerated-fresh-every-time
manifest (`server/generated/dockerfile-manifest.json`) — never a runtime
bind-mount, and never committed as source. The manifest is bundled into the
production build as a Nitro `serverAssets` entry and read at runtime via
`useStorage('assets:generated')`; a missing/malformed manifest degrades to an
empty list plus a console warning, never a crash — verified by actually
building and running the app both with and without the manifest present, not
merely assumed to work.

Also fixes a **prerequisite bug** found during planning, unrelated to this
feature but blocking it: `.github/workflows/ci-ops-dashboard.yml` still
referenced the stale `vue/ops-dashboard` path from before this app's rename —
meaning it was not actually triggering on real changes to this app before this
fix.

### Files changed

- `nuxt/ops-dashboard/scripts/snapshot-dockerfiles.mjs` — **new.** Reads the 7
  fixed Dockerfile paths (repo-root-relative) and writes the manifest. Resolves
  the repo root from its own file location (`import.meta.url`), not
  `process.cwd()`, so it behaves identically whether invoked from the repo root
  (CI) or from within `nuxt/ops-dashboard/` (`npm run snapshot-dockerfiles`,
  local dev). Leaves an already-correct manifest untouched (rather than
  overwriting it with an inferior one) when the full monorepo isn't visible
  from where it runs — the expected case inside the narrowed Docker build
  context; writes an empty-but-valid fallback manifest with a warning only if
  no manifest exists yet either.
- `nuxt/ops-dashboard/server/runtime/dockerfile-parse.ts` — **new.** Pure
  function: raw Dockerfile text -> `stages`/`exposedPorts`/`entrypoint`/`cmd`/
  `argNames`/`envNames`/`rawContent`. Only the final build stage's `EXPOSE`/
  `ENTRYPOINT`/`CMD`/`ENV` are surfaced; `ARG`/`ENV` are names only, never
  values.
- `nuxt/ops-dashboard/server/runtime/dockerfile-registry.ts` — **new.** Loads
  and caches the bundled manifest (via the `useStorage` bare-global Nitro
  pattern, matching `server/routes/api/**`'s existing convention rather than
  importing `nitropack/runtime` directly, which would pull in a Nitro-internal
  virtual module specifier unresolvable under plain vitest); exposes
  `listDockerfiles()`/`findDockerfile(id)`. The only allowlist this feature has
  — no route or caller ever passes through a raw filesystem path.
- `nuxt/ops-dashboard/server/runtime/types.ts` — **updated.** New
  `DockerfileStage`/`DockerfileSummary`/`DockerfileDetail` types.
  `RuntimeProvider` itself is untouched — this feature is unrelated to the
  Docker-Engine/Kubernetes-facing abstraction every earlier phase is built on.
- `nuxt/ops-dashboard/server/routes/api/dockerfiles/index.get.ts`,
  `[id].get.ts` — **new.** Mirror `images/{index,[id]}.get.ts`'s exact
  structure; `[id].get.ts` reuses the existing `assertValidResourceId` (same
  hyphenated-slug charset), 404 for an unknown id.
- `nuxt/ops-dashboard/nuxt.config.ts` — **updated.** New `nitro.serverAssets`
  entry (`baseName: 'generated'`, `dir: './generated'`) bundling
  `server/generated/**` into the production build.
- `nuxt/ops-dashboard/app/composables/useApiClient.ts` — **updated.** Added
  `listDockerfiles()`/`inspectDockerfile(id)`, identical `get<T>()` pattern to
  every existing method.
- `nuxt/ops-dashboard/app/pages/dockerfiles.vue`, `dockerfiles/[id].vue` —
  **new.** List/detail pages mirroring `images.vue`/`images/[id].vue`'s shape;
  detail page uses the existing `TextPopover.vue` for the raw-source toggle
  (collapsed/truncated by default, full text on click/focus) rather than
  dumping raw text inline uncollapsed.
- `nuxt/ops-dashboard/app/app.vue` — **updated.** New "Dockerfiles" nav entry.
- `nuxt/ops-dashboard/package.json` — **updated.** New `snapshot-dockerfiles`
  script and a `prebuild` hook wired to it.
- `nuxt/ops-dashboard/.gitignore` — **updated.** `server/generated` added.
- `.github/workflows/ci-ops-dashboard.yml` — **updated.** Fixed the stale
  `vue/ops-dashboard` path throughout (`paths:`, `working-directory`,
  `cache-dependency-path`, Docker build `context:`/`file:`); `docker` job no
  longer calls the shared `_reusable-docker-build-push.yml` and instead runs
  its own inline checkout + snapshot step + `docker/build-push-action`
  sequence, so the snapshot script runs against a full checkout **before** the
  Docker build narrows its context to `nuxt/ops-dashboard/` alone.
- `nuxt/ops-dashboard/README.md` — **updated.** New "Phase 6: Dockerfile
  discovery" section; the standalone/copy-out-able claim near the top now
  states this one documented exception rather than silently contradicting it.
- `nuxt/ops-dashboard/test/{dockerfile-parse,dockerfile-registry}.test.ts` —
  **new.** Pure-parser coverage grounded in this repo's own real Dockerfile
  content (multi-stage, `HEALTHCHECK`-with-continuation, ENTRYPOINT-less/
  ENTRYPOINT-present cases, nginx-based unnamed final stage) plus edge cases
  (empty input, legacy `ENV` form, non-JSON `CMD`); registry coverage for the
  happy path, unknown-id lookup, and both missing/malformed-manifest fallback
  paths (stubbing the `useStorage` Nitro global, mirroring
  `mutation-route.test.ts`/`logs-route.test.ts`'s established pattern rather
  than importing the real Nitro runtime module). Test suite grew from 185 (end
  of Phase 5) to 197, all passing.

### Breaking Changes

None. This is an additive, read-only feature with no new env var and no change
to any existing route's response shape. `RuntimeProvider`, `mutation-guard.ts`,
`resource-mutation-guard.ts`, and every existing socket-proxy instance are
completely untouched.

### Migration Steps Required

Run `npm run snapshot-dockerfiles` once from the repo root (or let `npm run
build`'s `prebuild` hook do it) before the Dockerfiles view will show real
data; a fresh clone that hasn't run it yet shows an empty list, not an error.

---

## Change set: Phase 5 build — gated image/volume/network mutations (named remove + prune) — 2026-07-25

Built on top of Phase 1 + Phase 2 + Phase 3 + Phase 4
([`Changes.md`](#change-set-phase-4-build--read-only-image-listinginspect--two-pre-existing-detail-view-gaps--2026-07-25)).
Related decisions: [`DecisionLog.md`](./DecisionLog.md#phase-5-resource-mutations-option-a-app-layer-narrowing-third-proxy).

### Summary

Adds gated, opt-in **named remove + prune** for images, volumes, and networks —
the same lifecycle-management posture Phase 2 established for containers
(stop/start/restart), extended to the three resource types Phase 4 made
read-only-observable. Per an explicit Approval Gate decision ("Option A"),
this phase builds **named remove**, not merely prune, and accepts a real,
disclosed proxy-layer residual risk in exchange (see DecisionLog): unlike
containers, images/volumes/networks have no per-verb carve-out in
`tecnativa/docker-socket-proxy`'s ACL rules, so enabling `IMAGES`/`VOLUMES`/
`NETWORKS` + `POST` on the new proxy also technically admits pull/create/push/
connect at the proxy layer. This is narrowed back down at the **app layer**:
`docker-resource-mutating-provider.ts` never issues those verbs, and no
route/provider method exists that could.

Mutations run through a **third, separate** `docker-socket-proxy-mutate-resources`
proxy and a **third, separate** dockerode client, never shared with the
read-only proxy or the Phase 2 container-mutate proxy — the same proxy-per-
mutation-surface isolation Phase 2 established, extended by one more instance.

Two gate shapes, mirroring Phase 2's `mutation-guard.ts` exactly but in a new,
untouched-sibling file (`resource-mutation-guard.ts`):

- **Named remove** — global kill switch (`OPS_ALLOW_RESOURCE_MUTATIONS`) +
  per-target eligibility. Volumes/networks use a Compose-label allowlist
  (`OPS_MANAGED_VOLUMES`/`OPS_MANAGED_NETWORKS`, matched against
  `com.docker.compose.volume`/`com.docker.compose.network`), same shape as
  Phase 2's `OPS_MANAGED_SERVICES`. Images use a **different** eligibility
  rule — zero live container references, re-derived from a fresh
  `inspectImage` call — because an image has no Compose-label identity of its
  own to allowlist against (see DecisionLog for why this is a deliberate
  deviation, not an inconsistency).
- **Prune** — global kill switch only. No per-target gate, by design: prune
  has no target. Docker's own engine-level prune (hardcoded `dangling: true`
  filter for images; no filter, engine-default "unused only" scoping for
  volumes/networks) is the real backstop that keeps prune scoped to unused
  resources.

`mutation-guard.ts`, `mutating-types.ts`, and both pre-existing Docker-mode
socket-proxy instances are completely untouched by this phase — every new
interface/provider/guard lives in a new sibling file.

### Files changed

- `nuxt/ops-dashboard/server/runtime/config.ts` — **updated.** New
  `OpsConfig` fields: `resourceMutationsAllowed` (`OPS_ALLOW_RESOURCE_MUTATIONS`,
  same fail-closed `=== "true"` strictness as `mutationsAllowed`, deliberately
  independent of it), `managedVolumes`/`managedNetworks` (`OPS_MANAGED_VOLUMES`/
  `OPS_MANAGED_NETWORKS`, reusing the existing `parseServiceList` helper),
  `resourceMutateDockerHost`/`Port` (`RESOURCE_MUTATE_DOCKER_HOST`/`PORT`,
  default `docker-socket-proxy-mutate-resources`/`2375`).
- `nuxt/ops-dashboard/server/runtime/resource-mutating-types.ts` — **new.**
  `ImageMutatingProvider`/`VolumeMutatingProvider`/`NetworkMutatingProvider` —
  sibling interfaces to `MutatingRuntimeProvider`, deliberately not merged
  into it (that interface's own docstring promises "no remove" for
  containers; widening it would break that guarantee for existing callers).
- `nuxt/ops-dashboard/server/runtime/docker-resource-mutating-provider.ts` —
  **new.** `DockerImageMutatingProvider`/`DockerVolumeMutatingProvider`/
  `DockerNetworkMutatingProvider`, each constructed with its own dockerode
  client. Image prune's `dangling: true` filter is hardcoded, never derived
  from any caller/route input.
- `nuxt/ops-dashboard/server/runtime/singleton.ts` — **updated.** A third
  dockerode client (`getResourceMutatingDockerClient`, lazily constructed,
  pointed at `resourceMutateDockerHost`/`Port`) and `getImageMutatingProvider`/
  `getVolumeMutatingProvider`/`getNetworkMutatingProvider`, each throwing in
  kubernetes mode (defense in depth, matching `getMutatingProvider`'s existing
  pattern) and each lazily constructed exactly like the two existing
  client/provider pairs. Never shares the new client with either existing one.
- `nuxt/ops-dashboard/server/runtime/resource-mutation-guard.ts` — **new.**
  `runImageRemoval`/`runVolumeRemoval`/`runNetworkRemoval` (two-gate, mirrors
  `runContainerMutation`) and `runImagePrune`/`runVolumePrune`/`runNetworkPrune`
  (single-gate — no target, so no per-target eligibility check, by design).
  Structured JSON audit lines (`{"event":"ops.resource_mutation",...}`),
  distinct event name from Phase 2's `ops.mutation`, `resourceType`/
  `resourceId` fields in place of `service`/`containerId`.
- `nuxt/ops-dashboard/server/runtime/types.ts` — **updated.** `NetworkDetail`
  gained a `labels` field (Docker: `Labels`; Kubernetes: `metadata.labels`) —
  needed by the network-removal gate to re-derive the
  `com.docker.compose.network` label server-side; `NetworkSummary` and the
  list endpoint are unchanged. See DecisionLog for why this lives on the
  detail shape only, and why the guard reads it via `RuntimeProvider` rather
  than a direct dockerode call.
- `nuxt/ops-dashboard/server/runtime/docker-provider.ts`,
  `kubernetes-provider.ts` — **updated.** `inspectNetwork` in both now
  populates the new `labels` field.
- `nuxt/ops-dashboard/server/routes/api/images/[id]/remove.post.ts`,
  `images/prune.post.ts`, `volumes/[id]/remove.post.ts`,
  `volumes/prune.post.ts`, `networks/[id]/remove.post.ts`,
  `networks/prune.post.ts` — **new.** Thin validate-then-delegate routes,
  same shape as Phase 2's `containers/[id]/stop.post.ts` etc.
- `nuxt/ops-dashboard/server/routes/api/resource-mutations-config.get.ts` —
  **new.** Returns `{allowed, managedVolumes, managedNetworks}` — a
  **separate** endpoint from Phase 2's `mutations-config.get.ts`, which is
  untouched (its `{allowed, managedServices}` contract still backs
  `ContainerActions.vue` exactly as before). No managed-list for images:
  eligibility there is state-based, not allowlist-based.
- `nuxt/ops-dashboard/app/composables/useApiClient.ts` — **updated.** Added
  `getResourceMutationsConfig`/`removeImage`/`pruneImages`/`removeVolume`/
  `pruneVolumes`/`removeNetwork`/`pruneNetworks`, identical `get<T>()`/
  `post<T>()` pattern to every existing method; new `ResourceMutationsConfig`/
  `ResourceMutationResult`/`ImagePruneResult`/`VolumePruneResult`/
  `NetworkPruneResult` types.
- `nuxt/ops-dashboard/app/components/ImageActions.vue`,
  `VolumeActions.vue`, `NetworkActions.vue` — **new.** Gated Remove controls,
  same "controls absent, not disabled, when ineligible" pattern as
  `ContainerActions.vue`, with a native `confirm()` guard. `ImageActions`
  gates on `allowed && containerCount === 0`; `VolumeActions`/`NetworkActions`
  gate on `allowed && managedVolumes/managedNetworks.includes(name)` — a
  client-side name-based approximation of the server's label-based gate (see
  each component's own doc comment for the one edge case where they could
  diverge, and why the server-side gate is the actual authority either way).
- `nuxt/ops-dashboard/app/pages/images.vue`, `images/[id].vue`, `volumes.vue`,
  `volumes/[id].vue`, `networks.vue`, `networks/[id].vue` — **updated.** Wired
  in the corresponding `*Actions` component (row-level on list pages,
  standalone on detail pages) plus a page-level "Prune unused" button on the
  three list pages, gated only on the global switch, with its own `confirm()`
  guard.
- `nuxt/ops-dashboard/docker-compose.ops.yml` — **updated.** New
  `docker-socket-proxy-mutate-resources` service (third proxy, `CONTAINERS: 0`
  explicit, `IMAGES`/`VOLUMES`/`NETWORKS`/`POST` all default `0`); the
  residual-risk paragraph from DecisionLog is written out in full in this
  file's own comment block, matching the existing mutate proxy's comment
  density. `ops-dashboard` service gained
  `RESOURCE_MUTATE_DOCKER_HOST`/`PORT`, `OPS_ALLOW_RESOURCE_MUTATIONS`,
  `OPS_MANAGED_VOLUMES`/`OPS_MANAGED_NETWORKS`, and a `depends_on` entry for
  the new proxy.
- `nuxt/ops-dashboard/.env.example` — **updated.** New Phase 5 section
  documenting all of the above, same density as the existing Phase 2 section,
  including the residual-risk note.
- `nuxt/ops-dashboard/test/{docker-resource-mutating-provider,
  resource-mutation-routes,k8s-resource-mutation-mode}.test.ts` — **new.**
  Unit coverage for the three Docker mutating providers (including "prune
  passes no caller-supplied filter" assertions), route-level coverage for all
  six mutation routes + the new config route (both gates, audit line shapes,
  404 translation), and kubernetes-mode 501-rejection coverage mirroring
  `k8s-mutation-mode.test.ts`. Test suite grew from 152 (end of Phase 4) to
  185, all passing.

### Breaking Changes

None. Every new env var defaults to the safe/disabled state
(`OPS_ALLOW_RESOURCE_MUTATIONS=false`-equivalent, empty allowlists, all four
new proxy toggles `0`); an operator who upgrades and sets nothing gets
byte-identical behavior to before this phase, plus one extra idle proxy
container in the batteries-included compose path. `NetworkDetail.labels` is a
purely additive field on an existing response shape — no existing consumer
reads a field that no longer exists or changed meaning.

### Migration Steps Required

None to adopt the read-only-equivalent default. To enable resource mutations:
set `OPS_ALLOW_RESOURCE_MUTATIONS=true`, a non-empty `OPS_MANAGED_VOLUMES`/
`OPS_MANAGED_NETWORKS` (images need no allowlist), and the four
`OPS_PROXY_RESOURCE_*` proxy toggles to `1` — all seven must be set together,
mirroring Phase 2's own seven-switch enablement story.

### Rollback Plan

Set `OPS_ALLOW_RESOURCE_MUTATIONS=false` (or unset it) and/or stop the
`docker-socket-proxy-mutate-resources` container — either alone returns the
dashboard to its read-only-for-these-three-resource-types posture immediately,
with no data migration or restart-order dependency.

### Verification performed

`npm run lint` (clean), `npm run type-check` (see note below), `npx vitest run`
(185/185 passing, up from 152), and `docker compose -f docker-compose.ops.yml
config -q` (valid). Not run against a live Docker Engine or a real
`docker-socket-proxy` instance — same caveat every prior Docker-mode phase in
this project carries; this phase's guard logic is exercised via mocks
(`resource-mutation-routes.test.ts`), not an integration test against a real
proxy. **Note on type-check:** `nuxt typecheck` (`vue-tsc`) crashes in this
environment with `MODULE_NOT_FOUND: vue-router/volar/sfc-route-blocks` — a
pre-existing environment/dependency-hoisting issue (a top-level `vue-router`
package isn't hoisted in this checkout's `node_modules`; only a nested copy
under `node_modules/nuxt/node_modules/vue-router` exists), unrelated to this
phase's code and reproducible on an unmodified tree. Plain `npx tsc --noEmit`
against both Nuxt-generated project references (`.nuxt/tsconfig.{app,server}.json`)
was run as a substitute and reports zero errors.

---

## Change set: Phase 4 build — read-only image listing/inspect + two pre-existing detail-view gaps — 2026-07-25

Built on top of Phase 1 + Phase 2 + Phase 3 ([`Changes.md`](#change-set-phase-3-build--generic-read-only-kubernetes-backend--2026-07-24)).
Related decisions: [`DecisionLog.md`](./DecisionLog.md#volumesummaryid-and-networksummaryid-are-namespace-qualified-in-kubernetes-mode-phase-4).

Note: the project now lives at `nuxt/ops-dashboard/` (this branch's rename from
the `vue/ops-dashboard/` path used in the Phase 1–3 entries above); paths below
reflect the current location.

### Summary

Added read-only Docker **image** listing/inspect — the last of the four core
Docker Engine resource types (containers, networks, volumes, images) this
dashboard now covers — plus two detail-view gaps flagged in Phase 3's own
FutureWork entry: `/networks/:id` and `/volumes/:id`, neither of which existed
before this phase (both backends only had list views). No mutating capability
was added for any of the three: no image pull/remove/prune, no network/volume
create/remove. `MutatingRuntimeProvider`, `mutation-guard.ts`, and both existing
docker-socket-proxy instances are untouched.

Images are a genuinely asymmetric feature across the two backends. Docker mode
gets a real `docker.listImages()`/`getImage(id).inspect()`/`.history()` — full
size, creation time, labels, RootFS layers, and `docker history` output.
Kubernetes mode has **no per-image API at all**: `listImages`/`inspectImage`
there are a documented approximation that scans every pod's
`containerStatuses[]` and groups them by the image they report (digest when
cleanly extractable from `imageID`, else a synthetic base64url id derived from
the raw image reference — see `computeImageId` in `k8s-parse.ts`); `size`,
`createdAt`, `labels`, `layers`, and `history` are all structurally unavailable
there and stay `null`/`{}` by design, not by oversight.

The two detail-view gaps close differently per backend. Docker's
`inspectNetwork`/`inspectVolume` are real `docker.getNetwork(id).inspect()`/
`docker.getVolume(id).inspect()` calls, richer than slicing the list response
(per-container endpoint IPs/MAC for networks; driver `Options` and the opaque
`Status` blob for volumes — see `NetworkDetail`/`VolumeDetail` in `types.ts`,
added this phase since Phase 1–3 only had list-shaped DTOs for these two
resources). Kubernetes's `inspectNetwork` does the one extra
labelSelector-scoped pod query per Service that `listNetworks()` deliberately
skips at list scale — exactly the follow-up Phase 3's FutureWork entry named
when that list-scale gap was first identified. Kubernetes's `inspectVolume`
required a real, pre-existing bug fix, not just a new route: `VolumeSummary`
had no `id` field distinct from `name` before this phase, and a PVC name is
only unique **within its namespace** — with the default all-namespaces scope
(`K8S_NAMESPACE` unset), two different namespaces can produce two
`VolumeSummary` rows with the same `name`, a real collision no code before this
phase needed to resolve because no `/volumes/:id` route existed to expose it.
`VolumeSummary.id` is now `name` in Docker mode (identical, since a Docker
volume name IS its identity) and `namespace_name` in Kubernetes mode (the same
encoding `k8s-parse.ts` already used for pod ids). `NetworkSummary.id` in
Kubernetes mode also changed, for a related reason: it used to be
`svc.metadata.uid` (falling back to `namespace_name` only when a uid was
absent, which real clusters never leave absent) with a comment noting it was
"never fed through `decodePodId` anywhere" — true until this phase added a
route that needs to. A bare Kubernetes UID cannot be looked up via the API (no
"get by uid" call exists, and `metadata.uid` isn't a supported field
selector), so the id is now always the decodable `namespace_name` form. See
[DecisionLog](./DecisionLog.md#volumesummaryid-and-networksummaryid-are-namespace-qualified-in-kubernetes-mode-phase-4)
for the full reasoning and the existing test updated to match.

### Files changed

- `nuxt/ops-dashboard/server/runtime/types.ts` — **updated.** New `ImageSummary`/
  `ImageDetail`/`ImageReference`/`ImageHistoryEntry`, `NetworkContainerAttachment`/
  `NetworkDetail`, `VolumeDetail`; `VolumeSummary` gained an `id` field (see
  Summary above). `RuntimeProvider` gained `listImages`/`inspectImage`/
  `inspectNetwork`/`inspectVolume`.
- `nuxt/ops-dashboard/server/runtime/docker-provider.ts` — **updated.**
  `listImages`/`inspectImage` (cross-referencing `docker.listContainers({all:true})`
  by `ImageID` for `containerCount`/`referencedBy`, same pattern for both);
  `inspectNetwork`/`inspectVolume` via real `getNetwork(id).inspect()`/
  `getVolume(id).inspect()` calls; `listVolumes` now sets `id: v.Name`.
- `nuxt/ops-dashboard/server/runtime/kubernetes-provider.ts`,
  `k8s-parse.ts` — **updated.** New `computeImageId`/`groupPodImages` (pure,
  testable pod-scan/grouping helpers) and `decodeVolumeId` (namespace_name
  decode with its own "ambiguous volume name" 400, distinct from
  `decodePodId`'s generic malformed-id 400) in `k8s-parse.ts`; new
  `listImages`/`inspectImage`/`inspectNetwork`/`inspectVolume` and a
  `resolveServiceContainers` helper in `kubernetes-provider.ts`; `mapService`'s
  `id` and `mapPvc`'s new `id` both now use `encodePodId(namespace, name)` (see
  Summary above for why the Service id changed).
- `nuxt/ops-dashboard/server/runtime/container-request.ts` — **updated.**
  New `IMAGE_ID_PATTERN`/`assertValidImageId` (base64url charset or a real
  `sha256:` digest) and `assertValidResourceId` (network/volume ids — reuses
  `CONTAINER_ID_PATTERN`, since Docker network/volume identifiers share the
  exact same charset, rather than a copy-pasted duplicate pattern).
  `translateDockerNotFound` gained an optional `resource` label parameter
  (defaults to `"container"`, so every pre-Phase-4 call site is byte-identical)
  so the new image/network/volume routes don't 404 with a misleading "No such
  container" message.
- `nuxt/ops-dashboard/server/routes/api/images/{index,[id]}.get.ts`,
  `networks/[id].get.ts`, `volumes/[id].get.ts` — **new.** Same
  validate-then-delegate-then-translate-404 shape as the existing
  `containers/[id].get.ts`.
- `nuxt/ops-dashboard/app/composables/useApiClient.ts` — **updated.** Added
  `listImages`/`inspectImage`/`getNetwork`/`getVolume`, identical `get<T>()`
  pattern to the existing methods.
- `nuxt/ops-dashboard/app/pages/images.vue`, `images/[id].vue`,
  `networks/[id].vue`, `volumes/[id].vue` — **new.** List/detail pages mirroring
  `volumes.vue`'s `DataTable` list shape and `containers/[id].vue`'s `dl`-based
  detail shape respectively.
- `nuxt/ops-dashboard/app/pages/volumes.vue`, `networks.vue` — **updated.**
  Added click-through to the new detail routes (`containers/index.vue`'s
  `openDetail` pattern); `volumes.vue`'s `row-key` and link target changed from
  `row.name` to `row.id` (neither page linked out to a detail view before this
  phase — there wasn't one — so this is new navigability, not a fix to an
  existing broken link).
- `nuxt/ops-dashboard/app/app.vue` — **updated.** Added an "Images" entry to
  the top nav; without it the new `/images` page would only be reachable by
  typing the URL directly.
- `nuxt/ops-dashboard/docker-compose.ops.yml` — **updated.** Added `IMAGES: 1`
  to the read-only `docker-socket-proxy` service (opens `GET /images`,
  `/images/{id}/json`, `/images/{id}/history`); `POST` stays `0` on this proxy
  as before, so `/images/create` (pull) and `/images/{name}/push` remain
  unreachable through it regardless.
- `nuxt/ops-dashboard/test/{docker-provider,kubernetes-provider,k8s-parse,
  container-request}.test.ts` — **updated.** New coverage for every method/
  helper above, including the `VolumeSummary.id`/`NetworkSummary.id` behavior
  change (an existing Kubernetes network test's expected id updated from a raw
  uid to `namespace_name`, with a comment explaining why) and the
  `decodeVolumeId` ambiguous-bare-name 400 path. Test suite grew from 116 (end
  of Phase 3) to 152, all passing.

### Breaking Changes

None for any existing deployment's runtime behavior. `NetworkSummary.id` and
`VolumeSummary.id` changed shape in **Kubernetes mode only** (Docker mode's
`VolumeSummary.id` is new but equals the pre-existing `name`, so any code
matching on `name` still matches identically on `id`) — since neither had a
detail route to round-trip through before this phase, nothing outside this
phase's own new code depended on the previous Kubernetes network id's exact
value. Flagged here explicitly in case any out-of-repo consumer of the JSON
`/api/networks`/`/api/volumes` response depended on the old shape.

### Migration Steps Required

None. Existing Docker-mode deployments get the four new read-only routes and
the `IMAGES: 1` proxy toggle automatically on redeploy (no `.env`/compose
variable changes required — `IMAGES` is not operator-configurable, unlike the
Phase 2 `OPS_PROXY_*` toggles). Existing Kubernetes-mode deployments need no
RBAC changes: `inspectNetwork`/`inspectVolume`/`listImages`/`inspectImage` call
only `get`/`list` on `pods`/`services`/`persistentvolumeclaims`, the exact same
verbs/resources `k8s/ops-dashboard-readonly-rbac.yaml` already grants — no
update to that manifest was needed.

### Rollback Plan

Revert this change set; none of it is load-bearing for Phase 1–3 behavior. To
disable just the new Docker-mode image routes without a full revert, set
`IMAGES: 0` back on the read-only proxy — `GET /api/images*` then 5xxs at the
proxy layer instead of the app layer, same failure shape as any other
proxy-side-disabled section.

### Verification performed

- `npm run lint`, `npm run type-check` (`nuxt typecheck`), `npm test` (vitest,
  grew from 116 to 152 tests), `npm run build` — all green.
- **No live-cluster verification was performed** for the Kubernetes-mode
  additions in this phase, consistent with Phase 3's own carried-forward,
  top-priority FutureWork item — see
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster).
  `listImages`/`inspectImage`/`inspectNetwork`/`inspectVolume` are exercised
  only against hand-written mocks of `@kubernetes/client-node`, same as every
  other Phase 3 method.

---

## Change set: Phase 3 build — generic read-only Kubernetes backend — 2026-07-24

Built on top of Phase 1 + Phase 2 ([`Changes.md`](#change-set-phase-2-build--gated-container-mutations-stopstartrestart--2026-07-24)).
Full feature description: [`Feature.md`](./Feature.md#phase-3-generic-read-only-kubernetes-backend).
Related decisions: [`DecisionLog.md`](./DecisionLog.md).

### Summary

Added a second, alternative, strictly **read-only** backend: the dashboard can observe
a Kubernetes cluster instead of the Docker Engine, selected at process start via
`RUNTIME_MODE=kubernetes` (`docker` remains the default, byte-identical to before).
Implemented as `KubernetesProvider`, implementing the **same, unmodified**
`RuntimeProvider` interface `DockerProvider` implements — no route or frontend code
changed to add this backend, which is exactly the payoff of that interface's
Phase-1 design. Built on `@kubernetes/client-node`'s standard ambient kubeconfig
resolution, deliberately generic rather than EKS-specific (no AWS SDK, no IAM code) —
it works against any conformant cluster, EKS included, once the operator has pointed
their own kubeconfig at it.

Kubernetes mode carries no mutating surface: the Phase 2 stop/start/restart routes
return `501 Not Implemented` when `RUNTIME_MODE=kubernetes`, checked first in
`runContainerMutation` (before any inspect or provider construction) and independently
re-enforced in `getMutatingProvider()`. Pods/Services/PersistentVolumeClaims are
mapped onto the existing `ContainerSummary`/`NetworkSummary`/`VolumeSummary` DTOs as
documented approximations (see `Feature.md`); a pod id is encoded as
`namespace_podname` (`_` cannot appear in a DNS-1123 name, so it round-trips
unambiguously and survives the existing id-character allowlist). The shared logs route
branches only on whether to demux (Docker) or pipe straight through (Kubernetes,
already-merged plain text).

**This entire phase was built and shipped without ever running against a real
Kubernetes cluster** — no kubeconfig, no kind/minikube, no live API server anywhere in
the build environment. An explicit, informed decision (see
[DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster)),
verified only via hand-written mocks of `@kubernetes/client-node`'s published
types/docs — the single most important caveat about this change set.

A sample read-only `ClusterRole`/`ClusterRoleBinding` manifest is provided at
`k8s/ops-dashboard-readonly-rbac.yaml` as **guidance**, not enforcement: unlike
Docker mode's socket-proxy (an enforcement layer this app controls), Kubernetes RBAC
is enforced entirely by the cluster, outside this app's control — see
[DecisionLog](./DecisionLog.md#kubernetes-rbac-is-guidance-not-enforcement-an-inherent-asymmetry-with-docker-mode).

### Files changed

- `vue/ops-dashboard/server/runtime/kubernetes-provider.ts` — **new.**
  `KubernetesProvider implements RuntimeProvider`, backed by `@kubernetes/client-node`'s
  `CoreV1Api`/`Log`/`VersionApi`. Maps pods to containers, services to networks, PVCs
  to volumes; `streamLogs` bridges the client library's callback-based `Log.log()` into
  the `Promise<ReadableStream>` shape the interface requires via a `PassThrough`,
  aborting the underlying request when the consumer destroys the stream.
- `vue/ops-dashboard/server/runtime/k8s-parse.ts` — **new.** Pure Kubernetes → DTO
  mapping helpers, mirroring the existing `parse.ts` split from `docker-provider.ts`:
  `encodePodId`/`decodePodId` (id round-trip; `decodePodId` throws a real h3 400 on a
  malformed id — see Review outcomes below), `derivePodHealth` (pod phase + `Ready`
  condition + container waiting/terminated reasons → the shared `HealthState`),
  `resolvePodService` (owner-reference chain, falling back to
  `app.kubernetes.io/name`/`app` labels, for the Compose-service analog), `podIps`,
  `k8sTimestampToIso`, `deploymentNameFromReplicaSet`.
- `vue/ops-dashboard/server/runtime/health-aggregate.ts` — **new.** `aggregateHealth`/
  `tallyHealth`, extracted from what was ~60 lines duplicated verbatim between
  `DockerProvider.getHealth()` and the new `KubernetesProvider.getHealth()` — a code
  review finding (see below); both providers now call this shared function, which
  operates purely on the `ContainerSummary` DTO both already normalize to.
- `vue/ops-dashboard/server/runtime/config.ts` — **updated.** Added `runtimeMode`
  (parsed from `RUNTIME_MODE`; only the exact string `"kubernetes"` selects it, every
  other value resolves to `docker`) and `k8sNamespace` (from `K8S_NAMESPACE`, empty =
  all namespaces). Header comment updated to list the new vars.
- `vue/ops-dashboard/server/runtime/singleton.ts` — **updated.** `getRuntimeProvider()`
  now selects between the existing `DockerProvider` and a lazily-constructed
  `KubernetesProvider` (built from `KubeConfig.loadFromDefault()`) based on
  `runtimeMode`. `getMutatingProvider()` now throws if called in kubernetes mode
  (defense in depth alongside the guard-level check in `mutation-guard.ts`) rather than
  ever handing back a Docker-shaped mutating provider.
- `vue/ops-dashboard/server/runtime/mutation-guard.ts` — **updated.**
  `runContainerMutation` now checks `runtimeMode === 'kubernetes'` first, before any
  inspect call or provider construction, and throws `501 Not Implemented` if so.
- `vue/ops-dashboard/server/runtime/container-request.ts` — **updated.**
  `translateDockerNotFound` now checks both dockerode's `.statusCode` property and
  `@kubernetes/client-node`'s `ApiException`'s `.code` property for a 404 — a security
  review finding, fixed (see below): previously a real "pod not found" fell through as
  a generic rethrown error instead of a proper 404.
- `vue/ops-dashboard/server/routes/api/containers/[id]/logs.get.ts` — **updated.**
  Branches on `runtimeMode`: kubernetes mode pipes the log stream straight into the SSE
  sink with no demuxing (pod logs are already plain text with stdout/stderr merged by
  the API server); docker mode still demuxes via `modem.demuxStream`, unchanged. The
  local variable that used to hold only a Docker stream was renamed from `dockerStream`
  to `logStream` and its docstring updated to describe both branches — a code review
  finding, fixed.
- `vue/ops-dashboard/k8s/ops-dashboard-readonly-rbac.yaml` — **new.** Sample
  `ClusterRole`/`ClusterRoleBinding`, guidance only, granting exactly `get`/`list` on
  `pods`/`services`/`persistentvolumeclaims` plus `get` on `pods/log` — matched to what
  the provider actually calls. A security review finding was fixed here: the manifest
  originally also granted `namespaces` get/list and the `watch` verb and `pods/log:list`,
  none of which the code uses; tightened to match exactly.
- `vue/ops-dashboard/README.md` — **updated.** New "Phase 3: generic Kubernetes mode"
  section: namespace scope, the Docker-concept mapping table, health-derivation rules,
  and the RBAC guidance-not-enforcement callout. Configuration table and project-layout
  tree updated with the new files/vars.
- `vue/ops-dashboard/.env.example` — **updated.** Documents `RUNTIME_MODE` and
  `K8S_NAMESPACE`, both defaulted to the pre-Phase-3 behavior (`docker`, all
  namespaces).
- `vue/ops-dashboard/package.json` — **updated.** Added `@kubernetes/client-node`
  (`^1.4.0`) as a dependency.
- `vue/ops-dashboard/test/{kubernetes-provider,k8s-parse,k8s-mutation-mode}.test.ts`
  — **new.** Cover `KubernetesProvider`'s DTO mapping, the pure `k8s-parse.ts` helpers
  (id encode/decode including the malformed-id 400 path, health derivation, service
  resolution), and the parametrized stop/start/restart-returns-501-in-kubernetes-mode
  behavior. All exercised against hand-written mocks of `@kubernetes/client-node` —
  never a real cluster (see Summary above). Test suite grew from 114 (end of Phase 2)
  to 116, all passing (Phase 3 added ~40 tests across these three files before the
  review-fix pass; two more were added during the fix pass for the `.code`/400 fixes
  and the parametrized mutation-mode test).

### Breaking Changes

None. `RUNTIME_MODE` defaults to `docker`; an operator who sets nothing gets exactly
the pre-Phase-3 behavior. Kubernetes mode is entirely additive and requires explicit
opt-in (`RUNTIME_MODE=kubernetes` plus a working kubeconfig).

### Migration Steps Required

None to stay on Docker. To run in Kubernetes mode: set `RUNTIME_MODE=kubernetes`,
point `KUBECONFIG` (or `~/.kube/config`) at an identity bound to a read-only role
(apply `k8s/ops-dashboard-readonly-rbac.yaml` or an equivalent Role/RoleBinding first),
and optionally set `K8S_NAMESPACE` to scope to one namespace. See
`vue/ops-dashboard/README.md`'s "Phase 3: generic Kubernetes mode" section.

### Rollback Plan

Unset `RUNTIME_MODE` (or set it to anything other than exactly `"kubernetes"`) to
revert to Docker mode instantly, without redeploying — the mode check happens on every
request via `getOpsConfig()`, not at process start only. To fully remove the Phase 3
surface, revert this change set; `k8s/ops-dashboard-readonly-rbac.yaml` has no
consumer inside the app and can simply be deleted from the cluster independently.

### Verification performed

- `npm run lint`, `npm run type-check`, `npm test` (vitest, grew from 114 to 116
  tests), `npm run build` — all green.
- **No live-cluster verification was performed or possible in this environment** — see
  the Summary above and
  [DecisionLog](./DecisionLog.md#phase-3-shipped-unverified-against-a-real-kubernetes-cluster).
  All Kubernetes-path testing is against hand-written mocks of
  `@kubernetes/client-node`'s published API surface.
- **Security review:** no blockers. Verified airtight: no mutation path reachable in
  kubernetes mode; the id-character allowlist boundary (`assertValidContainerId`)
  protects both backends identically; no credential/kubeconfig leakage in logs or
  error paths; supply chain clean (`@kubernetes/client-node` is the official package).
  Two low findings, both fixed: the sample RBAC manifest granted `namespaces`/`watch`/
  `pods/log:list` the code never uses (tightened to match exactly); malformed pod ids
  were surfacing as a generic 500 instead of a 400 (`decodePodId` now throws a real h3
  400, consistent with `assertValidContainerId`'s existing behavior for the Docker
  path).
- **Also found and fixed independently** (by the orchestrating session, prompted by
  the Phase 3 implementer's own self-reported gap): `translateDockerNotFound` only
  checked a `.statusCode` property (dockerode's shape) — `@kubernetes/client-node`'s
  `ApiException` reports HTTP status via `.code` instead, so a real "pod not found" was
  falling through as a generic rethrown error rather than a proper 404. Fixed by
  checking both properties.
- **Code review:** approve with comments, no blockers. One notable finding, fixed:
  `getHealth()`/`tallyHealth()` aggregation logic was ~60 lines duplicated verbatim
  between `DockerProvider` and `KubernetesProvider` (the original "keeps the working
  Docker path byte-identical" justification didn't actually hold, since the logic
  operates purely on the shared `ContainerSummary` DTO) — extracted to
  `server/runtime/health-aggregate.ts`, consumed by both. Also fixed: a variable named
  `dockerStream` in the shared logs route that actually held either backend's stream
  (renamed to `logStream`, docstring updated); a comment clarifying that
  `KubernetesProvider.mapService` reuses `encodePodId` only as a convenient
  never-empty fallback id generator for Services, never as a real pod-id round-trip.
- **Bundle-size note:** the client-side SPA bundle stayed ~308KB (unaffected —
  `@kubernetes/client-node` is server-only); the Nitro server bundle grew from ~4.5MB
  to ~20.7MB pulling in the new dependency — expected and inconsequential for a
  server-side Node process.

---

## Change set: Phase 2 build — gated container mutations (stop/start/restart) — 2026-07-24

Built on top of Phase 1 ([`Changes.md`](#change-set-phase-1-build--read-only-docker-observability-dashboard--2026-07-24)).
Full feature description: [`Feature.md`](./Feature.md#phase-2-gated-container-mutations).
Related decisions: [`DecisionLog.md`](./DecisionLog.md).

### Summary

Added a narrow, opt-in mutating surface — stop / start / restart of individual
containers — gated behind two independent, fail-closed conditions: a global kill
switch (`OPS_ALLOW_MUTATIONS` must be exactly `"true"`) and a per-service allowlist
(`OPS_MANAGED_SERVICES`, matched against the `com.docker.compose.service` label).
Rebuild was evaluated and explicitly ruled out as out of scope (highest RCE risk,
requires build-context/source access this project deliberately doesn't have); remove
and exec were never in scope. "Disable" was implemented as a synonym for stop, not a
separate mechanism. Every mutation attempt — denied, attempted, succeeded, or errored
— is written as a structured JSON audit line to stdout; there is no database/file sink
and no per-user identity field, since auth is still a single shared bearer token.

Mutations are served through a **second, dedicated** `docker-socket-proxy-mutate`
container and a **second, separate** dockerode client on the app side — not by
widening the existing read-only proxy. This was a mid-implementation correction: the
first design (add `POST=1` plus the image's `ALLOW_START`/`ALLOW_STOP`/
`ALLOW_RESTARTS` toggles to the *existing* read-only proxy) was caught as unsafe by
reading the proxy's real `haproxy.cfg` before shipping it — see
[DecisionLog](./DecisionLog.md#second-dedicated-mutate-only-docker-socket-proxy-instead-of-widening-the-read-only-one)
for the full story.

### Files changed

- `vue/ops-dashboard/server/runtime/mutating-types.ts` — **new.** `MutatingRuntimeProvider`
  interface (`stopContainer`/`startContainer`/`restartContainer`), deliberately
  separate from the read-only `RuntimeProvider` (`types.ts`), which carries an
  explicit "never add mutating methods here" comment.
- `vue/ops-dashboard/server/runtime/docker-mutating-provider.ts` — **new.**
  `DockerMutatingProvider implements MutatingRuntimeProvider`, a thin dockerode
  wrapper (`getContainer(id).stop()/.start()/.restart()`) using its own dockerode
  client, never the read-only `DockerProvider`'s client.
- `vue/ops-dashboard/server/runtime/mutation-guard.ts` — **new.** `runContainerMutation`
  orchestrator: checks the global kill switch first (before any inspect call), then
  resolves the container's compose service via the existing read-only inspect path
  and checks it against the allowlist, then invokes the mutating provider. Every
  branch (denied/attempt/success/error) logs one audit line via a single bound
  `audit()` closure (refactored during code review from 5 duplicated call sites — see
  Review outcomes below).
- `vue/ops-dashboard/server/runtime/container-request.ts` — **new.** Extracted shared
  helpers used by both read and mutation routes: `assertValidContainerId` (validates
  the `id` route param against a strict hex/name pattern before it ever reaches
  dockerode's unescaped path-concatenation, closing an injection surface that matters
  more once mutating endpoints exist) and `translateDockerNotFound` (maps dockerode's
  404 to h3's `createError`).
- `vue/ops-dashboard/server/runtime/singleton.ts` — **updated.** Now holds **two**
  independent `Docker()` clients and providers (`getDockerClient`/`getRuntimeProvider`
  for reads, `getMutatingDockerClient`/`getMutatingProvider` for mutations), never
  sharing a client across the two. Header comment updated — it previously said "one
  shared client," which became stale the moment the second client was added (code
  review finding, fixed before merge).
- `vue/ops-dashboard/server/runtime/config.ts` — **updated.** Added
  `mutateDockerHost`/`mutateDockerPort` (separate proxy target),
  `mutationsAllowed` (strict `=== "true"` check on `OPS_ALLOW_MUTATIONS`), and
  `managedServices` (parsed from `OPS_MANAGED_SERVICES`). Header comment updated to
  list the new env vars (code review finding — it previously only described the
  Phase 1 vars).
- `vue/ops-dashboard/server/routes/api/containers/[id]/{stop,start,restart}.post.ts`
  — **new.** Each validates the id then delegates entirely to
  `runContainerMutation('stop'|'start'|'restart', id)`.
- `vue/ops-dashboard/server/routes/api/mutations-config.get.ts` — **new.** Returns
  `{ allowed, managedServices }` so the frontend can decide whether to render
  mutation controls at all, rather than discovering the feature is disabled only by
  attempting an action and getting a 403. Still behind the bearer-auth middleware;
  never returns the token or any other secret.
- `vue/ops-dashboard/app/components/ContainerActions.vue` — **new.** Renders
  Stop/Start/Restart buttons only when `/api/mutations-config` reports mutations
  allowed **and** the specific container is compose-managed **and** on the returned
  allowlist. A native `confirm()` guards every action. Controls are absent (not
  disabled) when mutations are off, so the UI never implies a capability that isn't
  there.
- `vue/ops-dashboard/docker-compose.ops.yml` — **updated.** Added the
  `docker-socket-proxy-mutate` service (pinned `tecnativa/docker-socket-proxy:v0.4.2`,
  `CONTAINERS=0`, only `ALLOW_START`/`ALLOW_STOP`/`ALLOW_RESTARTS` + `POST` toggleable
  via `OPS_PROXY_*` vars, all defaulting to `0`); added `MUTATE_DOCKER_HOST`/
  `MUTATE_DOCKER_PORT`/`OPS_ALLOW_MUTATIONS`/`OPS_MANAGED_SERVICES` to the
  `ops-dashboard` service's environment (all defaulting to the disabled state); the
  existing read-only `docker-socket-proxy` service's image tag was also pinned from
  an implicit `:latest` to the explicit `v0.4.2` (security review finding — the
  least-privilege argument for both proxies depends on that exact image's ACL
  behavior).
- `vue/ops-dashboard/.env.example` — **updated.** Documents the five new env vars
  (`MUTATE_DOCKER_HOST`, `MUTATE_DOCKER_PORT`, `OPS_ALLOW_MUTATIONS`,
  `OPS_MANAGED_SERVICES`, plus the four compose-only `OPS_PROXY_*` toggles), all
  defaulted to the disabled state.
- `vue/ops-dashboard/README.md` — **updated.** New "Phase 2: gated container
  controls" section documenting both gates, the audit trail, and — in detail — why
  mutations run through a second dedicated proxy rather than a widened read-only one.
  Also fixed a pre-existing contradiction (code review finding): the prose claimed
  `INFO=1` was enabled on the read-only proxy while the compose file explicitly left
  it disabled; prose corrected to match the shipped config.
- `vue/ops-dashboard/test/{docker-mutating-provider,mutation-route,container-request,
  auth-middleware,log-stream-limiter}.test.ts` — **new** (the first two) and
  supporting/expanded coverage added alongside them. Test suite grew from 65 (end of
  Phase 1) to 77 tests, all passing.

### Breaking Changes

None. Every new env var defaults to the disabled/safe state; an operator who
redeploys the dashboard without setting any of the Phase 2 vars gets Phase 1's
read-only behavior exactly as before, plus one additional (idle, unreachable-from-
outside-`ops_network`) proxy container in the batteries-included compose path.

### Migration Steps Required

None required to stay read-only. To opt into mutations: set `OPS_ALLOW_MUTATIONS=true`
and a non-empty `OPS_MANAGED_SERVICES` on the dashboard service, **and** (batteries-
included path) set `OPS_PROXY_POST=1`, `OPS_PROXY_ALLOW_START=1`,
`OPS_PROXY_ALLOW_STOP=1`, `OPS_PROXY_ALLOW_RESTARTS=1` on `docker-socket-proxy-mutate`
— all seven must be set together, or mutations stay off. See
`vue/ops-dashboard/README.md`'s "Phase 2: gated container controls" section.

### Rollback Plan

Unset `OPS_ALLOW_MUTATIONS` (or set it to anything other than `"true"`) to disable
mutations instantly without redeploying — the app-layer gate is checked first, before
any Docker call. To fully remove the Phase 2 surface, revert this change set;
`docker-socket-proxy-mutate` can also simply be stopped/removed independently of the
dashboard and the read-only proxy, since it is a separate compose service with no
other consumer.

### Verification performed

- `npm run lint`, `npm run type-check`, `npm test` (vitest, grew from 65 to 77 tests),
  `npm run build` — all green.
- `docker compose -f docker-compose.ops.yml config` verified clean in both the
  default (mutations-disabled) and mutations-enabled states.
- **Security review:** no blockers. One medium finding (the mutate-proxy's lack of
  per-container ACL — the allowlist is app-layer only; documented, not fixed, as an
  accepted residual risk — see [FutureWork.md](./FutureWork.md#phase-2-build--gated-container-mutations)),
  one low finding (proxy images pinned from implicit `:latest` to `v0.4.2` — fixed),
  two informational (`ALLOW_RESTARTS` also covers `kill`, noted in compose comments;
  a benign TOCTOU between the read-only proxy's inspect call and the mutate proxy's
  action call, judged non-exploitable since compose labels are immutable and
  container IDs aren't recycled).
- **Code review:** approved with comments, no blockers. One Major (audit-log
  construction duplicated across 5 call sites in `mutation-guard.ts` — refactored to
  a single bound `audit()` closure — fixed), plus stale-comment/doc fixes: `singleton.ts`'s
  header comment ("one shared client") and `config.ts`'s header comment (missing the
  new env vars) updated to match the post-Phase-2 code; a real prose/config
  contradiction in `README.md` about `INFO=1` corrected.

---

## Change set: Phase 1 build — read-only Docker observability dashboard — 2026-07-24

New standalone project. Full feature description: [`Feature.md`](./Feature.md).
Related decisions: [`DecisionLog.md`](./DecisionLog.md).

### Summary

Built `vue/ops-dashboard/` from scratch: a Nuxt 4.5 / Nitro / dockerode application
that lists Docker containers/networks/volumes, maps containers to their Compose
service via `com.docker.compose.service`/`project` labels, aggregates health per
service, and streams live container logs over SSE. No mutating endpoints exist — the
dashboard talks only to a `tecnativa/docker-socket-proxy` sidecar (default-deny,
`CONTAINERS`/`NETWORKS`/`VOLUMES`/`INFO`/`PING` enabled, `POST=0`), never directly to
`/var/run/docker.sock`. Auth is a single static bearer token (`OPS_API_TOKEN`),
compared via SHA-256-digest + `timingSafeEqual`, failing closed (503) if unset. The
project is deliberately standalone: its own `package.json`/lockfile, not a member of
`vue/`'s npm workspace, no dependency on `vue/packages/lib` or `vue/packages/core`.

The project was originally scoped as a Python/FastAPI backend plus a 4th Vue workspace
member; this was explicitly overridden mid-project in favor of an all-Vue, fully
standalone build — see
[DecisionLog](./DecisionLog.md#stack-pivot-python-fastapi--4th-workspace-member-to-standalone-nuxtnode).

A small companion change was made outside `vue/ops-dashboard/`: `HEALTHCHECK`
directives were added to `python/services/{api_gateway,auth_service,product_service,
inventory_service}/Dockerfile`, so those four services report real Docker-level health
status for the dashboard's `/health` rollup to aggregate.

### Files changed

- `vue/ops-dashboard/package.json`, `package-lock.json` — **new.** Own manifest;
  dependencies: `dockerode`, `nuxt`, `vue` (runtime); `@nuxt/eslint`, `@types/dockerode`,
  `@types/node`, `eslint`, `vitest`, `vue-tsc` (dev).
- `vue/ops-dashboard/nuxt.config.ts` — **new.** `ssr: false` (pure SPA — no
  hydration/SSR concern for an internal tool whose token only ever lives client-side);
  `runtimeConfig` seeded from `process.env` at build time as a fallback, with the
  actual request-time values read directly from `process.env` in `server/runtime/
  config.ts` (see rationale comment in that file — a production `node
  .output/server/index.mjs` start only auto-re-reads `NUXT_`-prefixed vars, so the
  documented plain env-var names need this explicit read to actually work at runtime).
- `vue/ops-dashboard/server/runtime/{types,config,token,parse,docker-provider,
  singleton}.ts` — **new.** Read-only `RuntimeProvider` interface and its dockerode
  implementation, constant-time token comparison, config resolution, and pure
  mapping/parsing helpers.
- `vue/ops-dashboard/server/middleware/auth.ts` — **new.** Bearer-token guard for every
  `/api/*` path; fails closed (503) if `OPS_API_TOKEN` is unset. Includes a manual
  `readHeader` helper working around a runtime bug in the auto-imported
  `getRequestHeader` helper on this Nuxt/h3 version.
- `vue/ops-dashboard/server/routes/api/{ping,health}.get.ts`,
  `server/routes/api/containers/{index,[id]}.get.ts`,
  `server/routes/api/containers/[id]/logs.get.ts`,
  `server/routes/api/networks/index.get.ts`,
  `server/routes/api/volumes/index.get.ts` — **new.** Full read-only API surface.
  `logs.get.ts` hand-rolls SSE via a raw `ReadableStream`/`Response` (heartbeat every
  15s, demuxes Docker's multiplexed stdout/stderr frame format via
  `modem.demuxStream`, destroys the underlying docker stream on client disconnect or
  stream end/error) rather than using `createEventStream()`, which is broken in the
  bundled Nitro build.
- `vue/ops-dashboard/app/{app.vue, pages/*, components/*, composables/*}` — **new.**
  Nuxt SPA: `TokenGate.vue` (blocks the whole app until a token is supplied),
  `useApiToken.ts` (sessionStorage-backed token state), `useApiClient.ts` (attaches the
  bearer header to every request), `HealthBadge.vue`, `LogViewer.vue`, `DataTable.vue`,
  and the six pages listed in `Feature.md`.
- `vue/ops-dashboard/Dockerfile` — **new.** Multi-stage `node:24-slim` build; build
  context is the project directory itself (no dependency on anything outside it).
- `vue/ops-dashboard/docker-compose.ops.yml` — **new.** Batteries-included run path:
  `docker-socket-proxy` + `ops-dashboard` on a dedicated `ops_network` bridge, dashboard
  port published to `127.0.0.1` only, `OPS_API_TOKEN` required with no default
  (`${OPS_API_TOKEN:?set OPS_API_TOKEN in the environment or a .env file}`).
- `vue/ops-dashboard/README.md` — **new.** Run paths, security posture, configuration
  table, project layout.
- `vue/ops-dashboard/test/{token,docker-provider,parse}.test.ts`,
  `vitest.config.ts` — **new.** 20 tests across 3 files, covering constant-time token
  comparison, `DockerProvider`'s DTO mapping, and the pure parse helpers.
- `.github/workflows/ci-ops-dashboard.yml` — **new.** Deliberately does not use the
  shared `_reusable-node-app-ci.yml` template (that template assumes npm-workspace
  semantics this standalone project doesn't have); runs its own
  `npm ci` → lint → type-check → test → build, path-filtered to `vue/ops-dashboard/**`
  only, then a `docker` job via `_reusable-docker-build-push.yml` with the build
  context set to the project directory itself.
- `python/services/api_gateway/Dockerfile`,
  `python/services/auth_service/Dockerfile`,
  `python/services/product_service/Dockerfile`,
  `python/services/inventory_service/Dockerfile` — **`HEALTHCHECK` directive added**
  (`--interval=30s --timeout=3s --start-period=10s --retries=3`, hitting each
  service's own `/healthz`). No other lines changed. Purely additive and backward
  compatible — does not alter any service's runtime behavior.

### Breaking Changes

None. This is a wholly new, standalone component; the only change to pre-existing
files is the additive `HEALTHCHECK` directive on four Dockerfiles, which does not
change any service's behavior, port, or API contract.

### Migration Steps Required

None. No database, no schema, no existing service's configuration format changed.
Operators adopting the dashboard need only supply `OPS_API_TOKEN` (see
`vue/ops-dashboard/README.md`).

### Rollback Plan

The dashboard is fully additive and independently deployable — removing
`vue/ops-dashboard/` and `.github/workflows/ci-ops-dashboard.yml` reverts cleanly with
no effect on any other component. To roll back only the companion change, revert the
single `HEALTHCHECK` line in each of the four Python service Dockerfiles; each service
continues to run identically without it (health simply reports as "no healthcheck"
again in the dashboard's rollup).

### Verification performed

- `npm run lint`, `npm run type-check` (`nuxt typecheck` / `vue-tsc`), `npm test`
  (vitest, 20 tests across 3 files), `npm run build` — all wired into
  `ci-ops-dashboard.yml`'s `lint-test-build` job.
- A `docker` build job (via `_reusable-docker-build-push.yml`) builds the image from
  `vue/ops-dashboard/Dockerfile` with the project directory as build context.
