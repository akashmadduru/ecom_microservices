# Decision Log — Admin Dashboard (v2)

Append-only. Most recent first. Never edit historical entries except to mark them
superseded. Audience: engineering.

---

## 2026-07-22 — Controller owns list/query state; store owns mutations only {#controller-owns-list-state}

**Decision.** List and query state (items, pagination, page, search, sort, filters,
loading, error) lives in the `useListController` / `useClientList` composable that a page
instantiates — **not** in the Pinia store. Stores keep only mutation actions
(create/update/delete) and, in client mode, the raw source array.

**Why.** The pre-existing pattern hardcoded list/pagination state into stores (e.g.
`PaginationComponent` reached directly into `useProductStore.pagination` / `next()` /
`goTo()`). That coupled every table to one store and made a reusable, mode-agnostic
`DataTable` impossible. Moving list/query state into a per-page controller instance lets
two different data sources (server, in-memory) produce the identical
`ListControllerResult<T>` contract that `DataTable` consumes.

**Deviation acknowledged.** This intentionally diverges from the repo's
store-owns-everything convention. Mutations stay in stores so cache/optimistic logic isn't
duplicated. The seam is the type `ListControllerResult<T>`.

**Alternatives rejected.**
- *Keep list state in stores, generalise the store.* Rejected: one store per resource ×
  server/client paging semantics → combinatorial store bloat, and stores would own view
  concerns (debounce, abort) they shouldn't.
- *A single mega-composable with a `mode` flag.* Rejected: server and client modes share a
  contract but almost no implementation (network + abort + request-id vs. computed
  filter/sort/slice). Two focused composables are simpler than one branchy one.

---

## 2026-07-22 — Split into server-mode vs client-mode pagination {#client-vs-server-mode}

**Decision.** `useListController` (server mode) for Products and Inventory;
`useClientList` (client mode, in-memory) for Brands, Manufacturers, Tags.

**Why.** It's driven by backend capability, not preference. `GET /products` and
`GET /inventory` accept `page`/`page_size` and filters, so paging/filtering belongs on the
server. The Brand/Manufacturer/Tag list endpoints accept **no** pagination or search
params at all — so the frontend loads the full array and pages/filters/searches it in
memory. This is honest about what each backend actually supports rather than faking a
capability.

**Trade-off accepted.** In-memory paging is fine at current catalog scale but does not
scale; flagged as a backend follow-up in [FutureWork](./FutureWork.md). Server mode adds an
`AbortController` + monotonic request-id staleness guard so out-of-order responses can't
overwrite fresher state; client mode needs none.

---

## 2026-07-22 — Hand-rolled validators instead of zod {#hand-rolled-validators}

**Decision.** `src/utils/validators.ts` is a small hand-written validation kit
(`required`, `slugRule`, `emailRule`, `urlRule`, `numberInRange`, `minNumber`, a
`validate()` runner, and per-resource schemas) rather than adopting zod.

**Why.** Matches the repo's lean dependency posture. The validation surface is a handful of
admin forms with simple field rules; zod's schema/inference machinery is more than this
needs and would add a runtime dependency for marginal benefit. The kit is ~120 lines,
fully typed via `ValidationSchema<T>`, and integrates with the existing `useFormErrors`.

**Alternative rejected.** *Adopt zod.* Rejected for dependency-weight and consistency
reasons; revisit only if validation complexity grows (cross-field rules, async checks) to
where hand-rolling becomes error-prone.

---

## 2026-07-22 — Ship Tag edit UI despite missing backend endpoint {#tag-update-ship-it}

**Decision.** `AdminTagFormPage`, the tag store `update` action, and
`TagsApi.updateTag` (`PUT /admin/products/tags/{id}`) shipped even though that backend
endpoint does not exist. Postman (`docs/v2/postman_collection.json`) documents only
`POST` (create) and `DELETE` for tags — no `PUT`.

**Requested by.** akashmadduru@gmail.com, 2026-07-22 — "ship it, backend will catch up",
in preference to blocking the release or rolling back the tag UI for CRUD parity with
Brand/Manufacturer.

**Consequence.** Tag edit **will 404/405 in production** until the backend adds the
endpoint. This is the single most urgent item in [FutureWork](./FutureWork.md). The client
error handling surfaces the failure as a toast, so it degrades loudly, not silently.

**Alternatives rejected.** *Hide/disable the edit action until the backend lands* —
rejected by the requester in favour of parity and forward momentum. *Roll back the tag
stack* — rejected for the same reason.

---

## 2026-07-22 — No KPI tiles on the admin dashboard {#kpi-tiles-rejected}

**Decision.** `AdminDashboardPage` is navigation-only (grouped section cards). No
count/metric tiles were added.

**Why.** Every candidate KPI (product count, low-stock count, etc.) depends on a store that
is only populated after the operator visits that section. Rendering tiles on first load
would require either eager cross-service fetches on dashboard mount or showing placeholder
`0`s. Showing `0`s for data we simply haven't loaded is dishonest UI (looks like "zero
products", not "not loaded yet"), so it was rejected.

**Revisit when.** A backend summary/stats endpoint exists that returns real aggregate
counts in one call — then tiles can show verified numbers.
</content>
