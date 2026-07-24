# Feature — Admin Dashboard (v2)

Audience: engineers and product stakeholders. Companion docs:
[`Changes.md`](./Changes.md), [`DecisionLog.md`](./DecisionLog.md),
[`FutureWork.md`](./FutureWork.md), and the design-system diagrams in
[`diagrams/`](./diagrams/README.md).

## What it does

The admin dashboard is a self-contained area of the Vue 3 SPA, mounted at `/admin`
(lazy-loaded `AdminLayout.vue` shell + child routes). It gives an operator CRUD control
over the catalog and inventory backed by the FastAPI microservices.

Sidebar is grouped into four sections (`AdminLayout.vue`):

| Section    | Pages |
|------------|-------|
| Overview   | Dashboard (`AdminDashboardPage`) |
| Catalog    | Products, Brands, Manufacturers, Tags (list + create/edit forms) |
| Inventory  | Inventory list + detail, Bulk update, Health report, Stock reports |
| System     | Diagnostics |

Every admin route carries a `meta.breadcrumb` (static string or a function of the route),
rendered by `<AdminBreadcrumbs>` in the layout. A "← Back to store" link sits at the
bottom of the sidebar. The dashboard is a pure navigation surface — it links to every
section but shows **no KPI tiles** (see [DecisionLog](./DecisionLog.md#kpi-tiles-rejected)).

## Architecture — the `ListControllerResult<T>` seam

The central design decision is a **single contract, two producers, one consumer**.

```
useListController<T>  ──┐
                        ├──►  ListControllerResult<T>  ──►  DataTable.vue
useClientList<T>      ──┘        (listController.types.ts)
```

- **`ListControllerResult<T>`** (`src/composables/listController.types.ts`) is a uniform
  read-only shape: `items`, `pagination`, `page`, `pageSize`, `search`, `sort`,
  `filters`, `status`, `loading`, `error`, `isEmpty`, plus imperative setters
  (`setPage`, `setSearch`, `setFilter`, `setSort`, `refresh`, `reset`).
- **`DataTable.vue`** consumes *only* this contract. It is mode-agnostic — it never knows
  whether rows came from the server or an in-memory array. It internally renders
  `SkeletonTable`, `EmptyState`, `ErrorState`, and the shared `PaginationComponent`, and
  hosts an `AdminTableToolbar` through its `#toolbar` slot.

### Two modes

| | Server mode | Client mode |
|---|---|---|
| Composable | `useListController<T>` | `useClientList<T>` |
| Pages | `AdminProductsPage`, `AdminInventoryListPage` | `AdminBrandsPage`, `AdminManufacturersPage`, `AdminTagsPage` |
| Data source | injected `fetcher(query, signal)` → API client | reactive `source[]` array from the owning store |
| Pagination / filter / sort | computed by the **backend** | computed **in-memory** (filter → sort → slice) |
| Search debounce | 300ms, then network `run()` | 200ms, then recompute; no network |
| Staleness guard | `AbortController` + monotonic request-id; late responses dropped | n/a |
| Loading / error | owned by the controller | passthrough refs from the store |

**Ownership rule:** controllers own list/query state; **stores own mutations only**
(create / update / delete). Server-mode pages still call their store, but only for
mutations, never for list or query state. See
[DecisionLog](./DecisionLog.md#controller-owns-list-state).

Sequence details are in the diagrams: server mode in
[`diagrams/B-sequence-server-mode-search`](./diagrams/README.md#diagram-b--sequence-server-mode-search),
client mode in
[`diagrams/C-sequence-client-mode-search`](./diagrams/README.md#diagram-c--sequence-client-mode-search).

### Supporting primitives (design-system layer)

| Primitive | File | Role |
|---|---|---|
| `AdminTableToolbar` | `src/components/admin/AdminTableToolbar.vue` | Search input + loading indicator, wired to `controller.setSearch` |
| `ConfirmDialog` | `src/components/admin/ConfirmDialog.vue` | Accessible native `<dialog>` gating every destructive delete (focus trap, Escape-to-cancel, ARIA labelling) |
| `useConfirmAction<T>` | `src/composables/useConfirmAction.ts` | Shared confirm-then-delete flow (pending row, in-flight flag, success/error toasts) |
| `AppImage` + `resolveImageUrl`/`resolveImageUrls` | `src/components/AppImage.vue`, `src/utils/image.ts` | Single image-fallback path; consolidates 4 duplicated `parseImage` impls |
| `validators.ts` + `useFormErrors` | `src/utils/validators.ts`, `src/composables/useFormErrors.ts` | Hand-rolled client-side validation schemas gating form submit |
| `AdminBreadcrumbs` | `src/components/admin/AdminBreadcrumbs.vue` | Reads `meta.breadcrumb` off matched routes |
| `PaginationComponent` | `src/components/PaginationComponent.vue` | Refactored from store-hardcoded to props-driven; shared by `DataTable` **and** storefront `ProductsPage` |

## Validation

Each admin form runs a client-side schema (`brandSchema`, `tagSchema`,
`manufacturerSchema`, `productSchema`, `inventorySchema`) through `useFormErrors` /
`validate()` as a gate *in front of* the existing server-side error handling — it does not
replace it. The manufacturer contact-email field is validated with `emailRule` directly in
`AdminManufacturerFormPage` (the field lives outside `manufacturerSchema`, which only
covers `name`).

## How to extend — adding a 6th paginated admin list

**If the backend endpoint supports `page`/`page_size`/filters (server mode):**

1. Add an API client function `list<Thing>(page, pageSize, filters, signal)` that returns
   `{ items, pagination }`; forward the `AbortSignal` into the axios call (mirrors
   `ProductsApi.getProducts` / `InventoryApi.listInventory`) so the staleness guard can
   actually cancel in-flight requests.
2. In the page, `const controller = useListController<Thing>({ fetcher, initialPageSize })`.
   Map the toolbar/filter UI to `controller.setSearch` / `controller.setFilter`.
3. Render `<DataTable :controller :columns>` with `#cell:*` and `#actions` slots.
4. Keep create/update/delete in the store; wire delete through `useConfirmAction`.
5. After a delete, clamp the page if the last row on the last page was removed (see the
   `onSuccess` clamp in `AdminProductsPage`).

**If the backend list endpoint has no pagination/search (client mode):**

1. Load the full array into a store; expose it as a reactive ref.
2. `const controller = useClientList<Thing>({ source, searchFields, loading, error, onRefresh })`.
3. Same `<DataTable>` + `useConfirmAction` wiring. Client mode already clamps via a local
   `clampPage()` helper (see `AdminBrandsPage`).
4. Flag it as backend follow-up — in-memory paging is only acceptable at current scale.

Add a route with `meta.breadcrumb`, and add a `NavItem` (with its full set of route
`names`) to the correct section in `AdminLayout.vue` so exactly one nav item highlights.

## Known limitations (must-read)

These shipped intentionally or are pre-existing; full detail and status in
[`FutureWork.md`](./FutureWork.md):

- **Route guard is currently disabled.** The `router.beforeEach` auth/admin guard in
  `src/router/index.ts` is commented out — `/admin` is reachable **unauthenticated**.
  This is the top open item.
- **Tag editing will fail in production.** `TagsApi.updateTag` calls
  `PUT /admin/products/tags/{id}`, which does not exist server-side (postman documents only
  `POST`/`DELETE` for tags). Shipped by explicit product decision; will 404/405 until the
  backend adds it.
- **No free-text search for Products/Inventory** — those backend list endpoints accept no
  `search` param. Only Brands/Manufacturers/Tags have working (in-memory) search.
- Products sort uses a `-field` descending-prefix convention inferred from partial API
  docs, unverified against real backend behavior.
- SELLER-role users are locked out of the admin area (`isAdmin` checks `'ADMIN'` only).
</content>
</invoke>
