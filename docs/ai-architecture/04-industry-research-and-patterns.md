# Industry Research and Patterns

Last verified against commit: `f6115d1`

## 1. Overview and Methodology

This document extracts publicly documented architecture patterns from four categories of
industry reference and evaluates each one against this repository's actual code, not
against where the repository might be in a year:

- **Open-source e-commerce platforms** (Medusa, Saleor, Spree, as examples of the
  genre) — patterns described generically from public knowledge of how modular
  commerce platforms structure domains, not from a line-by-line audit of any one
  project's current source.
- **Cloud reference architectures** — Microsoft Azure Architecture Center's
  microservices reference architecture, CQRS and event-driven guidance, and the AWS
  Well-Architected Framework's five (now six) pillars.
- **Patterns publicly associated with large engineering organizations** — Netflix
  (circuit breakers, chaos engineering), Uber (domain-oriented microservice
  architecture, service mesh at scale), Shopify (modular-monolith journey, checkout
  resilience), Amazon (two-pizza team ownership, cell-based architecture).

None of the claims below assert exact internal implementation details of any named
company's production system — they are framed as "a pattern publicly documented and
commonly associated with X," which is the limit of what's verifiable from outside those
organizations. Where this repository's own code demonstrates a pattern, that is stated
as a fact with a file citation, not an inference.

**What "applicable" means here.** This repo is a 4-service FastAPI monorepo
(`auth_service:8001`, `product_service:8003`, `inventory_service:8004`,
`api_gateway:8080`) with per-service Postgres databases, a single-broker Kafka instance
(`docker-compose.yml`'s `kafka` service: `KAFKA_NODE_ID: 1`, one node acting as both
broker and controller), and `python/libs/ecom_common` as shared code. `terraform/eks.tf`
defines an EKS cluster but nothing is provisioned from it — there is no live Kubernetes,
no service mesh, and no production traffic. A pattern is marked **"already adopted"**
only if there is a code citation proving it; **"applicable now"** if it fits the current
4-service, single-broker, no-mesh reality and would pay for itself before the next
domain (Order/Payment/Cart) ships; and **"Future Improvement / not applicable at
current scale"** if it solves a problem this repo does not yet have (hundreds of
services, multi-region traffic, dedicated platform teams) and adopting it now would add
operational weight with no corresponding benefit.

## 2. Proven Domain Models and Service Boundaries

Open-source commerce platforms in the Medusa/Saleor/Spree genre, and the domain
boundaries implied by DDD-oriented e-commerce writing generally, converge on a
similar module split: **Identity/Account**, **Catalog** (product, category, variant),
**Inventory/Stock**, **Pricing/Promotions**, **Cart**, **Order**, **Payment**,
**Fulfillment/Shipping**, and **Customer Engagement** (reviews, notifications). This is
a genre-level convergence, not a claim about any single project's exact module names.

| Industry-genre boundary | This repo's equivalent | Status |
|---|---|---|
| Identity/Account | `auth_service` | Built — matches the genre boundary closely; owns credential lifecycle, JWT issuance, Redis sessions (see `03-domain-model/01-identity-and-access.md`) |
| Catalog | `product_service` | Built — matches; Category/Brand collapsed into flat columns on `Product` rather than separate aggregates (see `03-domain-model/02-catalog.md`) |
| Inventory/Stock | `inventory_service` | Built — matches; already the consumer-side integration point for Order/Payment/Refund events (see §3) |
| Cart | none yet | Reserved-in-infra only — `EventType.CART_CREATED`/`CART_UPDATED`, `Topics.CART`, gateway `/cart` route exist; no service |
| Order | none yet | Reserved-in-infra only — `EventType.ORDER_CREATED`/`ORDER_CONFIRMED`/`ORDER_FAILED`/`ORDER_CANCELLED`, `Topics.ORDER`, gateway `/orders` route; **already consumed** by `inventory_service` |
| Payment | none yet | Reserved-in-infra only — `EventType.PAYMENT_STARTED`/`PAYMENT_COMPLETED`/`PAYMENT_FAILED`, `Topics.PAYMENT`; consumed by `inventory_service` |
| Pricing/Promotions | none | Conceptual-only — `Product.retail_price`/`discount` are flat columns, no rules engine |
| Fulfillment/Shipping | none | Conceptual-only — no reserved event type or route |

