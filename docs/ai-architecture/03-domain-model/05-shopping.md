# Cluster 05: Shopping

Last verified against commit: `f6115d1`

Domains: Cart, Wishlist — both Reserved-in-infra: a reserved `EventType`/topic and an
API Gateway route exist for each, but no `cart_service`/`wishlist_service` exists in
`services/`, and the gateway's `cart_service_url`/`wishlist_service_url` point at
upstreams (`http://cart-service:8005`, `http://wishlist-service:8006`) that are not
running anywhere in this repository. Everything below is a proposed design grounded in
what the reserved infra already commits this platform to, not a description of running
code.

---

## Domain: Cart

### Overview
- **Bounded Context:** proposed `cart_service`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.CART_CREATED`, `EventType.CART_UPDATED`, `Topics.CART`
  (`python/libs/ecom_common/src/ecom_common/events.py`); gateway route `/cart` →
  `cart_service_url`, policy `{"*": PUBLIC}` with the code comment "guest carts allowed;
  service distinguishes guests from users" (`api_gateway/route_table.py`)

### Business Responsibilities (proposed)
- Hold a customer's (or guest's) in-progress selection of products and quantities prior
  to checkout.
- Distinguish guest carts from authenticated-customer carts — the gateway policy is
  already `PUBLIC` for the entire `/cart` prefix specifically because "the service
  distinguishes guests from users," per the route table's own comment. That means cart
  identity resolution (session-based for guests, `user_id`-based for customers, with a
  merge step on login) is a real requirement already implied by the routing policy, not
  an invented one.
- Snapshot line-item prices at add-time from Product (the internal `GET
  /internal/products/{id}` endpoint is documented in-code as existing partly for this
  purpose), rather than trusting a client-supplied price.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Cart | `cart_id` (keyed by `session_id` for guests, `user_id` for authenticated customers) | Line-item quantities must be positive; a guest cart must be mergeable into a customer cart on login without silently dropping either side's items |

### Entities (proposed)
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| CartLineItem | Cart | `{product_id, quantity, unit_price_snapshot}` — price is snapshotted at add-time, not re-fetched live on every read, to avoid a hard dependency on `product_service` being up just to view a cart |

### Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| CartTotal | derived from line items, not stored | Would need Pricing/Discount/Coupon (cluster 04) to be more than "sum of snapshot prices" — those are all Conceptual-only, so a first Cart implementation would reasonably ship with just the sum |

### Domain Services (proposed)
- Guest-to-customer cart merge on login (combine line items, resolve quantity
  conflicts for the same product).

### Application Services / Repository Interfaces
None exist.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `CartCreated` | First item added to a new cart | Reserved-in-infra — name and topic exist, no producer |
| `CartUpdated` | Any line-item add/remove/quantity-change | Reserved-in-infra — same |

Note there is no reserved `CartCheckedOut` or `CartAbandoned` event — only creation and
generic update are reserved. A real implementation would need to decide whether
checkout is represented as a `CartUpdated` variant, a new event type (requiring an
`ecom_common` change), or entirely by the Order domain's `OrderCreated` event instead
(i.e. Cart never announces its own checkout, Order does).

### Commands (proposed)
- CreateCart (implicit, on first add), AddItem, UpdateItemQuantity, RemoveItem,
  ClearCart, MergeGuestCartIntoCustomerCart.

### Queries (proposed)
- GetCart(cart_id).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | Line items reference `product_id`; price snapshot sourced from Product at add-time | Product → Cart | `product_service`'s internal product-lookup endpoint already anticipates this caller |
| Inventory | A production Cart would typically soft-check availability before allowing add-to-cart, though actual reservation only happens at Order-creation time per the existing `OrderCreated` → `reserve()` flow (cluster 03) | Inventory → Cart | Not reserved by any event/route today — purely a design inference from how Inventory already expects to be driven |
| Order (Reserved-in-infra) | Checkout would transition a Cart into an Order | Cart → Order | Neither exists; this is the seam between two Reserved-in-infra domains |
| Coupon (Conceptual-only, cluster 04) | Coupon redemption would apply against a Cart total | Coupon → Cart | See cluster 04 |

### Open Questions / Design Gaps
- Whether Cart persists in Postgres (a new `cart_db`, matching the per-service-database
  pattern) or in Redis (lower durability, matches its transient nature better) is
  undecided — nothing in the reserved infra commits to either. Redis would be
  consistent with how `auth_service` already treats sessions as Redis-native rather than
  relational.
- Cart-abandonment / TTL policy is undesigned.

---

## Domain: Wishlist

### Overview
- **Bounded Context:** proposed `wishlist_service`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.WISHLIST_UPDATED`, `Topics.WISHLIST`
  (`python/libs/ecom_common/src/ecom_common/events.py`); gateway route `/wishlist` →
  `wishlist_service_url`, policy `{"*": {Role.CUSTOMER}}` (`api_gateway/route_table.py`)

### Business Responsibilities (proposed)
- Hold a customer's saved-for-later product list, distinct from Cart in both intent
  (no checkout path, no quantity concept beyond "in list or not") and access policy —
  unlike Cart's `PUBLIC` gateway policy, Wishlist is already gated to `Role.CUSTOMER`
  only, meaning (per the routing policy already committed) guests cannot have wishlists,
  only authenticated customers can.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Wishlist | `user_id` (one per customer, unlike Cart which needs guest support) | A product appears at most once per wishlist |

### Entities (proposed)
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| WishlistItem | Wishlist | `{product_id, added_at}` — no quantity or price snapshot needed, since Wishlist never checks out directly |

### Value Objects / Domain Services / Application Services / Repository Interfaces
None exist. Wishlist is deliberately simpler than Cart — no merge semantics (no guest
wishlists to merge, since the gateway policy already restricts it to authenticated
customers) and no price-snapshot concern (a wishlist shows current price, not a
locked-in one).

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `WishlistUpdated` | Any item add/remove | Reserved-in-infra — name and topic exist, no producer. Note only one generic event is reserved (unlike Cart's separate `Created`/`Updated` pair) — a real implementation would likely treat first-item-add as just another `WishlistUpdated` rather than needing a distinct creation event |

### Commands (proposed)
- AddToWishlist, RemoveFromWishlist.

### Queries (proposed)
- GetWishlist(user_id).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | Items reference `product_id`; no price snapshot needed (unlike Cart) | Product → Wishlist | — |
| Customer (cluster 01) | Keyed by `user_id`, restricted to `Role.CUSTOMER` at the gateway already | Customer → Wishlist | Real, currently-enforced gateway policy for a domain with no service behind it |
| Cart | A "move to cart" action is a common UX pattern connecting the two, but nothing in the reserved infra commits to it | Wishlist → Cart | Design inference only |

### Open Questions / Design Gaps
- Same persistence-layer question as Cart (Postgres vs Redis), with a stronger case for
  Postgres here since Wishlist is meant to be durable/long-lived rather than transient,
  unlike a shopping cart.
