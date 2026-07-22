# Cluster 09: Discovery & Intelligence

Last verified against commit: `f6115d1`

Domains: Search, Analytics, Recommendation, Reporting.

## Deviation note on Search's maturity tag

This cluster is grouped in the domain catalog as "all Conceptual-only," but that does
not hold up against the actual routing table: `services/api_gateway/src/api_gateway/route_table.py`
declares a live `/search` route (`upstream_name="search-service"`, policy
`{"*": PUBLIC}`), and `search-service` is one of the 7 route-table-reserved-but-unbuilt
upstreams already identified as pre-existing drift (cart, wishlist, orders, payments,
notifications, search, reviews). That makes Search **Reserved-in-infra by gateway route**,
not Conceptual-only — it is tagged that way in this file and in the domain catalog,
with this note explaining the deviation from the simpler cluster-level grouping.

What keeps Search from being fully Reserved-in-infra on the same footing as Cart/Order/
Payment/Notification/Reviews is that it has **no corresponding entry in
`ecom_common.events.EventType`** — the reserved event catalog stops at User, Product,
Inventory, Cart, Wishlist, Order, Payment, Refund, Notification, Review. Search is the
only one of the 7 route-reserved services with a route but no event-type reservation,
meaning whoever reserved the gateway routing didn't also commit to an event contract for
it — plausible, since a search index is more naturally built by *consuming* other
domains' events (`ProductCreated`/`Updated`/`Deleted`, which already exist and are
published) than by defining its own.

Analytics, Recommendation, and Reporting have neither a route nor a reserved event type
— they are genuinely Conceptual-only with zero infra footprint, unlike Search.

---

## Domain: Search

### Overview
- **Bounded Context:** proposed `search_service`
- **Maturity Tag:** Reserved-in-infra (gateway route only — see deviation note above)
- **Grounding:** gateway route `/search` → `search_service_url`
  (`http://search-service:8010`), policy `{"*": PUBLIC}`

### Business Responsibilities (proposed)
- Provide a queryable, indexed view of the catalog — full-text/faceted search across
  product name, description, category, brand — as an alternative to `product_service`'s
  own exact-match filtering (`category`/`sub_category`/`brand`/price-range params on
  `GET /products`, which is what backs catalog browsing today with no free-text search
  at all).
- Build and maintain that index by consuming `Topics.PRODUCT`
  (`ProductCreated`/`ProductUpdated`/`ProductDeleted`, all of which are real, published
  events today) rather than by having `product_service` write to it directly — this
  would make Search the second real Kafka consumer in the codebase alongside
  `inventory_service`.
- Backfill its index from `product_service`'s own internal, paginated dump endpoint —
  `GET /internal/products`, whose docstring in `product_service/api/routes.py` already
  states it exists "for the search-service backfill," i.e. this exact use case was
  anticipated when that endpoint was written.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| SearchIndexEntry | `product_id` (mirrors Product's identity, not a separate one) | Read-model only — no invariants of its own beyond staying eventually consistent with Product |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| SearchQuery | `{term, filters, sort, pagination}` | Would likely subsume `product_service`'s existing filter params rather than duplicate a different set |

### Domain Services (proposed)
- Index synchronization from `Topics.PRODUCT` events + periodic/on-demand backfill via
  `GET /internal/products`.

### Application Services / Repository Interfaces
None exist. Would depend on a search-oriented store (Elasticsearch/OpenSearch or a
Postgres full-text index) — no such dependency exists anywhere in this repository today.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| *(none reserved for Search itself)* | — | Search would be a pure **consumer** of `Topics.PRODUCT`, not a producer of its own domain events — nothing in the reserved catalog suggests otherwise |

### Commands / Queries (proposed)
- SearchProducts(query) — the one real query this domain exists to answer;
  `GET /search` is already `PUBLIC` at the gateway.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | Consumes `Topics.PRODUCT` events and the internal backfill dump | Product → Search | Both integration points already exist on the Product side, unused |
| Category, Brand (Conceptual-only, cluster 02) | Would be natural search facets, currently only available as free-text fields on Product | Category/Brand → Search | — |

### Open Questions / Design Gaps
- Whether the missing `EventType` reservation for Search is an oversight or an
  intentional signal that Search should never define its own domain events (pure
  consumer) is not resolvable from the code alone — this document takes the latter
  reading since it's the more defensible default (RAG/search indexes are typically
  derived read models, not sources of new business facts).
- Store choice (Elasticsearch/OpenSearch vs Postgres full-text) is out of scope here;
  see the forthcoming `02-rag-design.md` (unrelated but adjacent — that document covers
  a different retrieval use case, AI-assisted development tooling, not customer-facing
  catalog search) if a vector-DB-adjacent choice for this domain is ever considered.

