# Domain Catalog

Last verified against commit: `f6115d1`

Single source of truth for "is domain X real yet." 29 domains, grouped into 9 clusters.
Maturity tags:

- **Built** — a real service with real persisted data backs this domain today.
- **Reserved-in-infra** — no service exists, but a reserved Kafka `EventType`/topic
  and/or an API Gateway route already point at it, so adding the service later is a
  drop-in rather than a new integration surface.
- **Conceptual-only** — a proposed DDD design exists (in the cluster file) with no
  supporting infra reservation of any kind: no service, no reserved event type, no
  gateway route.

Where a domain's maturity doesn't cleanly fit one bucket (e.g. it's real only as a field
on another aggregate, or it has a route but no event type), the Notes column says so —
don't infer more than the cluster file actually documents.

| Domain | Cluster | Maturity Tag | Real service / reserved infra | One-line responsibility |
|---|---|---|---|---|
| Identity | [01 – Identity & Access](./01-identity-and-access.md) | Built | `auth_service` (umbrella bounded context) | Owns the canonical identity record and credential lifecycle for every actor in the system |
| User | [01 – Identity & Access](./01-identity-and-access.md) | Built | `auth_service` — `users` table | Stores the account record: username, email, hashed password, role, SSO provider linkage |
| Authentication | [01 – Identity & Access](./01-identity-and-access.md) | Built | `auth_service` — signin/refresh/logout/SSO routes, Redis session store | Verifies credentials, issues/rotates JWT access+refresh pairs, manages sessions and denylisting |
| Authorization | [01 – Identity & Access](./01-identity-and-access.md) | Built | `ecom_common.auth.Role` enum + `require_roles` | Gates actions by role (CUSTOMER/SELLER/ADMIN/SUPPORT) across every service |
| Customer | [01 – Identity & Access](./01-identity-and-access.md) | Built (as a role value only, no dedicated table) | `Role.CUSTOMER` on `users.role` | Represents a buying-side account |
| Seller | [01 – Identity & Access](./01-identity-and-access.md) | Conceptual-only (partially evidenced) | `Role.SELLER` on `users.role`; `Product.seller_id` string reference | Represents a marketplace-side account that lists and manages products |
| Vendor | [01 – Identity & Access](./01-identity-and-access.md) | Conceptual-only | none | Proposed upstream-supply-side actor, distinct from a marketplace Seller |
| Product | [02 – Catalog](./02-catalog.md) | Built | `product_service` — `products` table | Owns the sellable catalog item and its listing metadata |
| Category | [02 – Catalog](./02-catalog.md) | Built (was Conceptual-only; promoted by Phase 1 Catalog Core) | `product_service` — `categories` table (self-referencing hierarchy, materialized `path`); `Product.category_id` FK, plus the still-present legacy `Product.category`/`Product.sub_category` flat text columns (not yet backfilled) | Hierarchical product classification, admin-managed |
| Brand | [02 – Catalog](./02-catalog.md) | Built (was Conceptual-only; promoted by Phase 1 Catalog Core) | `product_service` — `brands` table; `Product.brand_id` FK, plus the still-present legacy `Product.brand` flat text column (not yet backfilled) | Canonical brand/label entity, admin-managed |
| Inventory | [03 – Inventory & Warehouse](./03-inventory-and-warehouse.md) | Built | `inventory_service` — `inventory`, `inventory_reservations` tables | Owns the stock ledger per product: available/reserved/sold quantities and status |
| Warehouse | [03 – Inventory & Warehouse](./03-inventory-and-warehouse.md) | Conceptual-only | `Inventory.warehouse_location` (flat string column) | Proposed physical stock-location entity |
| Pricing | [04 – Pricing & Promotions](./04-pricing-and-promotions.md) | Conceptual-only | `Product.retail_price` (flat column) | Proposed rules-driven pricing engine |
| Discount | [04 – Pricing & Promotions](./04-pricing-and-promotions.md) | Conceptual-only | `Product.discount` (flat column) | Proposed discrete discount-rule entity |
| Promotion | [04 – Pricing & Promotions](./04-pricing-and-promotions.md) | Conceptual-only | none | Proposed time-boxed marketing campaign entity |
| Coupon | [04 – Pricing & Promotions](./04-pricing-and-promotions.md) | Conceptual-only | none | Proposed customer-redeemable discount code entity |
| Cart | [05 – Shopping](./05-shopping.md) | Reserved-in-infra | `EventType.CART_CREATED`/`CART_UPDATED`, `Topics.CART`, gateway `/cart` route | Proposed pre-purchase item basket per customer/guest session |
| Wishlist | [05 – Shopping](./05-shopping.md) | Reserved-in-infra | `EventType.WISHLIST_UPDATED`, `Topics.WISHLIST`, gateway `/wishlist` route | Proposed saved-for-later product list per customer |
| Order | [06 – Order Fulfillment](./06-order-fulfillment.md) | Reserved-in-infra | `EventType.ORDER_CREATED`/`ORDER_CONFIRMED`/`ORDER_FAILED`/`ORDER_CANCELLED`, `Topics.ORDER`, gateway `/orders` route; already consumed by `inventory_service` | Proposed purchase-intent aggregate driving reservation/fulfillment across services |
| Shipping | [06 – Order Fulfillment](./06-order-fulfillment.md) | Conceptual-only | none | Proposed fulfillment/delivery-tracking entity |
| Returns | [06 – Order Fulfillment](./06-order-fulfillment.md) | Conceptual-only | none | Proposed post-delivery return-request workflow, distinct from Refund |
| Payment | [07 – Payments](./07-payments.md) | Reserved-in-infra | `EventType.PAYMENT_STARTED`/`PAYMENT_COMPLETED`/`PAYMENT_FAILED`, `Topics.PAYMENT`, gateway `/payments` route; consumed by `inventory_service` | Proposed transaction-capture aggregate for charging a customer |
| Refund | [07 – Payments](./07-payments.md) | Reserved-in-infra | `EventType.REFUND_INITIATED`/`REFUND_COMPLETED`; `RefundCompleted` already consumed by `inventory_service` (triggers restock) | Proposed money-return aggregate, distinct from a Returns workflow |
| Reviews | [08 – Engagement](./08-engagement.md) | Reserved-in-infra | `EventType.REVIEW_CREATED`/`REVIEW_UPDATED`/`REVIEW_DELETED`, `Topics.REVIEW`, gateway `/reviews` route; `Product.rating`/`review_count` already exist as denormalized targets | Proposed customer product-feedback aggregate |
| Notification | [08 – Engagement](./08-engagement.md) | Reserved-in-infra | `EventType.NOTIFICATION_REQUESTED`/`NOTIFICATION_SENT`, `Topics.NOTIFICATION`, gateway `/notifications` route | Proposed outbound messaging dispatch aggregate |
| Search | [09 – Discovery & Intelligence](./09-discovery-and-intelligence.md) | Reserved-in-infra (route only — see deviation note in the cluster file) | gateway `/search` route only; **no** reserved `EventType` | Proposed catalog query/index service |
| Analytics | [09 – Discovery & Intelligence](./09-discovery-and-intelligence.md) | Conceptual-only | none | Proposed cross-domain metrics/aggregation capability |
| Recommendation | [09 – Discovery & Intelligence](./09-discovery-and-intelligence.md) | Conceptual-only | none | Proposed personalized product-suggestion capability |
| Reporting | [09 – Discovery & Intelligence](./09-discovery-and-intelligence.md) | Conceptual-only | none | Proposed operator-facing report generation capability |

## Cross-check performed

`libs/ecom_common/src/ecom_common/events.py::EventType` reserves exactly: User, Product,
Inventory, Cart, Wishlist, Order, Payment, Refund, Notification, Review. Every
Reserved-in-infra tag above traces to one of those, **except Search**, which is
Reserved-in-infra solely on the strength of its gateway route
(`services/api_gateway/src/api_gateway/route_table.py`) — it has no corresponding
`EventType`. This is the one place where the maturity tag needed to be derived by
cross-referencing two independent sources (event catalog and route table) rather than
one; see `09-discovery-and-intelligence.md` for the full note.
