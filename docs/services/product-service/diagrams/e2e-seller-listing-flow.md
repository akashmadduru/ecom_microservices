# Diagram: E2E Flow — Seller Lists a New Product

## Diagram Type
Sequence Diagram (end-to-end, client through persistence and eventing)

## Subject
The full path of a seller creating a catalog product, then adding a variant and a primary
image to it — spanning the API Gateway, RBAC/ownership enforcement, Postgres, Redis, and Kafka.

## Audience
Engineers implementing a client against this API; reviewers validating the auth/ownership model.

## Required Elements
Seller actor, API Gateway (with its policy check), FastAPI handlers, the ownership-check helper
chain, Postgres, and the best-effort Kafka publish.

## Diagram

```mermaid
sequenceDiagram
    actor Seller
    participant GW as API Gateway
    participant R as routes.py
    participant Repo as repo.py
    participant DB as product_db
    participant Redis
    participant Kafka

    rect rgb(240, 245, 244)
    note over Seller,Kafka: Step 1 — Create the canonical product
    Seller->>GW: POST /api/v1/products\nAuthorization: Bearer <JWT role=SELLER>\n{"title": "Wireless Mouse", "attributes": {}}
    GW->>GW: route_table policy: /products POST requires SELLER|ADMIN
    GW->>R: forward
    R->>R: require_seller: decode JWT, verify role
    R->>Repo: generate_unique_slug(db, Product, "Wireless Mouse")
    Repo->>DB: SELECT id FROM products WHERE slug = :candidate
    DB-->>Repo: no match
    R->>DB: INSERT INTO products (title, slug, status='DRAFT', seller_id=<sub>, ...)
    DB-->>R: new row (id=501, status=DRAFT)
    R-->>Kafka: publish ProductCreated {product_id: 501, status: "DRAFT", ...} (best-effort)
    R-->>Seller: 201 {"id": 501, "status": "DRAFT", "slug": "wireless-mouse", ...}
    end

    rect rgb(240, 245, 244)
    note over Seller,Kafka: Step 2 — Add a sellable variant
    Seller->>GW: POST /api/v1/products/501/variants\n{"variant_name": "Black", "barcode": "0123456789012",\n "attribute_value_ids": [17]}
    GW->>R: forward (SELLER|ADMIN)
    R->>DB: _get_owned_product(501): fetch + check is_deleted + seller_id == caller.sub
    DB-->>R: product (owner matches)
    R->>DB: validate attribute_value_ids: AttributeValue 17 belongs to a\nProductAttribute with is_variant_defining=true
    DB-->>R: 1 match — OK
    R->>DB: INSERT product_variants (flush) [inside try/except IntegrityError]
    DB-->>R: variant id=8801
    R->>DB: INSERT product_variant_attribute_values (8801, 17)
    R->>DB: COMMIT
    R-->>Kafka: publish ProductVariantCreated {variant_id: 8801, product_id: 501, ...}
    R-->>Seller: 201 {"id": 8801, "variant_name": "Black", "status": "ACTIVE"}
    end

    rect rgb(240, 245, 244)
    note over Seller,Kafka: Step 3 — Attach a primary image
    Seller->>GW: POST /api/v1/products/501/images\n{"url": "https://cdn/.../mouse-black.jpg", "kind": "PRIMARY"}
    GW->>R: forward (SELLER|ADMIN)
    R->>DB: _get_owned_product(501) — same ownership re-check, independent of step 2
    R->>DB: INSERT product_images (product_id=501, variant_id=NULL, kind='PRIMARY')
    alt a PRIMARY image already exists for (501, NULL)
        DB-->>R: IntegrityError (unique violation, NULLS NOT DISTINCT)
        R-->>Seller: 409 Conflict "Only one PRIMARY image is allowed per product/variant"
    else first primary image
        DB-->>R: commit ok
        R-->>Seller: 201 {"id": 9001, "kind": "PRIMARY", ...}
    end
    end

    rect rgb(250, 235, 220)
    note over Seller,DB: Known gap — see Notes below
    Seller--xR: (no endpoint exists to move status DRAFT -> PUBLISHED)
    end
```

## Notes

- **Every step re-derives ownership independently** (`_get_owned_product` is called fresh in each
  handler) — there is no session/request-scoped cache of "is this caller the owner," which is
  correct but means the same `SELECT` + role check runs 3 times across this flow. Acceptable at
  current traffic; would be a candidate for a single request-scoped fetch if this flow's latency
  ever matters.
- **Critical gap surfaced by this diagram:** `ProductCreate`/`ProductUpdate` (`schemas.py`) have
  no `status` field, and no endpoint in `api/routes.py` transitions a product's `status` at all.
  Combined with the Phase 1 fix that makes `GET /products`/`GET /products/{id}` only return
  `status == PUBLISHED` rows, **every product created through this flow is permanently invisible
  to public browsing** — there is currently no legitimate way to reach `PUBLISHED` from the API.
  This is flagged prominently in the LLD's Open Questions and `docs/FutureWork.md`; it is not
  fixed by this documentation pass. See the end-of-task summary for the explicit call-out.
