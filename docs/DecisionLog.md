# Decision Log

Append-only. Most recent decision first. Historical entries are never edited except to
mark them superseded — see `## Decision: <title>` → `**Status:**` on each entry.

---

## Decision: Consolidate all documentation under root `docs/`; add a project-pinned `sdlc-root` orchestrator agent
- **Date:** 2026-07-24
- **Status:** Accepted
- **Grounding:** `docs/apps/ecom-web/{v1,v2,v3,diagrams}/` (moved from `apps/ecom-web/docs/`), `docs/SDLC.md` (new), `.claude/agents/orchestrator/sdlc-root.md` (new), `.claude/README.md` (agent index updated)
- **Context:** `apps/ecom-web` still carried its own `docs/` subdirectory (versioned `v1/v2/v3` snapshots — `Feature.md`/`DecisionLog.md`/`Changes.md`/`FutureWork.md` + diagrams — from before it was absorbed into this monorepo), while the backend had already standardized on `docs/services/<name>/` at repo root. Two documentation roots for one platform contradicts the "standardized" goal directly. Separately, this repo's `.claude/agents/` framework (Polymath + specialists) is a portable, generic template — nothing in it encoded *this repo's* concrete structure or non-negotiables, so every session had to re-derive them from scratch.
- **Decision:** Moved `apps/ecom-web/docs/` → `docs/apps/ecom-web/` verbatim (structure preserved, including the `v1/v2/v3` version folders — not merged into root `DecisionLog.md`/`FutureWork.md`, since those are the frontend's own decision/backlog history, not platform-wide entries), establishing `docs/apps/<name>/` as the sibling convention to the existing `docs/services/<name>/`. Fixed the few *live* cross-reference links broken by the move (e.g. `docs/apps/ecom-web/v3/Feature.md`'s pointer to `v2/Feature.md`); left the historical `DecisionLog.md`/`FutureWork.md`/`Changes.md` entries under `v2/`/`v3/` untouched, consistent with this repo's own append-only-history convention. Added `docs/SDLC.md` (human-readable process doc: documentation convention, the Standard Pipeline, CI/CD-as-verification, non-negotiables) and `.claude/agents/orchestrator/sdlc-root.md` (a project-pinned specialization of Polymath — same Standard Pipeline, but grounded in this repo's actual 5 components, `python/` workspace layout, and fixed policy on doc destination / Approval Gate / mandatory Security Review triggers, rather than per-request judgment).
- **Alternatives Considered:**
  - *Merge the frontend's `v2`/`v3` `DecisionLog.md`/`FutureWork.md` entries into the root logs, interleaved chronologically* — rejected for this pass (kept as a real option, not dismissed) — genuinely more "one unified log," but a larger, riskier content-merge operation for a documentation-location cleanup; the current move already achieves "one documentation root," which was the stated goal.
  - *Extend `polymath.md` directly instead of adding a new agent* — rejected: `polymath.md` is this workspace's portable, project-agnostic template (its own README describes copying `.claude/` into any project unmodified); baking this repo's specific paths and policies into it would break that portability for no benefit, since agents are auto-discovered from `agents/` at delegation time regardless of which file they live in.
- **Consequences:** Every future documentation-writing task has exactly one valid destination (root `docs/`, correct `services/`/`apps/` subdirectory) — no ambiguity to re-derive per session. `sdlc-root` is now the recommended entry point for feature/bug work in this repo (see `.claude/README.md`); `polymath` remains available and unchanged for anything genuinely generic. If a 6th component or new shared library is ever added, `sdlc-root`'s "Repository Facts" section and `docs/SDLC.md` must be updated together as part of that change, not as a follow-up.

## Decision: Move `pyproject.toml`/`uv.lock` into `python/`, making it a fully self-contained workspace
- **Date:** 2026-07-24
- **Status:** Accepted
- **Grounding:** `python/pyproject.toml` (`members = ["libs/*", "services/*"]`, no `python/` prefix — relative to its own new location), `python/uv.lock`, `Makefile` (every Python target now uses `uv --directory python ...`), `.github/workflows/_reusable-python-lint-test.yml` (`defaults: run: working-directory: python`), all 4 `python/services/*/Dockerfile` (`COPY python/pyproject.toml python/uv.lock ./` then `COPY python/libs ./libs` / `COPY python/services/<name> ./services/<name>` — dropping the `python/` prefix *inside* the image, since the workspace root's own relocation means the image's internal layout goes back to the pre-`python/`-move shape)
- **Context:** After `apps/ecom-web` and `python/` (services+libs) both existed as top-level siblings, an asymmetry remained: `apps/ecom-web` carries its own `package.json`/`package-lock.json`, but the Python side's workspace manifest (`pyproject.toml`/`uv.lock`) still sat at the true repo root — giving the Python stack a privileged position the Node stack didn't have. Requested explicitly as a follow-up.
- **Decision:** Moved `pyproject.toml` and `uv.lock` into `python/`, and updated `[tool.uv.workspace] members` from `["python/libs/*", "python/services/*"]` to `["libs/*", "services/*"]` (now relative to the workspace root's own new location). `uv.lock` was regenerated from scratch again (same reasoning as the prior `python/` consolidation — it embeds resolved source paths). Every `uv` invocation outside the `python/` tree itself now goes through `uv --directory python <cmd>` (`Makefile`) or an explicit `working-directory: python` (CI reusable workflow) — `uv run` invoked *from inside* a service directory (e.g. the `Makefile`'s `migrate-auth` target, `cd python/services/auth_service && uv run alembic ...`) needed no change, since `uv` auto-discovers its workspace root by walking up parent directories from the current working directory, and `python/services/auth_service` still has `python/pyproject.toml` as an ancestor.
- **Alternatives Considered:**
  - *Leave `pyproject.toml`/`uv.lock` at repo root* — rejected once asked to reconsider; the asymmetry with `apps/ecom-web` was real, not cosmetic — a contributor scanning the repo root for "what kind of project is this" would see a Python-flavored root (`pyproject.toml`, `uv.lock`) despite the repo being genuinely polyglot.
