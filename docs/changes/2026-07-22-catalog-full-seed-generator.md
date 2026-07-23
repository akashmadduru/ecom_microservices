# Changes: 2026-07-22 — Full 13-Table Catalog Seed (generator + loader)

Last verified against: working tree on top of commit `8ddd1a3` (uncommitted).

See `docs/features/catalog-full-seed-generator.md` for the full feature writeup and
`docs/DecisionLog.md` for the rationale behind the choices below.

## Summary

Added a standalone, deterministic offline generator (`scripts/generate_seed_data.py`)
that produces realistic seed data across all 13 `product_db` tables (previously only
`Product` had a seeder, via CSV), plus a new config-driven loader
(`catalog_seeder.py`) wired into the running service to bulk-load that data in
FK-dependency order with idempotent, `ON CONFLICT DO NOTHING` inserts. The CSV-only
seeder was refactored (not rewritten) to share its batch-insert machinery with the new
loader via an extracted `_seed_utils.py`, with its own external behavior unchanged. A
new admin endpoint (`POST /admin/catalog/seed`) and an opt-in startup auto-seed hook
were added; `docker-compose.yml`'s dev defaults enable the latter. No schema migration
was needed — this seeds the existing Phase 1 catalog schema.

## Files Changed

| File | Change Type | Reason |
|---|---|---|
| `services/product_service/scripts/generate_seed_data.py` | Added | Offline, seeded-RNG (42) generator for all 13 catalog tables; self-validates referential integrity/uniqueness/ltree-safety before writing; writes gzip-compressed JSON (`mtime=0` for byte-reproducibility) |
| `services/product_service/seed/catalog/*.json.gz` (13 files) | Added | Generated fixture output consumed by `catalog_seeder.py` at runtime — committed so the app doesn't need the generator script available at deploy time |
| `services/product_service/src/product_service/_seed_utils.py` | Added | `chunk`, `read_gzip_json`, `insert_batch`, `insert_batch_with_fallback`, `resync_sequence` — extracted from the original CSV seeder so both seeders share one batch-insert/fallback/sequence-resync implementation |
| `services/product_service/src/product_service/catalog_seeder.py` | Added | Declarative `_TableSeed`/`_TABLE_SEEDS`-driven loader; `seed_full_catalog(db, seed_dir, *, batch_size)` orchestrator; per-table commit; last-table (`product_images`) fast-path skip check; post-load sequence resync per surrogate-PK table |
| `services/product_service/src/product_service/seeder.py` | Modified | Refactored to delegate batching/insert/fallback logic to `_seed_utils`; `seed_from_csv`'s signature, behavior, and response shape are unchanged |
| `services/product_service/src/product_service/config.py` | Modified | Added `auto_seed_on_startup: bool = False`, `seed_catalog_dir: str = ""` (both opt-in) |
| `services/product_service/src/product_service/main.py` | Modified | Lifespan awaits `seed_full_catalog` inline (before `yield`) when `auto_seed_on_startup` is true, wrapped in `try/except Exception` (non-fatal, mirrors the existing Kafka-producer-startup pattern) |
| `services/product_service/src/product_service/api/routes.py` | Modified | New `admin_catalog_router` (prefix `/admin/catalog`), `POST /admin/catalog/seed` endpoint, `require_admin`-gated — additive alongside the pre-existing, untouched `POST /admin/products/seed` |
| `services/product_service/tests/integration/conftest.py` | Modified | Registers `admin_catalog_router` on the test app alongside the existing routers |
| `services/product_service/tests/integration/test_catalog_seeder.py` | Added | Integration coverage: full-catalog population, idempotency on a second run, sequence resync for subsequent ORM inserts, disabled-when-unconfigured, missing-directory handling |
| `services/product_service/tests/unit/test_seed_utils_chunk.py` | Added | Unit coverage for `_seed_utils.chunk` (pure list-splitting logic) |
| `docker-compose.yml` | Modified | `product-service` env block sets `AUTO_SEED_ON_STARTUP=true` and `SEED_CATALOG_DIR=/app/seed/catalog` as dev defaults; comment clarifies `SEED_CSV_PATH` is now only consumed by the manual CSV endpoint |
| `services/product_service/.env.example` | Modified | Documents `SEED_CATALOG_DIR`/`AUTO_SEED_ON_STARTUP`, with a note that startup auto-seed delays app reachability on a cold boot |

## Breaking Changes

None. Every change is additive:

- `POST /admin/products/seed` (CSV seeder) is untouched — same route, same request/
  response shape, same behavior.
- `POST /admin/catalog/seed` is a new route under a new prefix (`/admin/catalog`),
  reachable through the gateway with zero `api_gateway` changes since the gateway
  already proxies the whole `/admin` prefix to `product_service` with an `ADMIN`-only
  policy.
- `auto_seed_on_startup` defaults to `false` in the `Settings` class itself — only
  `docker-compose.yml`'s dev environment turns it on. Any other deployment (bare host,
  a different compose file, k8s manifests not present in this repo) is unaffected
  unless it explicitly sets the new env vars.

## Migration Steps Required

None. No new Alembic revision — this feature loads data into the schema Phase 1
already created (migrations `0001`-`0006`).

## Rollback Plan

- Revert `docker-compose.yml`'s `AUTO_SEED_ON_STARTUP`/`SEED_CATALOG_DIR` env lines (or
  set `AUTO_SEED_ON_STARTUP=false`) to disable startup auto-seed without touching any
  code.
- Reverting the code changes entirely is safe at any time: `catalog_seeder.py` and
  `_seed_utils.py` are net-new modules with no other code depending on them except
  `main.py`'s lifespan and `routes.py`'s new router — removing those wiring points
  leaves `seed_from_csv`/`Product`-only seeding exactly as it was before this change.
- The seeded rows themselves are ordinary rows in tables that already existed
  pre-Phase-1-completion; there is nothing to reverse at the schema level. If seeded
  data needs to be removed from a database, it must be deleted manually (`TRUNCATE`/
  `DELETE`) — there is no seeder "undo" endpoint, matching the pre-existing CSV
  seeder's behavior.