**Applicability to this repo today.** The genre-level boundary split is already the shape
this repo is converging toward — the Domain Catalog's own maturity tiers (Built /
Reserved-in-infra / Conceptual-only) track almost one-to-one with the industry-standard
module list above. The one deliberate deviation worth naming: this repo does **not**
split Category and Brand into their own bounded contexts the way a mature catalog module
typically would, keeping them as flat text columns on `Product` instead
(`03-domain-model/02-catalog.md`). That is a reasonable simplification at 4 services and
should not be "fixed" preemptively — the industry pattern of a separate Category
aggregate earns its complexity once category hierarchies, faceted search, or
multi-parent taxonomies are actual requirements, none of which exist here yet.

## 3. Event Flow Patterns

Azure's event-driven architecture guidance and the general publish/subscribe pattern
associated with large-scale event-driven systems (a lineage Netflix, Uber, and Amazon
have all publicly written about in different forms) converge on a small set of
recurring building blocks: a canonical event envelope, one topic per aggregate
partitioned for per-entity ordering, idempotent consumers, and a dead-letter path for
poison messages.

This repo's actual event design (`python/libs/ecom_common/src/ecom_common/events.py` and
`python/libs/ecom_common/src/ecom_common/kafka.py`) already implements the core of this
pattern set:

