# Cluster 01: Identity & Access

Last verified against commit: `f6115d1`

Domains: Identity, User, Authentication, Authorization (all Built), Customer (Built as a
role value), Seller (Conceptual-only, partially evidenced), Vendor (Conceptual-only).

All Built domains in this cluster map to the single real service `auth_service` (port
8001, `auth_db`). `auth_service` is the umbrella bounded context; User, Authentication,
and Authorization are the finer-grained domains inside it.

---

## Domain: Identity

### Overview
- **Bounded Context:** `auth_service`
- **Maturity Tag:** Built
- **Grounding:** `services/auth_service/` — the whole service. There is no separate
  "Identity" table; this domain is the umbrella bounded context that owns User,
  Authentication, and Authorization below.

### Business Responsibilities
- Own the single canonical record of "who this actor is" for every other service.
- Be the one place role assignment (`Role.CUSTOMER` / `SELLER` / `ADMIN` / `SUPPORT`)
  is authored, so no other service invents its own notion of identity.
- Provide the only service-to-service identity lookup (`GET /internal/users/{user_id}`)
  other services are expected to call instead of caching a copy of user data long-term.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| User | `users.id` (UUID) | See the User domain below — Identity has no invariants beyond what User enforces |

### Entities / Value Objects / Domain Services / Application Services / Repository Interfaces / Domain Events / Commands / Queries
Not duplicated here — see the User, Authentication, and Authorization domains below,
which together constitute everything Identity owns.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | Identity supplies `seller_id` | auth_service → product_service | `Product.seller_id` is a bare string, validated only at the application layer (no DB FK — separate databases) |
| Inventory | Identity supplies the caller identity used by `require_seller`/`require_admin` | auth_service → inventory_service | Same pattern: token-carried role, no DB relationship |
| Order, Payment, Cart, Wishlist, Reviews (Reserved-in-infra) | Every proposed customer-facing domain in this catalog assumes a `user_id`/`customer_id` foreign reference back to Identity | auth_service → all | None of these exist yet; this is a forward-looking dependency, not a live one |

### Open Questions / Design Gaps
None — this is the most mature domain in the system. The only latent gap is external to
Identity itself: the API Gateway's `/users` route (`route_table.py`) targets a
`user_service_url` (`http://user-service:8002`) that is a separate, nonexistent upstream
from `auth_service` — see the note under the User domain below.

---

## Domain: User

### Overview
- **Bounded Context:** `auth_service`
- **Maturity Tag:** Built
- **Grounding:** `services/auth_service/src/auth_service/models.py::User`

### Business Responsibilities
- Persist the account record: identity, credential, role, activation state.
- Support both password-based accounts and SSO-only accounts (`hashed_password` is
  nullable specifically for SSO) in the same table without a discriminator subtype.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| User | `id: uuid.UUID` (primary key) | `username` unique; `email` unique (nullable); `provider_sub` unique (nullable); exactly one `role` at a time |

### Entities
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| *(none — User has no child entities today)* | — | — |

### Value Objects
| Value Object | Shape | Notes |
|---|---|---|
| Role | `StrEnum`: `CUSTOMER`, `SELLER`, `ADMIN`, `SUPPORT` (`ecom_common.auth.Role`) | Shared across every service via `ecom_common`, not owned exclusively by `auth_service` |
| Provider | `str`, default `"local"` | `"local"` or an SSO provider name (e.g. `"google"`); paired with nullable `provider_sub` |

### Domain Services
- None — User has no cross-entity domain logic beyond what the Authentication
  application service performs.

### Application Services
- `AuthService.register` (`service.py`) — creates a `local`-provider user, hashes the
  password, publishes `UserCreated`.
- `AuthService.sso_login` — upserts a user by `(provider, provider_sub)`, creating one
  with `hashed_password=None` on first login.
- `AuthService.get_user` — lookup by id, used by `/auth/validate`, `/auth/users/me`, and
  the internal service-to-service endpoint.

### Repository Interfaces
- Direct SQLAlchemy async session access via `ecom_common.db` — no separate repository
  abstraction layer exists for User today (unlike Product/Inventory, which use a
  `Repository` base from `ecom_common`).

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `UserCreated` | `register()` (new local account); `sso_login()` (first-time SSO account) | Built — actually published, `Topics.USER` |
| `UserUpdated` | *(none — reserved in `EventType` but never published anywhere in the codebase)* | Reserved-in-infra only, not wired to any code path |

### Commands
- SignUp (username/email/password) → creates a local User.
- SsoLogin (provider + subject + email/name claims) → upserts an SSO User.

