# Admin Design-System Layer — Diagrams (v2 plan)

Source-of-truth diagrams for the admin dashboard design-system layer. Each diagram is
provided as Mermaid (`.mmd`) and PlantUML (`.puml`) source, plus the prose narrative
below. Rendered SVGs are included when tooling was available (see "Rendering" at the
bottom).

> Scope note: this is a **forward-looking (v2) plan**. `PaginationComponent`,
> `EmptyState`, `ErrorState`, `SkeletonTable`, `useFormErrors`, and the five API clients
> exist in the codebase today. `useListController`, `useClientList`,
> `ListControllerResult<T>`, `DataTable`, `AdminTableToolbar`, `ConfirmDialog`, and
> `AppImage` are the proposed layer this plan introduces.

---

## Diagram A — Component Dependencies

Files: `A-component-admin-design-system.mmd`, `.puml`

The central idea is a single seam: **`ListControllerResult<T>`**. Both composables
produce this contract, and `DataTable` consumes only this contract — which is what makes
`DataTable` **mode-agnostic** (it does not know or care whether data came from the server
or from an in-memory array).

- **Server-mode pages** (`AdminProductsPage`, `AdminInventoryListPage`) drive
  `useListController<T>`, which owns list and query state and calls an injected
  `fetcher(query, signal)` into the relevant API client (`ProductsApi`, `InventoryApi`).
  These pages still touch their store, but **only for mutations** (create / update /
  delete) — never for list/query state.
- **Client-mode pages** (`AdminBrandsPage`, `AdminManufacturersPage`, `AdminTagsPage`)
  drive `useClientList<T>`, which reads a reactive `source[]` array plus an `onRefresh`
  hook from the owning store (`brand` / `manufacturer` / `tag`).
- Both composables `return` a `ListControllerResult<T>`, consumed by `DataTable`.
- `DataTable` internally renders `SkeletonTable`, `EmptyState`, `ErrorState`, and
  `PaginationComponent`, and hosts `AdminTableToolbar` through a slot.
- `PaginationComponent` is shared by `DataTable` **and** the storefront `ProductsPage`.
  Today `PaginationComponent.vue` is **hardcoded to `useProductStore`** (confirmed in
  source: it imports and calls `store.pagination`, `store.next()`, `store.goTo()`); this
  plan **decouples it** so it is driven by props/pagination meta instead.
- Cross-cutting: delete flows go through `ConfirmDialog`; forms use
  `useFormErrors` + validators; row images use `AppImage` / `resolveImageUrl`.

**Ownership rule:** controllers own list/query state; stores own mutations only.

---

## Diagram B — Sequence: Server-mode search + pagination

Files: `B-sequence-server-mode-search.mmd`, `.puml`

Participants: Admin User → `AdminTableToolbar` → `useListController` →
AbortController/request-id guard → `ProductsApi.getProducts` → Backend `GET /products` →
`DataTable`.

- **Search (debounced):** a keystroke calls `setSearch(term)`, which sets the `search`
  ref synchronously and resets `page = 1`. After a **300ms** debounce, `run()` fires: it
  aborts the prior in-flight request and issues a new **monotonic request id**. The
  `fetcher(query, signal)` calls `getProducts`, which hits the backend and returns.
- **Stale-guard:** on response, the guard checks whether its request id is still current.
  The `alt` fragment shows the two outcomes — if current, state (`items`, `pagination`,
  `status`) is updated and `DataTable` re-renders; if **superseded by a newer `run()`**,
  the late/stale response is **dropped** with no state mutation, preventing out-of-order
  overwrites.
- **Pagination (immediate):** clicking a page calls `setPage(n)` and `run()` fires
  **immediately, with no debounce**.

> **Escalation captured on the fetcher→backend edge:** free-text `search` is **not sent
> to the backend today**. Verified against `src/api/ProductsApi.ts` — `getProducts(page,
> pageSize, filters)` sends `category`, `brand`, `brand_id`, `category_id`, `min_price`,
> `max_price`, `sort`, but there is **no `search` param**. Server-side free-text search
> is not yet supported and needs a backend change.

---

## Diagram C — Sequence: Client-mode search + pagination

Files: `C-sequence-client-mode-search.mmd`, `.puml`

Participants: Admin User → `AdminTableToolbar` → `useClientList` → reactive `source[]`
(from `brand`/`manufacturer`/`tag` store) → computed filter/sort/paginate pipeline →
`DataTable`.

- **Initial load:** `onMounted`, the store's `fetch*()` populates `source[]`. `loading`
  and `error` are **passthrough refs that originate in the owning store**, not in the
  composable itself — `useClientList` just re-exposes them.
- **Search (debounced, in-memory):** a keystroke calls `setSearch(term)`; after a
  **200ms** debounce the computed pipeline recomputes: filter by `searchFields` → apply
  `filterPredicates` → sort → slice for the current page. Pagination meta is recomputed
  via the shared **`buildPagination()`** util (already used in `ProductsApi.ts`). No
  network call.
- **Pagination (immediate, in-memory):** clicking a page calls `setPage(n)`; only the
  slice recomputes (filter/sort are already memoized). **No network call.**

---

## Rendering

If a diagram renderer is available locally:

```bash
# Mermaid -> SVG
npx @mermaid-js/mermaid-cli -i A-component-admin-design-system.mmd -o A-component-admin-design-system.svg

# PlantUML -> SVG (requires the plantuml jar + Java)
plantuml -tsvg B-sequence-server-mode-search.puml
```