| Industry pattern | This repo's implementation | Status |
|---|---|---|
| Canonical event envelope (id, type, version, timestamp, producer, correlation id, payload) | `EventEnvelope` — `event_id`, `event_type`, `event_version`, `occurred_at`, `producer`, `correlation_id`, `partition_key`, `payload` | Already adopted — `events.py:63-71` |
| One topic per aggregate, partitioned by aggregate id for ordering | `Topics` class docstring: "One topic per aggregate; the envelope's event_type discriminates. Partitioning by aggregate id preserves per-entity ordering," `partition_key` used as the Kafka message key | Already adopted — `events.py:9-27`, `kafka.py:67` (`send_and_wait(topic, payload, key=envelope.partition_key)`) |
| Consumer-side idempotency (dedupe redelivered messages) | Redis `SET NX` claim on `evt:{group}:{event_id}` before invoking a handler | Already adopted — `kafka.py:153-157` (in `inventory_service/consumers.py`'s framing) / `kafka.py:78-186` |
| Retry-then-dead-letter for poison messages | 3 in-process retries (1s/2s/4s backoff), then publish to `<topic>.dlq` and commit so a bad message doesn't wedge the partition | Already adopted — `kafka.py:159-186`, `Topics.dlq()` |
| Business-level idempotency distinct from infra-level dedup | `InventoryReservation`'s `(product_id, order_id)` unique constraint, called out explicitly in `consumers.py`'s own docstring as separate from Redis-level dedup | Already adopted — `inventory_service/consumers.py:16-18` |
| Choreography over orchestration for cross-service workflows | `inventory_service` reacts to `OrderCreated`/`PaymentCompleted`/`OrderCancelled`/`PaymentFailed`/`RefundCompleted` independently — no central saga orchestrator exists | Already adopted (by absence of an orchestrator) — see caveat below |
| Idempotent producer (Kafka-level, exactly-once-ish delivery to the broker) | `AIOKafkaProducer(..., enable_idempotence=True)` | Already adopted — `kafka.py:26` |

**Applicability to this repo today.** This is the strongest area of alignment between
the repo and industry pattern literature — most of the event-flow patterns above are not
proposals, they are already shipped. The one open question is **choreography vs.
orchestration** as Order/Payment/Cart come online: `inventory_service`'s consumer
already treats `OrderConfirmed` as a "defensive fallback" for COD-style flows where
confirmation may precede payment capture (`consumers.py:10, 138-141`), which is exactly
the kind of implicit cross-service state coordination that tends to get harder to reason
about as more services join a choreographed flow. At 4 services this is fine and adding
a saga orchestrator now would be premature machinery. Once Order, Payment, and Cart are
all real, revisit whether the checkout flow's cross-service invariants (e.g. "payment
must not be attempted before inventory is reserved") are still provable by reading
individual consumers, or whether they need an explicit orchestrator — this is a
Recommended Adoption Priority item (§8), not something to build speculatively today.

## 4. Database Design Patterns

The **database-per-service** pattern — each microservice owns an exclusive schema/
database and no other service reads or writes it directly — is the load-bearing
database pattern in essentially every microservices reference architecture, including
Azure's, and is the explicit alternative to the shared-database anti-pattern named in
§7.

This repo already implements it in full: `docker-compose.yml` provisions one Postgres
instance with three separate logical databases (`auth_db`, `product_db`,
`inventory_db`), each with its own least-privilege credential
(`AUTH_DB_PASSWORD`/`PRODUCT_DB_PASSWORD`/`INVENTORY_DB_PASSWORD`), and each service's
`DATABASE_URL` points only at its own database
(`docker-compose.yml:113,133,155`; provisioned via
`deploy/postgres/init-databases.sh`). No service's ORM models or connection string
reference another service's database.

| Industry pattern | This repo's implementation | Status |
|---|---|---|
| Database-per-service, no cross-service direct DB access | Separate `auth_db`/`product_db`/`inventory_db` on one Postgres instance, distinct credentials per service | Already adopted — `docker-compose.yml:61-159`, `deploy/postgres/init-databases.sh` |
| Cross-service data consistency via events, not joins/foreign keys | `product_id` is referenced across `product_service` and `inventory_service` only as an opaque value carried in event payloads and API responses, never as a cross-database foreign key | Already adopted — evidenced by the event payload shapes in `consumers.py:49-57` |
| Read replicas / CQRS read models per service | None | Not applicable at current scale — single Postgres instance, no read/write split, no reported read-latency pressure |
| Outbox pattern (transactional write + event publish atomicity) | Not present — `_publish` in `inventory_service/consumers.py:41-61` publishes *after* the DB write inside a `try/except Exception: log.exception(...)`, meaning a crash between commit and publish silently drops the event | Gap, not yet adopted — see §7 and §8 |
| Physically separate database instances per service (not just separate schemas on one instance) | Single shared Postgres *instance*, logically separated databases | Partially adopted / Future Improvement — see below |

**Applicability to this repo today.** The core database-per-service discipline — the
part that actually prevents the shared-database anti-pattern (§7) — is fully in place
and is the right level of investment for 4 services. The one gap worth flagging now,
not deferring: the **outbox pattern** for atomic write+publish is absent, and
`inventory_service`'s own event-publish helper already demonstrates the failure mode it
guards against (a logged-and-swallowed exception on publish failure, after the DB
transaction has already committed). This is cheap to fix relative to its blast radius
once Order/Payment start relying on published events for cross-service consistency —
see §8. Physically separate Postgres *instances* per service (rather than separate
databases on one shared instance) is a legitimate follow-on hardening step once
non-dev environments exist, but is not worth the operational overhead at 4 services with
no live production deployment — Future Improvement.

## 5. API Structure Patterns

Azure's microservices reference architecture and the common gateway-aggregation pattern
call for a single ingress point that owns cross-cutting concerns (authN/authZ,
rate limiting, request routing, resilience) so individual services don't each
reimplement them. This repo's `api_gateway` implements a meaningful subset of that
pattern today.

| Industry pattern | This repo's implementation | Status |
|---|---|---|
| Single ingress gateway, path-based routing to upstream services | `route_table.py`'s `build_route_table()` — static prefix → upstream mapping (`/auth`, `/products`, `/inventory`, `/cart`, `/orders`, `/payments`, etc.), longest-prefix match in `match_route()` | Already adopted — `route_table.py:33-117` |
| Gateway-owned identity propagation (never trust client-supplied identity headers) | `UpstreamProxy.forward` strips any inbound `x-user-id`/`x-user-role`/`x-user-name` before injecting gateway-verified `X-User-Id`/`X-User-Role`/`X-User-Name` | Already adopted — `proxy.py:82-89` |
| Per-route authorization policy (public / authenticated / role-gated) declared centrally | `Route.policies` dict per HTTP method, e.g. `/products` is `GET: PUBLIC, *: {SELLER, ADMIN}` | Already adopted — `route_table.py:21-30, 47-51` |
| Circuit breaker per upstream at the gateway | `UpstreamProxy.breaker()` — one `CircuitBreaker` per `upstream_name`, consulted before every forward; `breaker.allow()` short-circuits with `UpstreamError` when open | Already adopted — `proxy.py:50-77` (backed by `ecom_common.http.CircuitBreaker`, closed → open after 5 consecutive failures → half-open probe after 30s) |
| Bounded retry for idempotent (GET) requests only | `GET_RETRIES = 2`; non-GET methods get exactly one attempt, avoiding accidental retries of non-idempotent writes | Already adopted — `proxy.py:29, 95` |
| Hop-by-hop header stripping at the proxy boundary | `HOP_BY_HOP` set excluded from forwarded headers | Already adopted — `proxy.py:16-27, 79` |
| API composition / Backend-for-Frontend (aggregating multiple upstream calls into one client-facing response) | None — every route is a 1:1 proxy to a single upstream, no request fan-out or response aggregation | Not applicable yet — no client-facing use case requires composing multiple services' data in one gateway response |
| Gateway-level rate limiting / quota enforcement | None visible in `proxy.py`/`route_table.py` | Not yet adopted — plausible near-term addition once external traffic exists, but no evidence of it today; do not describe as implemented |
| API versioning strategy beyond the URL prefix | `/api/v1/<prefix>` only; no header- or content-negotiation-based versioning | Adequate at current scale — Future Improvement only if/when a breaking v2 contract is needed |

**Applicability to this repo today.** The gateway already implements the parts of the
industry pattern that matter most for correctness and security (identity provenance,
per-route policy, circuit breaking, safe retries) rather than the parts that matter
mostly at higher request volumes (composition, rate limiting, versioning schemes). That
is the right ordering of investment for a pre-production system — API composition in
particular should stay unimplemented until a real client-facing use case (e.g. a
storefront BFF that needs Product + Inventory + Reviews in one response) actually
demands it, rather than being built speculatively.

## 6. Scaling Strategies

This section surveys patterns publicly associated with scaling engineering
organizations and systems — Uber's domain-oriented microservice architecture (DOMA)
and service mesh investment, Amazon's cell-based architecture and two-pizza team
ownership model, Netflix's chaos engineering practice, and Shopify's checkout-specific
resilience investment (e.g. queueing/shedding load during flash-sale traffic spikes,
as publicly discussed in Shopify engineering writing). Nearly all of these solve
problems this repo does not have yet.

| Pattern | Publicly associated with | Applicability to this repo today |
|---|---|---|
| Service mesh (mTLS, traffic shaping, observability sidecar) | Uber (large-scale service-to-service traffic management) | **Future Improvement / not applicable at current scale.** 4 services, no live Kubernetes (`terraform/eks.tf` is unprovisioned), no sidecar infrastructure exists or is implied anywhere in the repo. |
| Domain-oriented microservice architecture (DOMA) — organizing many services into domains with gateway macro-layers | Uber | **Partially anticipated, not needed yet.** The Domain Catalog's cluster structure (9 clusters, 29 domains) is domain-oriented in spirit, but with 3 real services there is no macro-layer problem to solve — DOMA earns its complexity once service count is in the dozens+, not at 4. |
| Cell-based architecture (isolating blast radius by routing a subset of customers/data to independent, replicated stacks) | Amazon | **Future Improvement / not applicable at current scale.** Requires multiple deployed regions/replicas and a routing layer that doesn't exist; this repo has one Postgres instance and one Kafka broker, i.e. no redundancy to cell-isolate in the first place. |
| Two-pizza team / single-team service ownership | Amazon | **Not evaluable from code.** This is an organizational pattern, not a technical one; nothing in the repo confirms or denies team structure. Worth naming as a forward-looking convention (one service = one owning team) once the team scales past what a single group can review, but there is no evidence either way today. |
| Chaos engineering (deliberate, controlled fault injection in production) | Netflix | **Future Improvement / not applicable at current scale.** There is no live production traffic to inject faults into (per this document's ground-truth constraints) and no chaos tooling anywhere in the repo. The repo's circuit breaker (§5) is a *resilience mechanism*; chaos engineering is a *validation practice* for resilience mechanisms under real load — the former exists here, the latter presupposes production traffic that doesn't exist yet. |
| Checkout-specific load shedding / queueing under traffic spikes | Shopify (publicly documented flash-sale resilience work) | **Future Improvement / not applicable at current scale.** There is no Checkout/Order service yet to shed load for, and no traffic to shed. Worth revisiting once Order/Payment ship and if any promotional/flash-sale use case is planned — see §8's caveat that this stays low-priority absent that requirement. |
| Horizontal autoscaling of stateless services | Common to most cloud reference architectures (Azure, AWS) | **Future Improvement / not applicable at current scale.** No live Kubernetes or autoscaling infrastructure is provisioned; `terraform/eks.tf`'s `eks_managed_node_groups` block defines a node group (`min_size: 3, max_size: 10`) but nothing has been applied. |
| Multi-broker Kafka cluster with replication factor > 1 | Standard resilience practice for any Kafka-backed event system at production scale | **Future Improvement, and a real near-term gap.** `docker-compose.yml`'s Kafka service runs `KAFKA_NODE_ID: 1` as a single broker/controller with `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1` — there is no replication, so a broker failure loses topic availability entirely. This is acceptable for local dev; it is not acceptable for any environment with real traffic and should be flagged before this repo's first non-dev deployment (not before then). |

**Applicability to this repo today.** Every scaling-strategy pattern above except the
single-broker Kafka gap is correctly out of scope for a 4-service, no-production-traffic
system, and none should be built ahead of the need that would justify them — this is
the section of this document where the biggest risk is over-engineering, not
under-engineering. The single-broker Kafka replication gap is the one item in this
table worth tracking as a pre-production checklist item rather than a purely
speculative "someday" item, precisely because it's cheap to fix (a `docker-compose`/
Terraform config change, not an architectural redesign) relative to the outage it
prevents.

## 7. Common Pitfalls

Industry experience with microservice migrations converges on a recurring set of
anti-patterns. Each is evaluated against what this repo's code actually does, not what
a 4-service system might drift toward.

| Pitfall | Description | This repo's status |
|---|---|---|
| **Shared database anti-pattern** | Multiple services reading/writing the same database/tables directly, defeating service autonomy and creating hidden coupling | **Avoided.** Per-service databases with per-service credentials (§4); no cross-service `DATABASE_URL` reuse anywhere in `docker-compose.yml`. |
| **Distributed monolith** | Services are deployed independently but are so tightly coupled at runtime (synchronous call chains, shared deploy cadence, no independent failure isolation) that they behave like a monolith with network latency added | **Largely avoided, with one exception to watch.** Cross-service integration is primarily event-driven (Kafka), not synchronous RPC — the only real cross-service *code* dependency observed is `inventory_service` consuming Order/Payment/Refund events asynchronously, which fails safe (DLQ, retries) rather than blocking a caller. The gateway's synchronous proxy calls (`proxy.py`) are the one place a caller waits on an upstream, and it is already breaker-guarded (§5), which is the correct mitigation. Watch this as Order/Payment/Cart are added: if checkout ends up requiring several synchronous gateway-mediated calls in sequence to complete one user action, that's the distributed-monolith smell creeping in even with per-service DBs and events elsewhere. |
| **Chatty inter-service calls** | Fine-grained synchronous calls between services for what should be a single logical operation, multiplying latency and failure surface | **Not yet observable — no synchronous service-to-service caller exists yet.** `ecom_common.http.ServiceClient` (used for service-to-service calls, distinct from the gateway's `UpstreamProxy`) exists in the shared library and is breaker-guarded, but no service currently calls another service directly with it — all real cross-service coordination today is event-driven via Kafka. This is worth watching once Order/Payment need synchronous reads (e.g. "does this product exist" at checkout time) rather than event-driven eventual consistency. |
| **No idempotency on retried/redelivered operations** | Retries (network-level or message-redelivery) silently double-apply a side effect (double-charge, double-decrement stock) | **Avoided, deliberately and at two layers.** Infra-level dedup via Redis event-id claim (`kafka.py:153-157`) plus business-level dedup via `InventoryReservation`'s `(product_id, order_id)` unique constraint (`consumers.py:16-18`) — the codebase's own docstring explicitly names this as two independent layers, which is itself good practice (infra dedup alone isn't sufficient if a handler is non-idempotent for reasons beyond redelivery). |
| **Event schema drift with no versioning** | Producers change an event's payload shape and consumers silently break or misinterpret data | **Partially mitigated, not fully solved.** `EventEnvelope.event_version` exists as a field (`events.py:66`), but nothing in the observed code branches on its value — no consumer currently does version-conditional payload parsing. This is a Future Improvement to actually exercise (not a gap to fix reactively) once a second producer of the same event type exists, since today every reserved event type has at most one real producer. |
| **Missing atomic write+publish (dual-write problem)** | A service commits a DB write and then separately publishes an event; if the process crashes between the two, the event is lost even though the write succeeded (or vice versa) | **Present today, not yet mitigated.** `inventory_service/consumers.py:41-61`'s `_publish` helper runs after the DB transaction commits, wrapped in a bare `try/except Exception: log.exception(...)` — a crash or Kafka outage between commit and publish silently drops the downstream event with no retry or outbox record. This is a real, named gap — see §8 for priority. |
| **Fat gateway / God gateway anti-pattern** | The gateway accumulates business logic, turning it into a second monolith that all services funnel through | **Avoided.** `route_table.py` and `proxy.py` are limited to routing, policy, identity propagation, and resilience concerns — no business logic. Worth re-checking as more routes are added (Cart, Order, Payment), since the risk grows with route count, not service count. |
| **Synchronous cascading failure (no circuit breaking)** | An overloaded/down upstream causes callers to pile up waiting on it, which cascades the failure to the caller's own callers | **Avoided at the gateway.** `UpstreamProxy` breaker-guards every upstream (§5). Not yet exercised for service-to-service calls, since none exist yet (see chatty-calls row above) — worth confirming `ServiceClient`'s breaker is actually wired in wherever the first real synchronous service-to-service call is added. |

## 8. Recommended Adoption Priority

Given this repo is about to add Order, Payment, and Cart (all currently
Reserved-in-infra per the Domain Catalog), the following is a ranked shortlist — not
an exhaustive checklist of every pattern discussed above. Patterns already adopted (§2–§5)
are not re-listed; this is only what to actually *do* next, in order.

1. **Outbox pattern for atomic write+publish, starting with whichever of Order/
   Payment/Cart is built first.** This is the highest-priority gap named in §4/§7:
   `inventory_service`'s existing `_publish` helper already demonstrates the exact
   failure mode (commit succeeds, publish silently fails and is only logged) that a new
   Order or Payment service would inherit if built the same way. Once real money
   (Payment) or real purchase-intent (Order) events can be silently dropped, the cost of
   this gap goes from "an inventory count out of sync" to "a customer's order or charge
   vanishes with no trace." Fix this before, not after, Payment ships.

2. **Confirm and version-freeze the `OrderCreated` payload contract before building
   `order_service`.** `inventory_service/consumers.py`'s own docstring already flags
   this payload shape (`{"order_id": str, "items": [{"product_id": int, "quantity":
   int}, ...]}`) as "a judgment call the eventual Order Service should confirm," not a
   finalized contract. This isn't a new pattern to adopt so much as existing repo-noted
   debt that becomes urgent the moment a second producer/consumer pair needs to agree on
   it — do this as the first step of building Order, not after.

3. **Decide choreography vs. orchestration for the checkout flow, before it grows past
   3 collaborating services.** Today's choreographed pattern (§3) works because only
   Inventory reacts to Order/Payment events. Once Cart → Order → Payment → Inventory
   (and eventually Notification) are all real collaborators in one checkout flow, revisit
   whether an explicit saga/orchestrator is warranted — decide this once, deliberately,
   rather than discovering the need mid-incident.

4. **Add event-schema version handling to at least one consumer, once a second
   producer of a shared event type exists.** `EventEnvelope.event_version` is already a
   field with no consumer branching on it (§7) — this is cheap to add incrementally as
   part of building Order/Payment rather than a standalone project, but should not be
   deferred indefinitely once two independent producers can emit the same `event_type`.

5. **Move Kafka to a replicated, multi-broker configuration before any non-dev
   deployment** (§6). This is infrastructure configuration, not application code, and
   should be sequenced whenever a staging/production environment is first stood up
   (i.e. whenever `terraform/eks.tf` or equivalent actually gets applied) — not before,
   since local dev has no need for broker redundancy.

6. **Everything in §6 marked "Future Improvement / not applicable at current scale"
   (service mesh, cell-based architecture, chaos engineering, checkout-specific load
   shedding, autoscaling) stays explicitly out of scope** until this repo has live
   production traffic and more than a handful of services. Naming this as a priority
   item (at the bottom, deliberately) is itself the recommendation: do not let
   the DOMA/mesh/chaos-engineering vocabulary from big-company engineering blogs pull
   investment away from items 1–5 above, which are the patterns this repo's actual
   current gaps call for.