### Queries
- GetUserById — used by `/auth/validate`, `/auth/users/me`, `/internal/users/{user_id}`.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Authentication | Authentication issues tokens *about* a User | User → Authentication | Same service, same database; not a cross-service call |
| Product | `Product.seller_id` references `User.id` as a bare string | User → Product | No DB-level FK (separate databases) |

### Open Questions / Design Gaps
- The API Gateway routes `/api/v1/users/*` to a `user_service_url`
  (`http://user-service:8002`) that is distinct from `auth_service_url`
  (`http://auth-service:8001`) and does not correspond to any real service
  (`services/api_gateway/src/api_gateway/config.py`). All real User functionality today
  is actually served under `/api/v1/auth/*` by `auth_service`. This is a verified,
  additional drift beyond the 7 route-table-reserved-but-unbuilt services already known
  (cart, wishlist, orders, payments, notifications, search, reviews) — flagging it here
  because it directly affects how the User domain is reached through the gateway.
- `UserUpdated` is reserved as an `EventType` but has no producer. If profile-edit
  functionality is added to `auth_service`, this is the event that should fire.

---

## Domain: Authentication

### Overview
- **Bounded Context:** `auth_service`
- **Maturity Tag:** Built
- **Grounding:** `services/auth_service/src/auth_service/{security.py,sessions.py,service.py,oauth_google.py,api/routes.py}`

### Business Responsibilities
- Verify credentials (password or SSO ID token) and issue a JWT access/refresh pair.
- Rotate refresh tokens on use and detect reuse of a rotated-away token as a signal to
  kill the whole session.
- Track active sessions per user in Redis and support revoking one or all of them.
- Deny-list a spent access token's `jti` for the remainder of its natural lifetime on
  logout, so a stolen-but-not-yet-expired access token stops working immediately.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Session | `sid` (session id, Redis key `session:{sid}`) | One `current_refresh_jti` per session; session TTL == refresh-token TTL |

### Entities
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| Refresh token record | Session | Redis key `refresh:{jti}` → `sid`; deleted and replaced on rotation |
| Denylist entry | *(standalone, not owned by a Session)* | Redis key `denylist:jti:{jti}`, TTL = remaining access-token lifetime |

### Value Objects
| Value Object | Shape | Notes |
|---|---|---|
| TokenPair | `{access_token, refresh_token}` (`schemas.TokenPair`) | Returned by every sign-in/refresh/SSO endpoint |
| TokenPayload | `{sub, email, username, role}` (`ecom_common.auth.TokenPayload`) | `role` absent on refresh tokens ("carry minimal claims") |

### Domain Services
- Password hashing/verification (`security.py`).
- Google ID-token verification and PKCE authorization-code exchange (`oauth_google.py`)
  for the server-side `sso/google/authorize` → `sso/google/callback` flow, as distinct
  from the client-verified-token `sso/google` (One Tap / GIS) path.

### Application Services
- `AuthService.authenticate` — verifies username/password.
- `AuthService.issue_token_pair` — mints access+refresh JWTs and creates a `SessionStore`
  session.
- `AuthService.refresh_tokens` — validates and rotates a refresh token via
  `SessionStore.rotate_refresh`.
- `AuthService.logout` / `logout_all` — denylist current `jti` + destroy one/all sessions.

