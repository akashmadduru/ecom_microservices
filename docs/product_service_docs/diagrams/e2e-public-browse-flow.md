# Diagram: E2E Flow — Public Catalog Browse & Category Drill-Down

## Diagram Type
Sequence Diagram (end-to-end)

## Subject
An anonymous shopper browsing a category, then viewing one product — covering the cache-first
read path and the publication-status enforcement.

## Audience
Frontend engineers integrating against this API; engineers validating cache invalidation
correctness.

## Required Elements
Anonymous client, API Gateway (public policy), Redis cache hit/miss branch, Postgres, the
category subtree query.

## Diagram

```mermaid
sequenceDiagram
    actor Client as Anonymous Client
    participant GW as API Gateway
    participant R as routes.py
    participant Repo as repo.py
    participant DB as product_db
    participant Redis

    rect rgb(240, 245, 244)
    note over Client,DB: Step 1 — Drill into a category
    Client->>GW: GET /api/v1/products/categories/12/subtree
    GW->>GW: policy: GET /products/* is PUBLIC — no token required
    GW->>R: forward
    R->>Repo: CategoryRepository.get_subtree(12)
    Repo->>DB: SELECT * FROM categories WHERE id = 12  (existence + path lookup)
    DB-->>Repo: category(path="electronics.mobiles")
    Repo->>DB: SELECT * FROM categories\nWHERE path::ltree <@ CAST('electronics.mobiles' AS ltree)\nORDER BY path
    Note right of DB: GiST expression index on (path::ltree)\nserves this in O(log n), not a recursive CTE
    DB-->>Repo: [Mobiles, Smartphones, Feature Phones, ...]
    Repo-->>R: subtree (category itself always included)
    R-->>Client: 200 [CategoryResponse, ...]
    end

    rect rgb(240, 245, 244)
    note over Client,DB: Step 2 — List published products in that category
    Client->>GW: GET /api/v1/products?category_id=14&sort=-price&page=1
    GW->>R: forward
    R->>Repo: build_catalog_query(category_id=14, sort="-price")
    Note right of Repo: published_only defaults True —\nfilters is_deleted=false AND status='PUBLISHED'\nin SQL, before pagination
    Repo->>DB: SELECT ... WHERE category_id=14 AND is_deleted=false\nAND status='PUBLISHED' ORDER BY retail_price DESC\nLIMIT 20 OFFSET 0
    DB-->>Repo: page of products + COUNT(*)
    Repo-->>R: (items, pagination)
    R-->>Client: 200 ProductPage
    end

    rect rgb(240, 245, 244)
    note over Client,Redis: Step 3 — Open one product's detail page
    Client->>GW: GET /api/v1/products/501
    GW->>R: forward
    R->>Redis: GET cache:product:501
    alt cache hit
        Redis-->>R: cached JSON
        R-->>Client: 200 (served from cache, DB not touched)
    else cache miss
        Redis-->>R: nil
        R->>DB: _get_visible_product(501): fetch, check is_deleted=false\nAND status='PUBLISHED'
        alt product is DRAFT/PENDING/REJECTED/ARCHIVED, or deleted, or missing
            DB-->>R: not visible
            R-->>Client: 404 Not Found
        else published
            DB-->>R: product row
            R->>Redis: SETEX cache:product:501 300s <json>
            R-->>Client: 200 ProductResponse
        end
    end
    end
```

## Notes

- This is the flow the HLD's "read-heavy, cache-first" scalability claim rests on: step 3's cache
  hit path never touches Postgres at all. Cache invalidation happens on the write side
  (`update_product`/`delete_product` call `redis.delete(f"cache:product:{id}")` before returning),
  not on a TTL alone.
- Step 2 deliberately does **not** cache — only single-product reads are cached today
  (`product_cache_ttl_seconds` applies to `get_product` only). List/filter results recompute every
  request; see the LLD's Performance Considerations for why this is an accepted gap at current
  scale rather than an oversight.
- Every branch in step 3 that returns a product also implicitly proves the product is
  `PUBLISHED` and not soft-deleted — there is no code path in this flow where a client can
  distinguish "doesn't exist" from "exists but not published yet," which is the intended
  behavior for a public endpoint (see the LLD's Edge Cases §1–2).
