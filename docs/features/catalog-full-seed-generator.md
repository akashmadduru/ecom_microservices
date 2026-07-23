# Feature: Full 13-Table Catalog Seed (generator + loader)

Last verified against: working tree on top of commit `8ddd1a3` (uncommitted).

**Grounding:** Built and tested. Everything described below is shipped code in
`product_service`, not a proposal.

Related docs: `docs/changes/2026-07-22-catalog-full-seed-generator.md` (file-level
changelog), `docs/DecisionLog.md` (rationale for the tradeoffs below),
`docs/FutureWork.md` (deferred follow-ups, including the accepted startup-blocking
tradeoff), `docs/features/product-catalog-core-phase1.md` (the schema this feature
seeds data into), `docs/product_service_docs/hld/HLD.md` /
`docs/product_service_docs/lld/LLD.md` (updated component/endpoint tables).

## Summary

Phase 1 (`docs/features/product-catalog-core-phase1.md`) added a real 13-table catalog
schema (manufacturers, brands, categories, tags, attributes/values, collections,
products, variants, images, and their association tables), but the only seeder that
existed populated a single table (`products`) from a legacy CSV. There was no way to get
a realistic, referentially-consistent dataset into the *other* 12 tables short of manual
admin API calls.

This feature adds two pieces that work together:

1. **`scripts/generate_seed_data.py`** — an offline, deterministic data generator (no DB
   connection, not part of the running app) that produces realistic seed data across all
   13 tables and writes it to gzip-compressed JSON files.
2. **`catalog_seeder.py`** — a config-driven loader, wired into the running service, that
   reads those files and bulk-inserts them into `product_db` in FK-dependency order.

The CSV-only seeder (`seeder.py`) still exists and still seeds only `Product` — it was
refactored to share its batch-insert machinery with the new loader
(`_seed_utils.py`), but its external behavior is unchanged.

## User-Facing Behavior

This is an internal/operator-facing feature (no shopper- or seller-visible UI change).
Three ways to get the full catalog into a database:

- **Local dev via `docker-compose.yml` (default):** `AUTO_SEED_ON_STARTUP=true` and
  `SEED_CATALOG_DIR=/app/seed/catalog` are set as dev defaults for `product-service`.
  On a cold/empty `product_db`, the full catalog seeds automatically the first time the
  container starts — no manual step needed. On every subsequent start it's a fast
  no-op (see "Idempotency" below).
- **On-demand via the admin API:** `POST /admin/catalog/seed` (ADMIN JWT required, same
  gate as the pre-existing `POST /admin/products/seed`). Returns per-table row counts,
  inserted/skipped/failed counts, and elapsed time. Safe to call repeatedly.
- **Regenerating the seed data itself:** run
  `uv run --package product-service python services/product_service/scripts/generate_seed_data.py`
  from the repo root. This overwrites the 13 `.json.gz` files under
  `services/product_service/seed/catalog/` with a fresh, byte-reproducible dataset (fixed
  RNG seed `42`, gzip written with `mtime=0`). It does **not** touch any database — the
  generator has no DB dependency at all, only a dependency on `product_service.repo.slugify`
  and `product_service.seeder._deterministic_uniq_id` for consistent slug/id generation.

**Generated data volumes** (current committed fixture): 18 manufacturers, 100 brands, 82
categories, 51 tags, 20 product attributes (109 attribute values), 30 collections, 10,500
products (89.8% `PUBLISHED`, the rest split across `DRAFT`/`PENDING_APPROVAL`/`ARCHIVED`),
327 collection-product links, 20,171 product-tag links, 6,286 variants (spread across
2,500 of the 10,500 products), 8,627 variant-attribute-value links, 24,109 product images.
Total compressed size ~2.41 MB across the 13 files.

**Idempotency:** re-running the generator produces byte-identical output (deterministic
RNG, fixed call order, gzip `mtime=0`). Re-running the loader (via the endpoint or
startup hook) against an already-seeded database is a fast, near-instant no-op — see
Technical Summary for how.

## Technical Summary

