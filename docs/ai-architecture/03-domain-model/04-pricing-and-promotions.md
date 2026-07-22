# Cluster 04: Pricing & Promotions

Last verified against commit: `f6115d1`

Domains: Pricing, Discount, Promotion, Coupon — all Conceptual-only. None of these four
have a reserved `EventType`, a reserved gateway route, or any dedicated table. Two of
them (Pricing, Discount) have a narrow real footprint as flat columns on `Product`;
Promotion and Coupon have no code footprint at all.

---

## Domain: Pricing

### Overview
- **Bounded Context:** none dedicated
- **Maturity Tag:** Conceptual-only
- **Grounding:** `Product.retail_price: Decimal(12, 2)` — a single static price per
  product, set at creation/update time by the owning Seller or an Admin, with no
  history, no currency field, and no rule engine of any kind

### Business Responsibilities (proposed)
- Own price determination as a first-class concern: base price, currency, and any
  computed adjustments (tiered pricing, regional pricing, time-based pricing) that
  today would have to be hand-set by whoever calls `PUT /products/{id}`.
- Provide a price history / audit trail, which the current flat column cannot support.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| PriceList / PricePoint | `product_id` (+ effective date, if history is modeled) | Price must be non-negative; currency must be consistent within a price list |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| Money | `{amount: Decimal, currency: str}` | Current `retail_price` has no currency field at all — implicitly single-currency |

### Domain Services / Application Services / Repository Interfaces
None exist. If built, this would sit adjacent to `product_service` (Pricing needs to
read/influence what's displayed as a Product's price) but is deliberately not folded
into the Product aggregate above — pricing rules (tiering, regional, time-boxed) are a
different rate of change and a different owner (pricing/finance) than catalog content
(name, description, images), which is the standard DDD justification for splitting them
even before either exists in code.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `PriceChanged` | Not reserved anywhere | Conceptual-only |

### Commands / Queries (proposed)
- SetPrice, GetEffectivePrice(product_id, context) — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | Would replace/augment the flat `retail_price` column | Pricing → Product | — |
| Discount, Promotion, Coupon | All four would compose to produce a final displayed price; kept as separate domains rather than one "Pricing" bucket because each has a distinct lifecycle (see each domain below) | Pricing ↔ Discount/Promotion/Coupon | — |

### Open Questions / Design Gaps
- Whether Pricing should own the *final* displayed price (composing Discount/Promotion/
  Coupon itself) or simply expose the base price and let a separate calculation step
  compose all four is undecided — no implementation exists to settle it either way.

---

## Domain: Discount

### Overview
- **Bounded Context:** none dedicated
- **Maturity Tag:** Conceptual-only
- **Grounding:** `Product.discount: Decimal(12, 2)` — a single static amount per
  product, no rule, no expiry, no eligibility condition; it is unclear from the schema
  alone whether it represents a flat amount or a percentage (no unit/type field), and
  nothing in `product_service` currently reads it to compute an effective sale price —
  it is stored and returned as-is

### Business Responsibilities (proposed)
- Model a discrete, product-scoped price reduction with an explicit type (percentage vs
  flat amount), an eligibility window, and — unlike today's column — something that
  actually gets applied at checkout/display time rather than just stored.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Discount | `discount_id` | Discount value must not reduce price below zero; effective window (start/end) must be valid if present |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| DiscountAmount | `{type: PERCENT \| FLAT, value: Decimal}` | The exact ambiguity the current flat `Product.discount` column doesn't resolve |

### Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `DiscountApplied` / `DiscountExpired` | Not reserved anywhere | Conceptual-only |

### Commands / Queries (proposed)
- ApplyDiscount, RemoveDiscount, GetActiveDiscount(product_id) — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | Would replace the flat `discount` column with a real rule | Discount → Product | — |
| Promotion | A Promotion could bundle multiple Discounts under one campaign; kept distinct because a Promotion has campaign-level scheduling/targeting that a single product-scoped Discount does not need | Promotion → Discount | Both Conceptual-only |

### Open Questions / Design Gaps
- What the current `Product.discount` column's unit actually is (percentage or flat
  amount) is genuinely ambiguous from the schema and is not resolved by any consuming
  code — a real Discount domain would need to either migrate this column's meaning
  explicitly or deprecate it in favor of a typed replacement.

---

## Domain: Promotion

### Overview
- **Bounded Context:** none dedicated
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no table, column, event, or route references promotions
  anywhere in the codebase

### Business Responsibilities (proposed)
- Model a time-boxed marketing campaign that can apply Discounts across a set of
  products (a category, a brand, or an explicit product list) rather than one product at
  a time, with its own start/end scheduling independent of any single product's
  lifecycle.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Promotion | `promotion_id` | Active window must be valid; target scope (products/category/brand) must resolve to at least one eligible product to be worth activating |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| PromotionScope | `{type: PRODUCT_LIST \| CATEGORY \| BRAND, targets: [...]}` | Depends on Category/Brand existing as real domains to scope by, not just free text |

### Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `PromotionStarted` / `PromotionEnded` | Not reserved anywhere | Conceptual-only |

### Commands / Queries (proposed)
- CreatePromotion, ActivatePromotion, ListActivePromotions — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Discount | Composes/generates Discounts for its scope | Promotion → Discount | Both Conceptual-only |
| Category, Brand | Would be a natural scoping mechanism, but both are themselves Conceptual-only (flat text on Product today) | Category/Brand → Promotion | A Promotion scoped by category would, in the interim, have to scope by the free-text `Product.category` value directly |

### Open Questions / Design Gaps
- Entirely undesigned beyond the shape above — there is no code signal (not even a
  reserved event type or route) indicating this platform has committed to building
  campaign-style promotions, unlike Cart/Wishlist/Order/Payment/Notification/Reviews,
  which at minimum reserved infra ahead of implementation.

---

## Domain: Coupon

### Overview
- **Bounded Context:** none dedicated
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no table, column, event, or route references coupons anywhere
  in the codebase

### Business Responsibilities (proposed)
- Model a customer-redeemable code that applies a Discount (or a Promotion's discount)
  at checkout, with redemption tracking (single-use vs multi-use, per-customer limits,
  usage count) that has no analog anywhere in the current schema.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Coupon | `code` (unique) | A redemption cannot exceed the coupon's configured usage limit; expired coupons cannot be redeemed |

### Entities (proposed)
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| Redemption | Coupon | One row per redemption event, for the usage-limit invariant above |

### Value Objects / Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `CouponRedeemed` | Not reserved anywhere | Conceptual-only |

### Commands / Queries (proposed)
- CreateCoupon, RedeemCoupon, ValidateCoupon(code, customer_id, cart_total) — proposed
  only. `ValidateCoupon` would need to call into Cart (Reserved-in-infra) and Discount
  (Conceptual-only), neither of which exists — this domain has the deepest chain of
  unbuilt dependencies of any domain in the catalog.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Cart (Reserved-in-infra, cluster 05) | Coupon redemption would apply against a Cart total at checkout time | Coupon → Cart | Cart itself has no service yet |
| Discount | A Coupon's effect is a Discount applied via a code instead of automatically | Coupon → Discount | Both Conceptual-only |

### Open Questions / Design Gaps
- No design work beyond the shape above is warranted until Cart (its most immediate
  real dependency) has at least a Reserved-in-infra-to-Built transition — designing
  Coupon's checkout-time integration in more depth now would be speculating against a
  Cart implementation that doesn't exist to validate assumptions against.