- **Consequences:** Repo root now carries no language-specific manifest at all — `apps/` and `python/` are both fully self-contained workspaces, symmetric in shape. The cost: every Python tooling invocation from repo root (a human's terminal, CI, editor/IDE language-server auto-discovery) must now explicitly target `python/` rather than finding `pyproject.toml` at the conventional root location — documented in the README's "Repository layout" and "Local development" sections. Verified end-to-end after the move: `make sync`/`make lint` clean, `make test` reproduces the identical pre-existing pass/fail signature (no new regressions — see the `inventory_service` item in `docs/FutureWork.md`), `actionlint` clean on all 11 workflow files, and a real `docker build` of `product_service`'s image succeeds against the new manifest location.

## Decision: Consolidate `services/` and `libs/` under a new top-level `python/` folder
- **Date:** 2026-07-24
- **Status:** Accepted
- **Grounding:** `pyproject.toml` (`[tool.uv.workspace] members = ["python/libs/*", "python/services/*"]`), `python/services/{api_gateway,auth_service,inventory_service,product_service}/Dockerfile`, `docker-compose.yml`, `Makefile`, `.github/workflows/ci-*.yml`
- **Context:** Once `apps/ecom-web` existed as a sibling of `services/` and `libs/`, the root directory had three top-level code groupings (`apps/`, `services/`, `libs/`) where conceptually there are only two: frontend and backend. Requested explicitly as a follow-up cleanup.
- **Decision:** Moved `services/` → `python/services/` and `libs/` → `python/libs/` (plain `git mv`, no history-preservation concern since both were already native to this repo). Root `pyproject.toml`/`uv.lock` stay at the true repo root (they govern the whole uv workspace, including the `python/` subtree) — only the workspace `members` glob changed. Every Dockerfile, `docker-compose.yml`, the `Makefile`, all CI workflow `paths:` filters/`working-path`/`dockerfile-path` inputs, `.gitignore`, and the README/architecture docs were updated to match. `uv.lock` was regenerated from scratch (deleted and re-run through `uv lock`) rather than edited in place, since it embeds resolved source paths.
- **Alternatives Considered:**
  - *Merge `libs/ecom_common` directly into `services/` as a sibling package, no new top-level folder* — considered but not what was requested; also blurs "deployable service with a Dockerfile" vs. "shared library nothing deploys on its own," which the previous `apps/`-vs-`services/`-vs-`libs/` split had at least kept distinct.
- **Consequences:** Every Python package's on-disk path gained a `python/` prefix; import paths and package names (`product_service`, `ecom_common`, etc.) are unaffected since those are resolved via `uv`'s workspace mechanism, not filesystem location. Verified end-to-end: `uv sync --all-packages`, `ruff check`, the full unit-test suite (identical pass/fail signature to before the move — see the pre-existing `inventory_service` test-isolation item in `docs/FutureWork.md`), `actionlint` on all 11 workflow files, and a real `docker build` of `product_service`'s image all succeed against the new layout.

## Decision: Absorb the separately-tracked `ecom_client` frontend repo into this monorepo via `git subtree`, not a submodule or a fresh untracked copy
- **Date:** 2026-07-24
- **Status:** Accepted
- **Grounding:** `apps/ecom-web/` (post-merge location), merge commit `f14668a` (two parents: prior root-repo `HEAD` and `ecom_client`'s `master` tip), `.github/workflows/ci-ecom-web.yml`
- **Context:** The Vue frontend previously lived at `clients/ecom/` as a fully separate git repository (own remote `ecom_client.git`, own 10-commit history) nested inside this repo's working tree but completely untracked by this repo's git — `git status` on the parent only ever showed `?? clients/` as a single opaque untracked directory. This was discovered while scoping a folder-structure-standardization + CI/CD task; "all services and clients sitting in one scope" required deciding how the frontend should actually relate to the backend monorepo going forward.
- **Decision:** Absorbed via `git subtree add --prefix=apps/ecom-web <local-path-remote> master` (no `--squash`), preserving the frontend's full original commit history intact and traceable (verified: `git log <merge-commit>^2` reaches all 10 original commits). Landed at `apps/ecom-web/` — sibling to `services/`, distinct from the removed `clients/` directory name (see the folder-structure decision below).
- **Alternatives Considered:**
  - *Git submodule* — rejected. Keeps the frontend as a genuinely separate repository with its own independent commit/release cadence, which directly conflicts with the goal of one unified, path-filtered CI/CD system covering every component from a single PR/commit history. Submodules also add real day-to-day friction (detached-HEAD checkouts, an extra sync step on every clone/pull) for no benefit once the frontend is meant to build/test/deploy alongside everything else.
  - *Fresh copy, drop history* — rejected. Simple, but `git blame`/`git log` on every existing frontend file would start from a single "add frontend" commit, permanently losing the ability to trace the 10 commits that actually built it.
  - *`git subtree --squash`* — rejected. Collapses the 10 commits into one, which is a real information loss inconsistent with "preserve history."
- **Consequences:** `apps/ecom-web/` now participates in normal repo-wide operations (single PR history, single issue tracker, single `git log` across the whole platform). Its own `.github/agents/` and `.claude/` persona-config files came along as tracked content (harmless — parallel to the root repo's own `.github/agents/microservices-backend.agent.md`). The frontend's real upstream remote (`ecom_client.git`) is now historical only; no further syncing between the two repos is expected or supported going forward. One incidental hazard encountered and corrected during this work (not a lasting consequence, but worth recording): a `cd clients/ecom` run mid-session, combined with the fact that this Bash tool's working directory persists across separate tool invocations, caused the *first* `git subtree add` attempt to run inside `clients/ecom`'s own repo instead of the root repo — this was caught before any push occurred, fully reverted via `git reset --hard` on the then-untouched `ecom_client` history, and redone correctly from an explicit repo-root `cd`. No data was lost; flagged here only as a reminder that path-relative git operations in a nested-repo layout need an explicit, verified working directory before every command, not just the first one in a sequence.

## Decision: Rename `clients/ecom/` → `apps/ecom-web/`, and standardize on `apps/` (deployable end-user applications) as a top-level sibling of `services/` (deployable backend services)
- **Date:** 2026-07-24
- **Status:** Accepted
- **Grounding:** Target folder structure in the solution-architect design spec produced for this task; `README.md`'s "Repository layout" section
- **Context:** `clients/` more naturally reads as "SDK/API client libraries" in a backend-services codebase, not "the user-facing application." The rename was decided alongside the git-subtree absorption above, so it only needed to happen once.
- **Decision:** `apps/` is the new top-level convention for user-facing deployable applications (currently just `ecom-web`), parallel to `services/` for backend services. `ecom` (the product name) became `ecom-web` (the component name) to stay consistent with how each service directory names its capability, not just the product, and to leave room for a future second frontend (e.g. an admin console) without ambiguity.
- **Alternatives Considered:**
  - *Keep `clients/ecom/` as-is* — rejected as the source of the naming confusion above; also the moment of absorption (a hard-to-repeat, history-sensitive git operation) was the cheapest possible time to also fix the name.
- **Consequences:** Every reference to the old `clients/ecom` path (docs, CI, Dockerfile-context reasoning) had to target `apps/ecom-web` instead — done in this same change set. No other services were renamed or moved.

## Decision: One independently-triggered GitHub Actions workflow file per component, not a single matrixed workflow or a monorepo build-graph tool (Nx/Turborepo/Bazel)
- **Date:** 2026-07-24
- **Status:** Accepted
- **Grounding:** `.github/workflows/ci-{api-gateway,auth-service,inventory-service,product-service,ecom-common,ecom-web}.yml`, `.github/workflows/_reusable-{python-lint-test,docker-build-push,node-app-ci}.yml`
- **Context:** The hard constraint driving this entire CI/CD design: components must build/test/deploy fully independently — a change confined to one service's directory must produce zero CI activity for any other component. `libs/ecom_common` is the one genuinely shared dependency (all 4 Python services use it); `apps/ecom-web` shares nothing with the Python side.
- **Decision:** Five independently-triggered caller workflow files, each with its own `paths:` filter, each `uses:`-ing shared reusable (`workflow_call`) templates for the parts that are genuinely identical in shape across components (lint→test, docker build→push, node lint→typecheck→test→e2e) — DRY at the *logic* level, never at the *trigger* level. `libs/ecom_common/**` and root `pyproject.toml` are included in all 4 Python services' filters (so a shared-lib change fans out to exactly the services that depend on it) but deliberately excluded from `ci-ecom-web.yml`'s filter. Root `uv.lock` is deliberately excluded from every filter (see the accepted-tradeoff entry in `docs/FutureWork.md`).
- **Alternatives Considered:**
  - *One matrixed workflow across the 4 Python services* — rejected. Even with per-leg path filtering inside the matrix, a matrix run cannot produce "zero CI activity in the Checks UI" for the unaffected legs the way 4 separate files do — it would still show 4 (mostly-skipped) check entries on every PR, reintroducing visible coupling the independence requirement is meant to eliminate.
  - *Nx/Turborepo/Bazel or similar build-graph tooling* — rejected as over-engineering at this scale. There are 5 components and exactly one shared dependency, already fully and correctly handled by 5 hand-written path filters. These tools solve computing an accurate affected-subgraph across *many* interdependent packages — a problem this repo doesn't have yet. Revisit if the dependency graph actually grows (e.g. a second shared package consumed by multiple frontends).
- **Consequences:** Adding a 6th component means adding one more caller workflow file (plus, if it shares ecosystem tooling with an existing reusable template, zero new template code) — a known, bounded, low-risk operation. The tradeoff is some inherent duplication across the 5 caller files' `paths:`/`concurrency`/`permissions` boilerplate, judged acceptable since each file stays short and the alternative (a matrix) was explicitly rejected above.

---

## Decision: Use generator-assigned deterministic ids as the uniform idempotency mechanism for the full-catalog seed, not per-table natural keys
- **Date:** 2026-07-22
- **Status:** Accepted
- **Grounding:** `services/product_service/scripts/generate_seed_data.py` (assigns explicit sequential `id`s to every row it generates, validated unique by `validate_all`), `services/product_service/src/product_service/catalog_seeder.py` (`_TABLE_SEEDS`' `conflict_index_elements`, `id` for 10 of 13 tables)
- **Context:** The pre-existing CSV seeder (`seeder.py`) is idempotent via a
  content-derived `uniq_id` (a deterministic UUID5 hash of `title|category|price`) —
  a genuine natural key, re-derivable from row content alone. The new 13-table catalog
  has no equivalent natural key on most of its tables: `ProductVariant` and
  `ProductImage` in particular have no business-meaningful uniqueness (two variants can
  legitimately have the same `variant_name` under different products, images have no
  content hash). A single, uniform re-run-safety mechanism was needed across all 13
  tables, not a bespoke one per table.
- **Decision:** The generator (`generate_seed_data.py`) assigns explicit, deterministic,
  sequential `id` values to every row it produces (validated globally unique per table
  by `validate_all` before any file is written). The loader
  (`catalog_seeder.py`) then uses `id` as the `ON CONFLICT` target for the 10
  surrogate-PK tables, and the natural composite PK for the 3 pure association tables
  (`collection_products`, `product_tags`, `product_variant_attribute_values`, which have
  no `id` column at all). Because the same generator run always assigns the same id to
  the same conceptual row, re-running the loader against a database that already has
  those ids is a safe no-op per row.
- **Alternatives Considered:**
  - *Derive a content-hash natural key per table, the way the CSV seeder does for
    `Product.uniq_id`* — rejected. Would require inventing a plausible "business key"
    for tables that structurally don't have one (`ProductImage` has no content-derived
    identity; two rows can be byte-identical in every column except `id` and still be
    two legitimately different images). Forcing a fabricated natural key onto these
    tables just to satisfy a seeder would be worse than the alternative: it risks
    silently deduplicating rows that were never meant to be the same row.
  - *Don't seed variants/images with explicit ids at all — let Postgres assign them via
    the serial sequence, and accept that a second seed run duplicates rows* — rejected;
    duplicating 20k+ rows on every accidental re-seed (e.g. a container restart with
    `AUTO_SEED_ON_STARTUP=true` racing a not-yet-empty check) is a much worse failure
    mode than the sequence-resync bookkeeping this decision requires instead.
- **Consequences:**
  - Positive: one uniform idempotency mechanism across all 13 tables, no per-table
    special-casing in the loader beyond which columns form the `ON CONFLICT` target.
  - Negative: because the generator supplies explicit ids, the loader must resync each
    surrogate-PK table's Postgres sequence (`resync_sequence`, `setval(...,
    MAX(id))`) after loading — otherwise the *next* ORM-created row (via the normal
    API, using `nextval`) would collide with an id the seed already used. This is
    mandatory, easy to forget if this code is copied elsewhere, and is covered by a
    dedicated integration test (`test_seed_full_catalog_resyncs_sequences_for_new_orm_inserts`).
  - Negative: this mechanism only works because the seed data is generator-produced with
    ids under this code's own control. A future *real* bulk-upload feature (sellers
    uploading their own variant/image data) cannot reuse this trick — it would need its
    own idempotency design, since it can't dictate the ids ahead of time. Logged in
    `docs/FutureWork.md`.
- **Revisit When:** A real seller-facing bulk-upload feature for variants/images is
  built — re-evaluate whether `ProductVariant`/`ProductImage` should gain a real natural
  key (e.g. a required `sku` on variants) at that point, which would let bulk-upload
  reuse a content-derived-key idempotency pattern instead of inventing something new.

---

## Decision: Fast-path skip check on the LAST-loaded table (`product_images`), not the first
- **Date:** 2026-07-22
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/catalog_seeder.py::seed_full_catalog` (checks `ProductImageRepository(db).count() > 0` before doing any work)
- **Context:** `seed_full_catalog` needs a cheap way to decide "has this already been
  seeded, so I can skip the whole ~70k-row load" without re-deriving the answer from all
  13 tables on every call (this check runs on every app boot when
  `AUTO_SEED_ON_STARTUP=true`, and on every manual `POST /admin/catalog/seed` call).
- **Decision:** Check the row count of `product_images` — the *last* table in the
  FK-dependency load order — and skip the entire run only if it's non-empty.
- **Alternatives Considered:**
  - *Check the first table (`manufacturers`) instead*, mirroring the CSV seeder's own
    `ProductRepository(db).count() > 0` pattern (`Product` is the CSV seeder's only, and
    therefore first-and-last, table) — rejected. A crash or restart between
    "manufacturers loaded" and "images loaded" would leave `manufacturers` non-empty
    forever, permanently short-circuiting every future seed attempt at the coarse check,
    even though 12 of 13 tables are still genuinely empty. This is the single most
    important correctness property of this decision: since every individual table
    insert is already idempotent (`ON CONFLICT DO NOTHING`), the *only* reason to have a
    coarse skip check at all is to avoid the cost of a full idempotent-but-wasted re-run
    — it should never be able to produce a *false* "already seeded" that blocks a
    legitimately incomplete catalog from ever finishing.
  - *A dedicated seed-completion marker (small state table, e.g. `catalog_seed_runs`
    with a `completed_at`)* — more precise than any row-count heuristic (first or last
    table), but adds a new table/migration for a problem the last-table heuristic
    already solves well enough today. Logged as a future-work item rather than built now
    — see `docs/FutureWork.md`.
- **Consequences:**
  - Positive: a crash mid-seed is always safely resumable by just calling
    `POST /admin/catalog/seed` again (or restarting the container) — the coarse check
    can only under-skip (do redundant, idempotent work), never over-skip (falsely
    believe a partial catalog is complete).
  - Negative: this is still a heuristic, not a guarantee — e.g. a database where someone
    manually seeded `product_images` but nothing else (unlikely, but not impossible via
    direct SQL) would be misread as "fully seeded." A dedicated marker table would close
    this gap.
- **Revisit When:** If the seed-completion-marker future-work item is built, or if the
  table load order ever changes such that `product_images` is no longer genuinely last.

---

## Decision: Seed inline in the lifespan before `yield`, not as a background task — accepted app-unreachable-during-cold-seed tradeoff
- **Date:** 2026-07-22
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/main.py::lifespan` (awaits `seed_full_catalog` before the Kafka producer starts and before `yield`)
- **Context:** `AUTO_SEED_ON_STARTUP` needed a place to run. FastAPI's lifespan runs
  once at process startup, before the app begins accepting requests (nothing before
  `yield` completes before traffic is served).
- **Decision:** `await seed_full_catalog(...)` directly in the lifespan, before `yield`,
  wrapped in `try/except Exception` so a seeding *failure* never blocks app readiness —
  only a seeding *in-progress* run does. On a cold/empty `product_db`, this means the
  entire app process is unreachable (not just "not ready" per `/health/ready` — the
  process hasn't started serving HTTP at all yet) for the duration of the seed, measured
  at ~6 seconds against a real Postgres connection for the full ~70k-row catalog with
  per-table commits in the test harness (likely more in production under real
  fsync/WAL-flush conditions).
- **Alternatives Considered:**
  - *Fire-and-forget background task (`asyncio.create_task`), app starts serving
    immediately* — rejected for this pass. Would open a window where the app is
    reachable and reports ready, but the catalog is empty or partially populated — every
    public browse/list endpoint would return an empty or incomplete result set during
    that window, which is a worse failure mode for anyone hitting the API right after a
    fresh `docker compose up` than a short "not reachable yet" delay.
  - *Move seeding to a separate pre-start init step (e.g. a one-off init container /
    entrypoint script run before the app process starts)* — the architecturally cleaner
    long-term answer (matches how the Alembic migrations themselves are expected to run
    ahead of the app, not inside it), but out of scope for this pass; no init-container
    pattern exists yet anywhere in this compose stack to extend.
  - *Gate app readiness (`/health/ready`) on seed completion, but let the app start
    serving (and 503 on `/health/ready`) immediately* — closer to correct, but doesn't
    fully solve it either: nothing in this compose stack currently depends on
    `product-service`'s `/health/ready` before routing traffic to it (no orchestrator
    integration), so a not-ready-but-reachable app would behave identically to today's
    fully-blocking approach in this specific stack, while adding complexity for a
    benefit this deployment doesn't yet realize.
- **Consequences:**
  - Positive: it is structurally impossible for a client to observe a reachable
    `product-service` with an empty or partially-seeded catalog — the app simply isn't
    listening yet during that window.
  - Negative (the accepted risk): if a health-check-driven dependency is ever added on
    top of `product-service` (e.g. another service or an orchestrator waiting for
    `product-service` to become reachable/healthy before proceeding), a cold-empty-DB
    boot could look like an intermittent startup timeout/failure rather than a normal,
    if slow, boot. This is currently **latent** — nothing in `docker-compose.yml` depends
    on `product-service`'s health today — but is a real, explicitly-flagged follow-up,
    not a bug that was missed. See `docs/FutureWork.md`.
- **Revisit When:** Before any healthcheck/orchestrator dependency is introduced that
  waits on `product-service` becoming reachable/healthy at startup — move to a
  background task with readiness-check integration, or a pre-start init step, before
  that dependency is added.

---

## Decision: Add a new, additive `POST /admin/catalog/seed` endpoint rather than repurposing `POST /admin/products/seed`
- **Date:** 2026-07-22
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/api/routes.py` (`admin_catalog_router`, prefix `/admin/catalog`, vs. the pre-existing `admin_router`, prefix `/admin/products`)
- **Context:** Two seeders now exist: the original CSV-only `seed_from_csv`
  (`Product` table only) and the new `seed_full_catalog` (all 13 tables). Both needed an
  admin-triggerable HTTP entry point.
- **Decision:** Add a new router (`admin_catalog_router`, prefix `/admin/catalog`) with
  its own `POST /admin/catalog/seed` endpoint, calling `seed_full_catalog`. The
  pre-existing `POST /admin/products/seed` (calling `seed_from_csv`) is left completely
  untouched — same path, same handler, same response shape.
- **Alternatives Considered:**
  - *Repurpose `POST /admin/products/seed` to call the new full-catalog seeder instead
    of (or in addition to) the CSV seeder* — rejected. Would silently change the
    behavior of an existing, already-documented endpoint for any caller (script,
    runbook, or person) that still expects it to mean "load the CSV product catalog."
    The two seeders load genuinely different, independently-useful things (a legacy flat
    CSV catalog vs. a full realistic 13-table fixture) — collapsing them into one
    endpoint would also remove the ability to run either one independently.
  - *Add a query parameter or request body flag to the existing endpoint to select which
    seeder runs* — rejected as unnecessary indirection for what is really two distinct
    operations; a dedicated path per operation is more discoverable in the OpenAPI docs
    and requires no branching logic in the handler.
- **Consequences:**
  - Positive: zero behavior change to any existing caller of
    `POST /admin/products/seed`; the new capability is purely additive.
  - Positive: no `api_gateway` changes needed — the gateway already proxies the entire
    `/admin` prefix (not just `/admin/products`) to `product_service` with an
    `ADMIN`-only policy, so `/admin/catalog/seed` is reachable through the gateway for
    free.
  - Negative: the service now has two admin seed endpoints with similarly-named but
    different payloads/effects (`/admin/products/seed` vs `/admin/catalog/seed`) — a
    future operator needs to know which one does what; both are documented side-by-side
    in `docs/services/product-service/lld/LLD.md`'s API contract table to mitigate this.
- **Revisit When:** If the CSV seeder (`seed_from_csv`/`Product`-only) is ever formally
  deprecated in favor of the full-catalog seeder for all seeding needs — at that point
  `POST /admin/products/seed` could be removed and this becomes the only seed endpoint.

---

## Decision: Per-table commit cadence for the full-catalog seeder, kept per-batch for the CSV seeder
- **Date:** 2026-07-22
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/catalog_seeder.py::_load_table` (`commit=False` on every batch, one `db.commit()` after the whole table plus its sequence resync), `services/product_service/src/product_service/seeder.py::seed_from_csv` (unchanged: `insert_batch_with_fallback`'s default `commit=True`, i.e. one commit per ~500-row batch)
- **Context:** Both seeders insert in batches (default 500 rows) via
  `insert_batch_with_fallback` from the now-shared `_seed_utils.py`. The function
  supports either commit cadence via its `commit` parameter. The CSV seeder loads one
  table (~3271 rows, a handful of batches); the catalog seeder loads 13 tables, the
  largest (`product_images`) alone spanning ~24k rows across ~48 batches.
- **Decision:** The catalog seeder passes `commit=False` to every batch insert within a
  table and commits once per table (after that table's sequence resync, so the resync
  sees every row the batch loop just inserted within the same uncommitted transaction).
  The CSV seeder is left exactly as it was: one commit per batch (`commit`'s default,
  `True`).
- **Alternatives Considered:**
  - *Match the CSV seeder's per-batch commit cadence in the catalog seeder too, for
    consistency* — rejected. Every insert in both seeders is already fully idempotent
    (`ON CONFLICT DO NOTHING`), so per-batch durability buys nothing but a much larger
    number of fsync'd transactions at the catalog seeder's scale — on the order of 140+
    batches across all 13 tables at the default batch size, vs. 13 commits (one per
    table) with per-table commit. A crash mid-table is exactly as safely resumable
    either way, because re-running the whole seed from the top just re-skips everything
    already committed and inserts what wasn't.
  - *Commit once for the entire seed run (all 13 tables in one transaction)* —
    rejected. Would hold one very long-lived transaction across the full ~70k-row,
    multi-second load, and would make the sequence resyncs for early tables (e.g.
    `manufacturers`) invisible to any concurrent connection until the very end — an
    unnecessarily large blast radius if something later in the run fails, forcing a
    rollback of tables that had already finished cleanly.
  - *Change the CSV seeder to per-table (i.e. per-run, since it's one table) commit too,
    while touching this file anyway* — rejected as out of scope; `seed_from_csv`'s
    contract (behavior, response shape) was deliberately kept byte-identical to before
    this change (see the "no breaking changes" note in
    `docs/changes/2026-07-22-catalog-full-seed-generator.md`), and per-batch commit at
    ~3271 rows / a handful of batches was never a real performance concern there.
- **Consequences:**
  - Positive: the catalog seeder issues roughly an order of magnitude fewer commits
    than a naive per-batch approach would at its scale, without sacrificing any
    resumability guarantee (idempotent inserts already provide that).
  - Negative: within a table, a crash after most batches have executed but before the
    table's final commit rolls back that entire table's progress in the current
    transaction (though the *next* seed run simply redoes that table's now-still-missing
    rows — no data is lost, just re-work at the batch-loop granularity, which is cheap).
- **Revisit When:** If a future table in this seeder grows large enough that a
  single-table transaction's lock/WAL footprint becomes an operational concern — at
  that point, revisit chunking large tables into multiple committed sub-batches while
  keeping today's per-table cadence for smaller tables.

---

## Decision: Scope the `product_name` → `title` rename to a plain column rename, no compatibility shim
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/alembic/versions/0006_product_catalog_columns.py`, `services/product_service/src/product_service/models.py::Product`, `services/product_service/src/product_service/schemas.py`
- **Context:** The original `products.product_name` column name predated Phase 1 and
  didn't match the vocabulary already used everywhere else in the schemas/routes
  (`title` is what `ProductCreate`/`ProductUpdate`/`ProductResponse` already called it in
  spirit — the DB column was just out of sync). Phase 1 touches the `products` table
  anyway, making this the natural point to fix it.
- **Decision:** Rename the column in place (`ALTER TABLE products RENAME COLUMN
  product_name TO title`) in migration `0006`, with no dual-read/dual-write
  compatibility window, and rename the event payload key from `product_name` to `title`
  to match.
- **Alternatives Considered:**
  - *Add a new `title` column and dual-write/dual-read both columns for a compatibility
    window* — rejected. A grounding check found zero consumers of the raw `product_name`
    column or the `product_name` event-payload key outside `product_service` itself (no
    service currently subscribes to `Topics.PRODUCT`). Building a compatibility shim to
    protect a consumer that doesn't exist would be pure overhead.
  - *Keep the DB column named `product_name` and remap it to `title` only in the
    Pydantic schema layer (field alias)* — rejected. This would leave the persisted
    schema out of sync with the domain vocabulary used everywhere else (`slug`, `title`,
    etc.), which is exactly the kind of drift that caused migration `0002` to be needed
    in the first place (model said `Text`, live schema stayed at the old bounded type).
- **Consequences:**
  - Positive: one clean rename, no shim to carry forward or eventually remove.
  - Negative: this is a real breaking change for anything that queries the `products`
    table directly by column name outside the ORM (raw SQL tooling, BI dashboards). None
    are known to exist today, but this assumption should be re-verified before Phase 2
    ships, since Phase 2 (marketplace split) will touch this table again.
- **Revisit When:** Before Phase 2 (marketplace split) begins — re-verify no external
  raw-SQL consumer of `products.product_name` has appeared since this rename.

---

## Decision: Defer legacy `category`/`sub_category`/`brand` free-text backfill into the new FKs
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/alembic/versions/0006_product_catalog_columns.py` (docstring explicitly calls this out), `services/product_service/src/product_service/models.py::Product`
- **Context:** `Product` now has both the legacy free-text `category`/`sub_category`/
  `brand` columns and new nullable `brand_id`/`manufacturer_id`/`category_id` FKs to the
  new `Brand`/`Manufacturer`/`Category` tables. The ~3271 rows seeded from the original
  CSV catalog have inconsistent, uncurated values in those free-text columns (casing,
  whitespace, near-duplicates).
- **Decision:** Ship Phase 1 with `brand_id`/`manufacturer_id`/`category_id` left `NULL`
  on all pre-existing rows. No backfill/dedup pass runs as part of this migration set.
- **Alternatives Considered:**
  - *Auto-create Brand/Category rows from the distinct existing free-text values during
    migration `0006`* — rejected. This would blindly materialize whatever duplication and
    inconsistency already exists in the free text (e.g. "Gaming" and "gaming " becoming
    two different Category rows), reproducing inside the new controlled-vocabulary
    tables the exact failure mode this whole redesign exists to eliminate.
  - *Manual admin backfill via a one-off script, done alongside this migration* —
    rejected on sequencing grounds: there is no curated target taxonomy yet to map the
    legacy strings onto. Taxonomy curation is a data-quality exercise that needs to
    happen before backfill, not during it.
- **Consequences:**
  - Positive: Phase 1 ships without needing a data-quality/dedup pass gating it.
  - Negative: the new `brand_id`/`category_id` query-param filters on `GET /products`
    return nothing for any of the pre-existing seeded catalog until backfill runs in a
    later phase — the new taxonomy is functionally empty for legacy data until then.
- **Revisit When:** A later phase (tracked in `docs/FutureWork.md`) curates a canonical
  taxonomy and runs the backfill.

---

## Decision: Soft-delete `Product`, keep hard-delete for the new taxonomy tables
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/models.py::Product` (`is_deleted`/`deleted_at`/`deleted_by`), `services/product_service/src/product_service/api/routes.py::delete_product` vs. `delete_brand`/`delete_manufacturer`/`delete_tag`/`delete_collection` (all still call `BaseRepository.delete`, a hard delete)
- **Context:** `DELETE /products/{id}` previously did a real `DELETE FROM products`.
  Phase 1 adds `product_variants`, `product_images`, and `collection_products` rows that
  reference a `Product` — a hard delete would either cascade-destroy those (silent data
  loss, no audit trail) or require every one of them to be cleaned up first.
- **Decision:** Add `is_deleted`/`deleted_at`/`deleted_by` to `Product`; `DELETE
  /products/{id}` now sets those flags instead of removing the row. All catalog read
  paths (`_get_active_product`, `ProductRepository.build_catalog_query`,
  `list_collection_products`) filter `is_deleted = false` by default, so a soft-deleted
  product 404s identically to how a hard-deleted one used to — the behavior change is
  invisible externally. The new taxonomy tables (`Brand`, `Manufacturer`, `Category`,
  `Tag`, `Collection`) were **not** given the same treatment — their admin delete
  endpoints still hard-delete via `BaseRepository.delete`.
- **Alternatives Considered:**
  - *Keep `Product` as hard-delete* — rejected. Destroys the audit trail, is
    irreversible, and (unlike `Category`'s delete endpoint, which explicitly checks for
    and blocks deletion when children/products reference it) `Product` has no equivalent
    dependent-record guard for its own variants/images/collection memberships — a hard
    delete would silently orphan or cascade-destroy them.
  - *A separate `deleted_products` archive table* — rejected as unneeded complexity; a
    boolean flag plus a partial index (`ix_products_published_category` already needs
    `is_deleted = false` in its predicate for the same reason) achieves the same
    filtering behavior more simply.
  - *Soft-delete everything (Brand/Manufacturer/Category/Tag/Collection too), for
    consistency* — rejected for this phase. Those are low-volume, admin-only master-data
    tables where `Category`/`Collection` deletes already have explicit dependent-record
    checks (a Category with children or referencing products can't be deleted at all);
    the audit-trail/orphan-prevention argument that motivates Product's soft-delete is
    much weaker there. Revisiting this for consistency is plausible future work but
    wasn't judged worth the scope increase now.
- **Consequences:**
  - Positive: reversible, auditable, preserves FK integrity for variants/images/
    collection memberships without requiring cascade logic.
  - Negative: every catalog read path must remember to filter `is_deleted` — a new query
    written without that filter would silently resurface deleted products. This is a
    real footgun for future code in this file.
- **Revisit When:** If a genuine hard-delete requirement emerges (e.g. legal/compliance
  data-erasure request) — Phase 1 provides no hard-delete path for `Product` at all
  post-soft-delete.

---

## Decision: Materialized `path` on `Category` as a plain string, cast to `ltree` only in raw SQL
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/models.py::Category` (module-level docstring), `services/product_service/src/product_service/repo.py::CategoryRepository.get_subtree`, `services/product_service/alembic/versions/0003_catalog_taxonomy.py`
- **Context:** `Category` needed a self-referencing hierarchy with efficient indexed
  "give me this category and everything under it" (subtree) queries — the kind of query
  a plain adjacency list with recursive CTEs handles poorly at scale, and that
  Postgres's `ltree` extension is built for.
- **Decision:** Declare `Category.path` as a plain SQLAlchemy `String` column (a
  dot-separated, underscore-joined slug path, e.g.
  `electronics.mobiles_and_accessories.smartphones`). Enable the `ltree` extension and
  build a GiST expression index on `path::ltree` (`ix_categories_path_gist`), but only
  ever cast to `ltree` inside raw SQL text server-side (`CategoryRepository.get_subtree`'s
  `text("path::ltree <@ CAST(:p AS ltree)")`). Every value that crosses the asyncpg wire
  stays plain text — no native ltree column type, no asyncpg type-codec registration.
- **Alternatives Considered:**
  - *Native `ltree` SQLAlchemy/asyncpg column type* — rejected. `ltree` isn't a built-in
    asyncpg type; using it natively requires registering a custom type codec on the
    connection, which is fragile and version-sensitive across asyncpg releases and adds
    an operational failure mode (codec registration breaking silently on an asyncpg
    upgrade) for a single indexed predicate's benefit.
  - *Plain adjacency list only (`parent_id`), no materialized path, subtree queries via
    recursive CTE* — rejected. Works, but gives up an indexed descendant lookup;
    acceptable at today's scale but a worse foundation given faceted category browsing
    is an explicit target of this redesign.
- **Consequences:**
  - Positive: avoids driver-level fragility; the plain-text `path` column is trivially
    portable/inspectable/debuggable with ordinary SQL tooling.
  - Negative: `Category.slug` (and therefore each `path` segment) must stay
    ltree-label-safe — letters, digits, underscores only. This is why category slug
    generation uses `slugify(..., sep="_")` specifically, diverging from the
    hyphen-separated slugs used for `Product`/`Brand`/`Collection`/`Tag` elsewhere in
    this service. A future engineer adding a category-naming feature needs to know this
    or will produce a `path` that fails its own `ltree` cast at query time.
- **Revisit When:** If asyncpg ships first-class, stable `ltree` codec support, or if
  `ltree` usage in this service grows beyond the single indexed subtree predicate (at
  which point the raw-SQL-cast approach's ergonomics start to cost more than the codec
  fragility it avoids).

---

## Decision: Extend `products` additively rather than a destructive/normalizing migration
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/alembic/versions/0003_catalog_taxonomy.py` through `0006_product_catalog_columns.py` (docstrings), `docs/features/product-catalog-core-phase1.md`
- **Context:** `product_db` already held ~3271 seeded rows in `products` at the time
  this phase was planned. The 4-phase catalog redesign (Catalog core → Marketplace split
  → Inventory re-key → Cleanup) was scoped, but only Phase 1 was approved to build.
- **Decision:** Every schema change in this phase is additive: new tables
  (`manufacturers`, `brands`, `categories`, `collections`, `collection_products`,
  `tags`, `product_tags`, `product_attributes`, `attribute_values`, `product_variants`,
  `product_variant_attribute_values`, `product_images`) plus new nullable columns on the
  existing `products` table. Every new `NOT NULL` column uses a constant
  `server_default` (never a computed one), keeping these Postgres 11+ metadata-only
  changes rather than full-table rewrites. The legacy `category`/`sub_category`/`brand`
  columns are left completely untouched in meaning.
- **Alternatives Considered:**
  - *Normalize immediately: replace `category`/`sub_category`/`brand` free-text columns
    with FKs in this same migration set, backfilling as part of the cutover* — rejected.
    Would require a synchronous data-quality/dedup pass on uncurated seeded data before
    any of this phase could ship (see the separate "defer legacy backfill" decision
    above), and would break any code still reading the flat fields during a rolling
    deploy.
  - *Shadow table + dual-write pattern (write both old and new shapes, cut over readers
    gradually)* — rejected as unneeded complexity for a single-service, single-database
    change with no cross-service consumers of the raw `products` columns to coordinate
    with.
- **Consequences:**
  - Positive: zero-downtime migration, fully backward-compatible reads/writes throughout
    the deploy, no coordinated multi-phase cutover needed just to ship Phase 1.
  - Negative: `Product` now carries two parallel representations of category/brand (free
    text + FK) with no enforced consistency between them, and will continue to until
    Phase 4 (cleanup/legacy-column drop). Any code reading `Product.category`/`brand`
    without also checking `category_id`/`brand_id` (or vice versa) can silently produce
    inconsistent results during this window.
- **Revisit When:** Phase 4 (cleanup) — once legacy-column backfill (a separate,
  already-logged decision above) has run and every consumer reads from the new FKs, the
  legacy free-text columns can be dropped.
