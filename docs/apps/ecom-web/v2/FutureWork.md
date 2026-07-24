# Future Work — Admin Dashboard (v2)

Open items surfaced by this feature, most urgent first. Items fixed during the
implementation's fix pass are listed at the bottom as **done**, for the record — do not
re-open them.

## Open

### 1. Tag update endpoint does not exist server-side (MOST URGENT)

`TagsApi.updateTag` calls `PUT /admin/products/tags/{id}`. That endpoint is **not
implemented** — `docs/v2/postman_collection.json` documents only `POST` (Create Tag) and
`DELETE` (Delete Tag) for tags. The Tag edit page and store `update` action were shipped
anyway per explicit product decision (akashmadduru@gmail.com, 2026-07-22, "ship it,
backend will catch up"). See
[DecisionLog](./DecisionLog.md#tag-update-ship-it).

**Impact:** Tag editing **will 404/405 in production** until the backend adds
`PUT /admin/products/tags/{id}`. Action: implement that endpoint (accepting `TagUpdate
{name, slug}`) or disable the tag edit action in the UI in the interim.

### 2. Route guard is currently disabled — `/admin` reachable unauthenticated

The `router.beforeEach` auth/admin guard in `src/router/index.ts` is **fully commented
out** (the corrected logic — `requiresAdmin` reading `to.meta.requiresAdmin`, no longer
`requiresAuth` — is present in the commented block but not active). As shipped, any
unauthenticated user can navigate to `/admin` and its children; enforcement relies solely
on backend 401/403s per request.

**Action:** uncomment and re-enable the guard, then verify redirect-to-signin and
non-admin redirect-to-home behaviour. Treat as a security fix. (This item was described as
"Phase 0, complete" in the implementation brief, but the shipped code does not match —
flagged here rather than documented as done.)

### 3. Server-side search for Products and Inventory

`GET /products` and `GET /inventory` accept no `search` param
(`ProductsApi.getProducts` / `InventoryApi.listInventory` confirm this), so the two
server-mode admin tables deliberately expose **no free-text search** — the capability was
escalated and deferred, not faked. Only Brands/Manufacturers/Tags have (in-memory) search.

**Action:** add a search/query param to the backend list endpoints (or a search service),
then wire `controller.setSearch` on those two pages.

### 4. Backend pagination/search for Brands, Manufacturers, Tags

These list endpoints accept no pagination or search params, so the frontend loads the full
array and pages/filters/searches it in memory via `useClientList`. Fine at current scale,
but does not scale.

**Action:** add `page`/`page_size`/`search` support to these endpoints and migrate the
three pages from `useClientList` to `useListController`. The
`ListControllerResult<T>` seam makes this a swap of the composable, not a `DataTable`
rewrite.

### 5. Products admin sort convention unverified

The Products sort uses a `-field` descending-prefix token (e.g. `-retail_price`,
`-rating`, `-id`) inferred from partial API docs. It has **not** been verified against
actual backend sort-token behaviour.

**Action:** confirm the backend's sort grammar and reconcile the `sortOptions` in
`AdminProductsPage` with it.

### 6. SELLER-role access to the admin dashboard

`isAdmin` in `src/stores/auth.ts` returns true only for role `'ADMIN'`. SELLER-role users
— who have write access to several of the same backend endpoints (inventory
`require_seller` routes, etc.) — are currently locked out of the admin area entirely.

**Action:** product decision needed — should SELLER see a scoped admin surface, or stay
excluded? Not fixed in this pass.

### 7. Refresh-token storage hardening

Access **and** refresh tokens are stored in `localStorage` (pre-existing, not introduced
by this feature). Security review flagged moving the refresh token to an `httpOnly` cookie
as a hardening item.

**Action:** move the refresh token out of JS-readable storage; coordinate with backend for
cookie issuance.

### 8. Unify the two product-filtering philosophies

Storefront filtering (`src/utils/productFilters.ts`, client-side) and the admin's
server-side `ProductFilterParams` coexist and are not unified. Pre-existing debt, out of
scope for this feature.

**Action:** decide on one filtering model and converge, once the backend search/filter
surface (items 3–4) settles.

### 9. Dead inventory-store filter state

`statusFilter` / `setStatusFilter` in `src/stores/inventory.ts` are now orphaned —
`AdminInventoryListPage` moved to `useListController` with its own local filter state and
no longer calls them.

**Action:** remove the dead members (and the `status` threading in `fetchList`) once
confirmed no other consumer depends on them.

## Done (fixed in this feature's fix pass — do not re-open)

- `ConfirmDialog` is an accessible native `<dialog>` (focus trap, Escape-to-cancel, ARIA
  labelling) gating every destructive delete.
- Delete-confirmation boilerplate deduplicated into the `useConfirmAction` composable
  (previously copy-pasted across 4 pages).
- Debounce-timer leak in `useClientList.reset()` fixed.
- Server-paginated Products page-clamp gap fixed (deleting the last row on the last page no
  longer strands the user).
- `emailRule` wired to the Manufacturer contact-email field (was silently unvalidated).
- `AbortSignal` forwarded through `getProducts` / `listInventory` so the staleness guard
  cancels in-flight HTTP requests.
- Dead column-sort machinery removed from `DataTable`.
</content>
