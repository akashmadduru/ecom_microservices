# Diagram: System Context — Product Service

## Diagram Type
Context Diagram (C4 Level 1 equivalent)

## Subject
`product_service`'s place in the `ecom_microservices` platform — who calls it, what it calls,
and where the trust/RBAC boundaries sit.

## Audience
Engineers onboarding to this service; reviewers evaluating a cross-service change.

## Required Elements
Anonymous client, authenticated Seller/Admin, API Gateway, `product_service`, its database,
Redis, Kafka, the one real downstream consumer (`inventory_service`), and the (currently
network-decoupled) relationship to `auth_service`.

## Diagram

```mermaid
graph TD
    subgraph "External actors"
        Anon[Anonymous client\nbrowse/search]
        Seller["Seller\n(role=SELLER)"]
        Admin["Admin\n(role=ADMIN)"]
    end

    subgraph "Platform edge"
        GW["API Gateway :8080\nRoute: /products/* -> GET public, else SELLER|ADMIN\nRoute: /admin/* -> ADMIN only"]
    end

    subgraph "product_service :8003"
        API[FastAPI app]
        PubR["/products router\npublic + seller/admin"]
        AdminR["/admin/products router\nadmin only"]
        IntR["/internal router\nnot gateway-routable"]
        API --> PubR
        API --> AdminR
        API --> IntR
    end

    DB[("product_db\nPostgreSQL 17\n13 tables")]
    Redis[("Redis\ncache:product:{id}")]
    Kafka[["Kafka\ntopic: product.events"]]
    Inv["inventory_service\n(Kafka consumer)"]
    Auth["auth_service\n(no live call —\nshared JWT secret only)"]
    Future["Future: search_service\n(reads /internal/products,\nconsumes product.events)"]

    Anon -->|GET, no token| GW
    Seller -->|Bearer JWT| GW
    Admin -->|Bearer JWT| GW
    GW --> API

    PubR <--> DB
    PubR <--> Redis
    AdminR --> DB
    IntR --> DB
    PubR -.->|verify signature/claims\nno network call| Auth
    AdminR -.-> Auth

    API -->|publish, best-effort| Kafka
    Kafka -->|consume ProductCreated/Updated/Deleted,\nProductVariantCreated| Inv
    Future -.->|not yet built| IntR
    Future -.->|not yet built| Kafka

    classDef svc fill:#dce7e5,stroke:#2f5d62,color:#1b1e23;
    classDef ext fill:#e7e7ea,stroke:#74798a,color:#1b1e23,stroke-dasharray: 4 3;
    class API,PubR,AdminR,IntR svc;
    class Future,Auth ext;
```

## Notes

- RBAC is enforced **twice**, deliberately: coarsely at the gateway (route-prefix policy, so a
  completely unauthenticated request never even reaches the service for a mutating call) and
  precisely inside `product_service` (`require_seller`/`require_admin` plus per-resource
  ownership checks) — the service does not trust the gateway's check alone, since `/internal/*`
  and direct-to-8003 access exist outside the gateway's policy entirely.
- `auth_service` is drawn dashed/external because there is no runtime network dependency — JWT
  verification is local, against a shared secret/issuer/audience. This is a trust relationship,
  not a service call.
- The Kafka edge is one-directional today: `product_service` only **publishes**; it consumes
  nothing (contrast with `inventory_service`, which both consumes Order/Payment/Refund events and
  publishes its own).
