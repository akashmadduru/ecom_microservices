# Diagram: Component Diagram — Product Service Internals

## Diagram Type
Component Diagram

## Subject
The internal module structure of `services/product_service/src/product_service/` and how a
request moves through its layers.

## Audience
Engineers making changes inside this service.

## Required Elements
Every source module, the three routers, the shared `ecom_common` library boundary, and the
direction of dependency between layers.

## Diagram

```mermaid
graph TB
    subgraph "product_service"
        Main["main.py\ncreate_app(), lifespan\n(engine, session factory, Redis, Kafka producer)"]
        Config["config.py\nSettings(BaseServiceSettings)"]
        Deps["deps.py\nDbDep, RedisDep, get_current_user"]

        subgraph "api/routes.py"
            RouterP["router\nprefix=/products"]
            RouterA["admin_router\nprefix=/admin/products"]
            RouterI["internal_router\nprefix=/internal"]
            Helpers["_get_active_product / _get_owned_product /\n_get_visible_product / _create_or_conflict /\n_update_or_conflict / _delete_or_conflict"]
            Events["publish_product_event /\npublish_variant_created_event"]
        end

        Repo["repo.py\nBaseRepository subclasses per aggregate +\nProductRepository.build_catalog_query +\nCategoryRepository.get_subtree +\nslugify / generate_unique_slug"]
        Models["models.py\n13 SQLAlchemy models, 3 StrEnums"]
        Schemas["schemas.py\nPydantic Create/Update/Response per resource"]
        Seeder["seeder.py\nCSV bulk import, idempotent via uniq_id"]
    end

    subgraph "ecom_common (shared lib)"
        CDb["db.py\nBase, TimestampMixin, session factory"]
        CRepo["repository.py\nBaseRepository[M] generic"]
        CAuth["auth.py\nrequire_roles, decode_token, Role enum"]
        CErrors["errors.py\nAppError hierarchy + exception handlers"]
        CEvents["events.py\nEventType, Topics, EventEnvelope, make_event"]
        CPagination["pagination.py\nPageParams, paginate()"]
        CRedis["redis.py\ncache_get_json / cache_set_json"]
        CKafka["kafka.py\nEventProducer"]
    end

    Main --> Config
    Main --> RouterP
    Main --> RouterA
    Main --> RouterI

    RouterP --> Helpers
    RouterA --> Helpers
    RouterP --> Events
    RouterP --> Deps
    RouterA --> Deps
    RouterI --> Deps
    RouterA --> Seeder

    Helpers --> Repo
    RouterP --> Repo
    RouterA --> Repo
    RouterI --> Repo
    RouterP --> Schemas
    RouterA --> Schemas
    RouterI --> Schemas
    Events --> CEvents
    Events --> CKafka

    Repo --> Models
    Seeder --> Models
    Repo --> CRepo
    Models --> CDb
    Deps --> CAuth
    Deps --> CDb
    RouterP --> CRedis
    RouterP --> CErrors
    RouterA --> CErrors
    Schemas --> CPagination

    classDef svcmod fill:#dce7e5,stroke:#2f5d62,color:#1b1e23;
    classDef shared fill:#e1e6fb,stroke:#3454d1,color:#1b1e23;
    class Main,Config,Deps,RouterP,RouterA,RouterI,Helpers,Events,Repo,Models,Schemas,Seeder svcmod;
    class CDb,CRepo,CAuth,CErrors,CEvents,CPagination,CRedis,CKafka shared;
```

## Notes

- Layering is strict: `api/routes.py` → `repo.py` → `models.py`, with `schemas.py` used only at
  the API boundary (request/response DTOs never leak into `repo.py`). No layer is skipped —
  routes never issue raw SQL against `models.py` outside of the handful of ad-hoc `select()`
  calls in list endpoints, which still go through the same SQLAlchemy session (`DbDep`), not a
  separate access path.
- `_get_active_product` / `_get_owned_product` / `_get_visible_product` in `api/routes.py` are the
  three-tier fetch-and-authorize helper chain: `_get_active_product` is the base (excludes
  soft-deleted), `_get_owned_product` layers ownership on top of it (write paths), and
  `_get_visible_product` layers publication status on top of it (public read paths). Every
  product-scoped endpoint uses exactly one of these three — see the LLD's Edge Cases table for
  which endpoints use which.