---

## Domain: Analytics

### Overview
- **Bounded Context:** none
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no reserved `EventType`, no gateway route, no table

### Business Responsibilities (proposed)
- Aggregate cross-domain metrics (sales volume, conversion, inventory turnover) by
  consuming events already published across `Topics.PRODUCT`, `Topics.INVENTORY`, and,
  once real, `Topics.ORDER`/`Topics.PAYMENT` — a natural fit for this platform's
  existing one-topic-per-aggregate event design, since Analytics needs breadth across
  domains rather than depth within one.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| *(none in the traditional sense — Analytics is a read-model/reporting domain, not a domain with write-side invariants)* | — | — |

### Entities / Value Objects / Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| *(none — Analytics would be a pure consumer across multiple topics, like Search)* | — | Conceptual-only |

### Commands / Queries (proposed)
- GetSalesReport(period), GetInventoryTurnoverReport — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product, Inventory | Would consume already-real published events (`ProductCreated`/`Updated`/`Deleted`, `InventoryReserved`/`StockDeducted`/etc.) | Product/Inventory → Analytics | The only Conceptual-only domain in this cluster with a real, published event stream already available to consume from, despite having zero infra reservation of its own |
| Order, Payment (Reserved-in-infra) | Would consume their events once real | Order/Payment → Analytics | Neither produces events yet |

### Open Questions / Design Gaps
- No infra signal (route or event type) commits this platform to building Analytics as
  a separate service at all — it could equally be a downstream data-warehouse/BI
  concern outside the scope of this microservices catalog entirely. Not resolved here.

---

## Domain: Recommendation

### Overview
- **Bounded Context:** none
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no reserved `EventType`, no gateway route, no table

### Business Responsibilities (proposed)
- Generate personalized product suggestions from behavioral signals (views, purchases,
  wishlist adds) — every one of those signal sources (Search queries, Order history,
  Wishlist) is itself Reserved-in-infra or Conceptual-only, so Recommendation is the
  domain with the deepest chain of unbuilt dependencies in this entire catalog: it
  cannot be meaningfully implemented before at least Order and Wishlist exist.

### Aggregate Roots / Entities / Value Objects / Domain Services / Application Services / Repository Interfaces
None exist; none proposed in depth, for the same reason Coupon (cluster 04) is not
designed in depth — there is no concrete integration point to design against yet.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| *(none)* | — | Conceptual-only |

### Commands / Queries (proposed)
- GetRecommendationsForUser(user_id) — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Order, Wishlist, Search (all Reserved-in-infra or Conceptual-only) | Would be the primary behavioral-signal sources | Order/Wishlist/Search → Recommendation | None of the three exist yet, either |

### Open Questions / Design Gaps
- Deliberately not designed further than the dependency observation above — see the
  same reasoning applied to Coupon in cluster 04.

---

## Domain: Reporting

### Overview
- **Bounded Context:** none
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no reserved `EventType`, no gateway route, no table

### Business Responsibilities (proposed)
- Generate operator-facing reports (financial, fulfillment, catalog-health) for
  internal/admin consumption — distinct from Analytics, which is proposed here as
  cross-domain *metrics aggregation* for product/business decisions, whereas Reporting
  is proposed as scheduled, formatted output (e.g. a daily fulfillment report) for
  operational use. This mirrors a distinction already implicit in
  `inventory_service`'s own `/admin/inventory/health-report` endpoint — a real,
  admin-only, whole-table aggregate report that exists today entirely inside a Built
  domain (Inventory), not as a separate Reporting service.

### Aggregate Roots / Entities / Value Objects / Domain Services / Application Services / Repository Interfaces
None exist as a standalone domain — see the note above: the one real "reporting" feature
in this codebase (`GET /admin/inventory/health-report`) lives inside `inventory_service`
itself, which is a real, working precedent for keeping simple aggregate reports inside
the domain that owns the underlying data, rather than centralizing them in a separate
Reporting service.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| *(none)* | — | Conceptual-only |

### Commands / Queries (proposed)
- GenerateReport(type, period) — proposed only, and only worth building as a separate
  domain once report needs span more than one Built domain's own data (a single-domain
  report, per the Inventory precedent, doesn't need one).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Inventory | Already has its own in-domain reporting (`health_report`) — the precedent this domain's design should follow or explicitly diverge from | Inventory → Reporting | — |
| Analytics | Reporting would likely consume Analytics' aggregated data rather than recompute it independently, if both are ever built | Analytics → Reporting | Both Conceptual-only |

### Open Questions / Design Gaps
- Whether Reporting is worth building as a separate domain at all, given the working
  in-domain precedent (Inventory's `health_report`), is the central open question — this
  document does not resolve it, since no requirement in the codebase currently demands
  cross-domain reporting.