- **Frontend changes:** None.
- **Backend changes:**
  - `services/product_service/scripts/generate_seed_data.py` (new) — standalone script,
    seeded `random.Random(42)`, builds all 13 tables in memory, self-validates
    (`validate_all`) referential integrity, uniqueness constraints (including the
    partial-unique `barcode`/`upc`/`ean` and the `PRIMARY`-image-per-`(product_id,
    variant_id)` rule), and category `path` ltree-label-safety before writing anything to
    disk — a validation failure exits non-zero and writes no files. Output: one
    gzip-compressed JSON file per table under `services/product_service/seed/catalog/`.
  - `services/product_service/src/product_service/_seed_utils.py` (new) — shared helpers
    extracted from the original CSV seeder: `chunk`, `read_gzip_json` (blocking gzip/JSON
    IO pushed off the event loop via `asyncio.to_thread`), `insert_batch` (SQLAlchemy Core
    `pg_insert(...).on_conflict_do_nothing(...)`), `insert_batch_with_fallback` (retries a
    failed batch row-by-row so one bad record doesn't sink the whole batch), and
    `resync_sequence` (resets a table's Postgres serial sequence to `MAX(id)` after a bulk
    insert of explicit ids — see Decision Log).
  - `services/product_service/src/product_service/catalog_seeder.py` (new) — a declarative
    `_TableSeed` config tuple (`_TABLE_SEEDS`), one entry per table in strict
    FK-dependency order (manufacturers → brands → categories → tags → attributes →
    attribute values → collections → products → the three association tables → variants →
    variant-attribute-values → images), driving a generic `_load_table` function. Each
    table's insert is keyed on its real unique constraint — surrogate `id` for the 10
    normal tables, the composite PK for the 3 pure association tables
    (`collection_products`, `product_tags`, `product_variant_attribute_values`). Top-level
    `seed_full_catalog(db, seed_dir, *, batch_size)` orchestrates the full run and
    fast-path-skips if the catalog already looks seeded.
  - `services/product_service/src/product_service/seeder.py` (modified) — refactored to
    delegate its batch-insert logic to `_seed_utils`; `seed_from_csv`'s signature, external
    behavior, and response shape are unchanged.
  - `services/product_service/src/product_service/config.py` (modified) — added
    `auto_seed_on_startup: bool = False` and `seed_catalog_dir: str = ""` (both opt-in,
    empty/false by default).
  - `services/product_service/src/product_service/main.py` (modified) — the FastAPI
    lifespan `await`s `seed_full_catalog` inline, before `yield`, when
    `auto_seed_on_startup` is true — wrapped in `try/except Exception` so a seeding
    failure is logged (`catalog_seed_startup_failed`) but never blocks app readiness. This
    mirrors the existing non-fatal Kafka-producer-startup pattern in the same function.
  - `services/product_service/src/product_service/api/routes.py` (modified) — new
    `admin_catalog_router` (prefix `/admin/catalog`), one endpoint:
    `POST /admin/catalog/seed`, gated by the same `require_admin` dependency as the
    pre-existing `POST /admin/products/seed`. Registered in `main.py`'s router list
    alongside `router`/`admin_router`/`internal_router`.
  - No `api_gateway` changes needed — its route table already proxies the entire
    `/admin` prefix to `product_service` with an `ADMIN`-only policy
    (`services/api_gateway/src/api_gateway/route_table.py`), so `/admin/catalog/seed`
    is reachable through the gateway with zero gateway-side changes, same as Phase 1.
- **Data model changes:** None. This feature seeds the existing Phase 1 schema
  (migrations `0001`–`0006`); no new migration is needed or included.

## Impacted Files

See `docs/changes/2026-07-22-catalog-full-seed-generator.md` for the complete file-level
table.

## Configuration / Feature Flags

All new settings live in `services/product_service/src/product_service/config.py` /
`services/product_service/.env.example`, both opt-in (safe defaults):

| Variable | Default | Effect |
|---|---|---|
| `SEED_CATALOG_DIR` | `""` (empty) | Absolute path to the `seed/catalog/` directory. Empty disables both `POST /admin/catalog/seed` (returns a "disabled" message, no-op) and startup auto-seed. |
| `AUTO_SEED_ON_STARTUP` | `false` | If `true` **and** `SEED_CATALOG_DIR` is set, `seed_full_catalog` runs inline in the FastAPI lifespan on every boot, before the app starts serving traffic. On an already-seeded DB this is a fast no-op; on a cold/empty DB it delays app reachability for the duration of the seed (see Rollout Plan and `docs/DecisionLog.md`). |
| `SEED_BATCH_SIZE` | `500` | Reused from the CSV seeder; rows per `INSERT ... ON CONFLICT` batch for both the CSV seeder and the catalog loader. |

`docker-compose.yml`'s `product-service` block sets `AUTO_SEED_ON_STARTUP=true` and
`SEED_CATALOG_DIR=/app/seed/catalog` as **dev defaults**, so `docker compose up` seeds
the full catalog automatically on first boot. `SEED_CSV_PATH` is unchanged and is now
only consumed by the manual `POST /admin/products/seed` endpoint — the startup auto-seed
hook always uses the catalog loader, never the CSV path.

## Rollout Plan

- **No migration required.** This feature only adds data-loading code against the
  already-shipped Phase 1 schema.
- **Backward compatible.** `POST /admin/products/seed` (CSV, `Product`-only) is
  untouched and still works exactly as before. `POST /admin/catalog/seed` is new and
  additive.
- **Idempotent at two levels:**
  1. Coarse: `seed_full_catalog` fast-path-returns `{"message": "Catalog already
     seeded.", "seeded": 0}` if `product_images` already has any rows — checking the
     **last**-loaded table, not the first (see `docs/DecisionLog.md` for why).
  2. Fine-grained: every table's insert uses `ON CONFLICT DO NOTHING` keyed on the
     generator's deterministic ids (surrogate PK tables) or composite PK (association
     tables), so even a crash mid-seed leaves a safely re-runnable state — re-running
     from the top only inserts the rows that are still missing.