### Repository Interfaces
- `SessionStore` (`sessions.py`) — the closest thing to a repository for this domain;
  wraps Redis directly rather than going through `ecom_common`'s generic repository base
  (that base is Postgres-oriented and doesn't fit session/session-store semantics).

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| *(none)* | — | Authentication does not publish domain events; sign-in/sign-out are session-local operations, not broadcast facts other services need to react to |

### Commands
- SignIn (username, password) → TokenPair.
- RefreshTokens (refresh_token) → new TokenPair, old refresh token invalidated.
- Logout (current access token) → session destroyed, access `jti` denylisted.
- LogoutAll (current user) → every session for that user destroyed.
- SsoGoogleLogin / SsoLogin (generic) → TokenPair, upserting the User if new.

### Queries
- ValidateToken — resolves a bearer token to its owning User (`/auth/validate`).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| User | Authenticates against, and issues tokens describing, a User | Authentication → User | Same service |
| Authorization | Every issued token carries the `role` claim Authorization enforces downstream | Authentication → Authorization | Same service; every other service trusts the token's role claim without re-querying auth_service |

### Open Questions / Design Gaps
None identified — this is a fully implemented, tested domain (see
`services/auth_service/tests/unit/test_token_rotation.py`, cited in the root README as
the canonical test pattern other services mirror).

---

## Domain: Authorization

### Overview
- **Bounded Context:** `ecom_common` (shared) + every service that enforces it
- **Maturity Tag:** Built
- **Grounding:** `libs/ecom_common/src/ecom_common/auth.py::Role`, `require_roles`; used
  by `auth_service`, `product_service`, `inventory_service`, and `api_gateway`

### Business Responsibilities
- Define the one role vocabulary (`CUSTOMER`, `SELLER`, `ADMIN`, `SUPPORT`) every
  service checks against.
- Provide a single dependency-injection helper (`require_roles`) so route-level RBAC is
  written the same way in every service instead of being reimplemented per service.
- At the gateway, additionally gate entire route prefixes by role before a request ever
  reaches an upstream service (`route_table.py`'s `policy_for`).

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| *(none — Authorization is a cross-cutting policy, not an aggregate with persisted state of its own)* | — | A caller's `role` claim must be in the required set for the route/action, with `ADMIN` always allowed as an override |

### Entities / Value Objects
| Value Object | Shape | Notes |
|---|---|---|
| Role | `StrEnum` — see User domain above | Single shared definition |
| Policy | `PUBLIC \| AUTHENTICATED \| {Role, ...}` (`api_gateway/route_table.py`) | Gateway-level policy per route prefix + HTTP method |

### Domain Services
- `require_roles(get_current_token_dep, *roles)` (`ecom_common.auth`) — FastAPI
  dependency factory used identically across `auth_service`, `product_service`, and
  `inventory_service`.

### Application Services / Repository Interfaces
- None — Authorization is stateless policy evaluation against a token already issued by
  Authentication; it persists nothing.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| *(none)* | — | Authorization decisions are not broadcast as events |

### Commands / Queries
- None in the CQRS sense — Authorization is invoked synchronously as a guard, not as a
  command or query in its own right.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | `require_seller`/`require_admin` gate create/update/delete/seed routes | Authorization → Product | `product_service/api/routes.py` |
| Inventory | `require_seller`/`require_admin` gate mutation and reporting routes | Authorization → Inventory | `inventory_service/api/routes.py` |
| Every proposed domain (Cart, Order, Payment, ...) | Gateway route policies already assign a required role set even though no service exists yet | Authorization → all | e.g. `/wishlist` requires `Role.CUSTOMER`, `/reviews` requires `{Role.CUSTOMER, Role.SUPPORT}` — a real, currently-enforced (at the gateway) policy for a domain that has nothing behind it |

### Open Questions / Design Gaps
None for the mechanism itself. The one thing worth flagging: gateway-level role policies
for Reserved-in-infra domains (Cart, Wishlist, Order, Payment, Notification, Search,
Reviews) are live and would actually be enforced today if traffic reached those prefixes
— it just 404s/connection-errors past the gateway because the upstream doesn't exist.
That's a pre-existing fact, not something this document is proposing to change.

---

## Domain: Customer

### Overview
- **Bounded Context:** `auth_service`
- **Maturity Tag:** Built, but only as a `Role` value — there is no `customers` table,
  no Customer aggregate, and no Customer-specific fields anywhere in the schema
- **Grounding:** `Role.CUSTOMER` is the default value of `User.role`
  (`models.py: role: Mapped[str] = mapped_column(..., default=Role.CUSTOMER.value, ...)`)

### Business Responsibilities
- Represent the buying-side actor that every Reserved-in-infra and Conceptual-only
  commerce domain (Cart, Wishlist, Order, Payment, Reviews, ...) is designed around.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| *(none distinct from User)* | `users.id` where `role == CUSTOMER` | Whatever User enforces; Customer adds no invariant of its own today |

### Entities / Value Objects / Domain Services / Application Services / Repository Interfaces
Not applicable — fully subsumed by User today.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `UserCreated` (payload includes role) | A user signs up/SSOs in with the default role | Built, shared with the User domain — there is no Customer-specific event |

### Commands / Queries
Not applicable — routed entirely through User's commands/queries.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Cart, Wishlist, Order, Payment, Reviews (all Reserved-in-infra) | Every proposed aggregate in those domains is designed to key off a customer's `user_id` | Customer → all | None of these exist yet |

### Open Questions / Design Gaps
- If a real Order/Cart/Wishlist service is ever built, whether Customer should stay a
  pure role value on User or become its own bounded context with customer-specific data
  (shipping addresses, loyalty tier, marketing consent, ...) is an open design question.
  Nothing in the current codebase forces either direction.

---

## Domain: Seller

### Overview
- **Bounded Context:** none dedicated — currently expressed entirely as a `Role` value
  plus a bare foreign-key-shaped string
- **Maturity Tag:** Conceptual-only (partially evidenced — this is not a pure design
  exercise; two real code artifacts already assume Seller's existence)
- **Grounding:** `Role.SELLER` on `User.role`; `Product.seller_id: str | None` (comment:
  "user id of the owning seller"); `require_seller` gates in both `product_service` and
  `inventory_service`

### Business Responsibilities (proposed)
- Own a marketplace account distinct from a buying Customer: the entity that lists
  Products and manages their Inventory.
- Be the authorization boundary that `product_service`'s "sellers can only modify their
  own products" rule (`update_product`/`delete_product` in `product_service/api/routes.py`)
  is already checking against, today, using nothing more than string equality between
  `token.sub` and `Product.seller_id`.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Seller | `user_id` (would reuse `User.id`, not a new identity space) | A Seller can only mutate Products/Inventory rows where it is the recorded owner — already true today via the string-equality check, just not backed by a dedicated Seller table |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| SellerProfile | store name, verification status, payout details | None of this exists; today "being a seller" is entirely captured by `Role.SELLER` |

### Domain Services / Application Services / Repository Interfaces
None exist. If built, this would most naturally live as a new bounded context (its own
service or a module within `auth_service`), not inside `product_service`, since Seller
identity is an Identity-cluster concern even though its consequences (ownership checks)
currently live in `product_service` and `inventory_service`.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `SellerOnboarded` / `SellerVerified` | Not reserved anywhere — not in `EventType`, not in `Topics` | Conceptual-only |

### Commands / Queries (proposed)
- RegisterAsSeller, VerifySeller — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| User | Seller is a role held by a User, not a separate identity | User → Seller | `Role.SELLER` |
| Product | `Product.seller_id` is the ownership FK already enforced today | Seller → Product | No DB-level FK — string equality check only, in application code |
| Inventory | `require_seller` gates mutation routes | Seller → Inventory | Ownership is not currently re-checked against `Product.seller_id` inside `inventory_service` — any authenticated SELLER can mutate any product's inventory row today, unlike `product_service`'s per-row ownership check |
| Vendor | Distinct concept — see Vendor below | — | Seller is marketplace-facing (lists/sells to Customers); Vendor is proposed as supply-side (supplies stock to a Warehouse) |

### Open Questions / Design Gaps
- **Real inconsistency worth flagging:** `product_service` enforces per-row seller
  ownership (`product.seller_id not in (None, user.sub)`), but `inventory_service` does
  not — its `require_seller` dependency only checks the caller's role, not whether they
  own the product the inventory row belongs to. This is a genuine gap in the current
  implementation, not a proposed design decision; a formal Seller aggregate would be the
  natural place to centralize this check instead of leaving it inconsistently
  implemented per service.
- Whether Seller should be a role-flag on User (current pattern) or a fully separate
  aggregate with its own lifecycle (apply → review → verify → active/suspended) is
  unresolved.

---

## Domain: Vendor

### Overview
- **Bounded Context:** none
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no role, no table, no field, no event, no route references
  "vendor" anywhere in the codebase

### Business Responsibilities (proposed)
- Represent a supply-side actor distinct from a marketplace Seller: an entity that
  supplies stock *to* the platform (e.g. into a Warehouse) rather than listing products
  *on* the platform for Customers to buy directly. This distinction only matters once
  Warehouse (cluster 03) and a real multi-supplier inventory model exist; today
  Inventory is a flat per-product ledger with no supplier concept at all.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Vendor | `vendor_id` | Would own purchase-order-style replenishment into Warehouse stock, not consumer-facing listings |

### Entities / Value Objects / Domain Services / Application Services / Repository Interfaces / Domain Events / Commands / Queries
None exist. Nothing to ground — this section is deliberately left as a placeholder
rather than speculatively designed in depth, since without a Warehouse or a
multi-supplier Inventory model there is no concrete integration point to design against.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Seller | Distinct, not a synonym — see the note under Seller | — | — |
| Warehouse | Would supply stock into a Warehouse, once Warehouse exists as more than a string field | Vendor → Warehouse | Both are Conceptual-only |

### Open Questions / Design Gaps
- Whether Vendor is even needed as a distinct domain from Seller depends entirely on
  whether this platform ever models B2B replenishment/supply chain, versus staying a
  pure Seller-to-Customer marketplace. No signal in the current codebase indicates
  either direction. Kept as a named placeholder per the domain catalog rather than
  designed further, to avoid inventing structure the product direction hasn't asked for.
