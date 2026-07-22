# Cluster 08: Engagement

Last verified against commit: `f6115d1`

Domains: Reviews, Notification — both Reserved-in-infra: reserved `EventType` values,
a reserved topic, and a gateway route each, with no consumer or producer anywhere in
the current codebase for either (unlike Order/Payment/Refund in clusters 06–07, neither
of these two is consumed by `inventory_service` or any other existing service).

---

## Domain: Reviews

### Overview
- **Bounded Context:** proposed `review_service`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.REVIEW_CREATED`, `REVIEW_UPDATED`, `REVIEW_DELETED`,
  `Topics.REVIEW`; gateway route `/reviews` → `review_service_url`, policy
  `{"GET": PUBLIC, "*": {Role.CUSTOMER, Role.SUPPORT}}`. Additionally, `Product`
  already carries `rating: Decimal(3,2)` and `review_count: int` as denormalized
  columns — real, persisted fields with no current writer other than whatever seeded
  the catalog, since no Reviews service exists to update them.

### Business Responsibilities (proposed)
- Own the customer product-feedback aggregate: rating, text, and moderation state.
- Keep `Product.rating`/`review_count` in sync — the two fields already exist
  specifically to be a denormalized read target for a Reviews producer, per the shape
  of `product_service`'s own model comment ("rating is the denormalized review average").
  Today nothing updates them after initial catalog seeding.
- Enforce the gateway's already-live policy split: reads are `PUBLIC` (product pages can
  show reviews to anyone), writes require `Role.CUSTOMER` or `Role.SUPPORT` — `SUPPORT`
  presumably for moderation actions distinct from a customer's own review authorship.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Review | `review_id` | One review per `(customer_id, product_id)` pair (typical e-commerce constraint, not confirmed by any code); rating within a valid range (e.g. 1–5) |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| Rating | integer, bounded range | Range itself (1–5 vs 1–10) is not fixed by anything in the schema — `Product.rating` is `Numeric(3,2)`, which comfortably fits either |

### Domain Services (proposed)
- Rating aggregation: recompute `Product.rating`/`review_count` on
  `ReviewCreated`/`Updated`/`Deleted`. This would be the first real case of a
  Reserved-in-infra domain writing back into a Built domain's table (Product) —
  whether that happens via a direct cross-service write (not possible; separate
  databases) or via `product_service` itself consuming `Topics.REVIEW` is an open
  question (see below).

### Application Services / Repository Interfaces
None exist.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `ReviewCreated` | Customer submits a review | Reserved-in-infra — no producer, no consumer |
| `ReviewUpdated` | Customer edits their review | Reserved-in-infra — same |
| `ReviewDeleted` | Customer or moderator (`SUPPORT`) removes a review | Reserved-in-infra — same |

### Commands (proposed)
- SubmitReview, EditReview, DeleteReview, ModerateReview (`SUPPORT`-only).

### Queries (proposed)
- ListReviewsForProduct (would back the `GET /reviews` `PUBLIC` policy already reserved
  at the gateway).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | `rating`/`review_count` are pre-built denormalized targets | Reviews → Product | The only Reserved-in-infra domain in this catalog whose target write-back fields already exist as real columns on a Built domain |
| Customer (cluster 01) | Reviews are authored by a customer | Customer → Reviews | `Role.CUSTOMER` required at the gateway |
| Order (Reserved-in-infra, cluster 06) | A common e-commerce constraint is "only customers who purchased the product may review it" (verified-purchase reviews) | Order → Reviews | Not implied by any reserved infra — purely a design option, since nothing forces a purchase-verification requirement |

### Open Questions / Design Gaps
- How `Product.rating`/`review_count` actually get updated once Reviews exists is
  unresolved: either `product_service` grows its first Kafka **consumer** (subscribing
  to `Topics.REVIEW`, mirroring how `inventory_service` already consumes `Topics.ORDER`/
  `Topics.PAYMENT`), or Reviews recomputes and calls back into `product_service`'s API
  directly. The consumer approach is more consistent with this platform's existing
  event-driven pattern and doesn't introduce a synchronous cross-service call on the
  write path.
- Verified-purchase-only reviews (gating review submission on Order history) is a
  product decision this document does not make.

---

## Domain: Notification

### Overview
- **Bounded Context:** proposed `notification_service`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.NOTIFICATION_REQUESTED`, `NOTIFICATION_SENT`,
  `Topics.NOTIFICATION`; gateway route `/notifications` → `notification_service_url`,
  policy `{"*": AUTHENTICATED}`

### Business Responsibilities (proposed)
- Own outbound messaging dispatch (email/SMS/push) triggered by events from other
  domains — the two reserved event types (`NOTIFICATION_REQUESTED`,
  `NOTIFICATION_SENT`) describe a request/fulfillment pair, implying Notification is
  meant to be *driven by* other domains' events (a new user signing up, an order
  confirming, a payment failing) rather than originating its own business events.
- Be a consumer of, at minimum, `Topics.USER` (`UserCreated`, for a welcome
  notification) and, once built, `Topics.ORDER`/`Topics.PAYMENT` (order confirmation,
  payment failure alerts) — none of which it currently subscribes to, since it doesn't
  exist.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| NotificationRequest | `notification_id` | Exactly one terminal `NOTIFICATION_SENT` (or a failure state, which is not currently a reserved event — see below) per request |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| Channel | `EMAIL \| SMS \| PUSH` | Not implied by any reserved event field — payload shape is entirely undesigned |
| DeliveryStatus | derived from which reserved event fired | Only `SENT` is reserved; there is no `NotificationFailed` |

### Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `NotificationRequested` | Another domain's event triggers a need to notify (design inference — no producer exists anywhere yet, including in `auth_service`, which is the domain most likely to want a welcome notification) | Reserved-in-infra — no producer, no consumer |
| `NotificationSent` | Delivery succeeds | Reserved-in-infra — same |

### Commands (proposed)
- RequestNotification(recipient, template, context) — likely internal-only (published
  by other services, not called directly by a client), consistent with `AUTHENTICATED`
  rather than `PUBLIC` gateway policy on `/notifications`.

### Queries (proposed)
- ListNotificationsForUser(user_id) — the one client-facing read this domain plausibly
  needs; a "notifications inbox" view.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| User (Built, cluster 01) | `UserCreated` is the most obvious real trigger for a first notification (welcome email) — `Topics.USER` already exists and is already published | User → Notification | Not currently consumed by anything; would be Notification's first real integration if built |
| Order, Payment (Reserved-in-infra) | Order confirmation and payment failure are typical notification triggers | Order/Payment → Notification | Neither produces events yet either |

### Open Questions / Design Gaps
- No failure event (`NotificationFailed`) is reserved — only request and success. A real
  implementation would need either a new `ecom_common.events` entry or would have to
  treat delivery failure as a terminal non-event (logged only, no broadcast), which
  would be inconsistent with how every other Built domain in this codebase treats
  failures as first-class events (`ORDER_FAILED`, `PAYMENT_FAILED` both exist).
- Template/content management (what a "welcome email" actually contains) is entirely
  undesigned and out of scope for a domain model document.