- **Deployment order:** no special ordering needed beyond what Phase 1 already
  requires (migrations `0001`-`0006` applied before the code deploys). The seed data
  files (`services/product_service/seed/catalog/*.json.gz`) ship inside the service's
  Docker image (`COPY` in the Dockerfile puts them at `/app/seed/catalog`, matching the
  compose default).
- **Known, accepted operational tradeoff:** with `AUTO_SEED_ON_STARTUP=true` (the
  `docker-compose.yml` dev default), a cold-empty-DB boot is **unreachable** — not
  merely "not ready" — for the ~6-second-and-up duration of the full seed, because
  seeding is awaited inline before `yield` in the lifespan. This is a deliberate,
  explicitly-flagged tradeoff (favoring "never serve traffic against a known-empty
  catalog" over "always reachable, might briefly serve an empty catalog"). See the
  Decision Log entry "Seed inline in the lifespan before `yield`, not as a background
  task" and `docs/FutureWork.md` for the prioritized follow-up.

## Known Limitations

- **Idempotency relies on generator-assigned deterministic ids, not natural keys.**
  `ProductVariant` and `ProductImage` have no natural/business unique key even outside
  this seeding context — see `docs/DecisionLog.md` and `docs/FutureWork.md`. A future
  real bulk-upload feature (as opposed to this offline-generated fixture) would need its
  own idempotency mechanism; it can't reuse "generator assigns the id" the way this
  seeder does.
- **Coarse resumability signal.** The fast-path skip checks `product_images` row count
  as a proxy for "fully seeded," not a dedicated completion marker. A crash after
  `product_images` starts loading but before it finishes would leave the DB in a state
  where a re-run correctly resumes (every insert is independently idempotent), but the
  *skip* check itself is a heuristic, not a guarantee — see `docs/FutureWork.md`.
- **Startup seeding blocks app readiness on a cold DB**, as described in Rollout Plan
  above — currently latent (nothing in this compose stack depends on `product-service`'s
  health today) but would surface as intermittent boot failures if a future
  healthcheck/orchestrator dependency is added on top of `product-service`.
- **No CLI progress/streaming for the admin endpoint.** `POST /admin/catalog/seed`
  awaits the entire ~70k-row load synchronously and returns one JSON response at the
  end; there's no progress polling for a long-running seed via the API (only via server
  logs, which log a `catalog_seed_table_completed` event per table).
