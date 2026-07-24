# Changes — Admin Dashboard (v2)

Change set: admin dashboard design-system layer + rollout across catalog/inventory admin
pages, plus a storefront image-fallback rollout. All changes uncommitted at time of
writing. Related: [`Feature.md`](./Feature.md), [`DecisionLog.md`](./DecisionLog.md),
[`FutureWork.md`](./FutureWork.md).

## Phase breakdown

| Phase | Summary |
|---|---|
| 0 — Security | Re-enable/fix intent for the `router.beforeEach` guard (`requiresAdmin` had been reading `to.meta.requiresAuth`). **Status: the corrected logic exists but the whole guard is still commented out in `src/router/index.ts` — the guard is NOT active in shipped code.** See [FutureWork](./FutureWork.md). |
| 1 — Design system | New shared primitives: `useListController<T>` / `useClientList<T>` → `ListControllerResult<T>`; `DataTable`, `AdminTableToolbar`, `ConfirmDialog`, `AdminBreadcrumbs`; `AppImage` + `image.ts`; `validators.ts` + extended `useFormErrors`; `PaginationComponent` refactored from `useProductStore`-hardcoded to props-driven. |
| 2 — Image fallback | `<AppImage>` replaces raw `<img>` in `ProductCard`, `CartPage`, `WishlistPage`, `ProductPage`; new thumbnail columns in `AdminProductsPage` / `AdminBrandsPage`. |
| 3 — Server-side lists | Server pagination + brand/price/sort filters for `AdminProductsPage`; `AdminInventoryListPage` migrated to `useListController` with status/warehouse filters. No free-text search (backend has no `search` param — deferred). |
| 4 — Client-side lists | `AdminBrandsPage` / `AdminManufacturersPage` / `AdminTagsPage` on `useClientList` with in-memory search + pagination (their backend endpoints take no pagination/search params). |
| 5 — Validation + CRUD parity | Schemas wired into every admin form submit; new `AdminTagFormPage` + tag store/API `update` action (**caveat: no backend PUT endpoint**); `ConfirmDialog` replaces `window.confirm` in all delete flows. |
| 6 — Navigation polish | `AdminLayout.isActive()` fixed (route-name-set matching instead of `path.startsWith`); breadcrumbs wired via `meta.breadcrumb`; sidebar regrouped Overview/Catalog/Inventory/System; dashboard links every section; "← Back to store"; hover/transition polish. |
| Fix pass | Post-review hardening (see below). |

## Post-implementation fix pass

- `ConfirmDialog` reimplemented as an accessible native `<dialog>` (focus trap,
  Escape-to-cancel, ARIA labelling).
- Dead column-sort machinery removed from `DataTable` (no page used it).
- `useConfirmAction` composable extracted to dedupe delete-confirmation boilerplate that
  had been copy-pasted across 4 pages.
- Page-clamp gap fixed for server-paginated Products: deleting the last row on the last
  page no longer strands the user on an empty page (`AdminProductsPage` `onSuccess` clamp;
  client-mode pages already had `clampPage()`).
- Debounce-timer leak fixed in `useClientList.reset()` (now calls `clearTimer()`).
- `emailRule` wired to the Manufacturer contact-email field (was silently unvalidated).
- `AbortSignal` forwarded through `ProductsApi.getProducts` and
  `InventoryApi.listInventory` so the abort-controller staleness guard in
  `useListController` actually cancels in-flight HTTP requests.

## New files

- Composables: `src/composables/listController.types.ts`,
  `src/composables/useListController.ts`, `src/composables/useClientList.ts`,
  `src/composables/useConfirmAction.ts` (+ `useConfirmAction.spec.ts`).
- Admin components: `src/components/admin/DataTable.vue` (+ `dataTable.types.ts`),
  `src/components/admin/AdminTableToolbar.vue`, `src/components/admin/ConfirmDialog.vue`,
  `src/components/admin/AdminBreadcrumbs.vue`.
- Shared: `src/components/AppImage.vue`, `src/utils/image.ts`, `src/utils/validators.ts`.
- Brand/Manufacturer/Tag stacks: `src/api/BrandsApi.ts`, `ManufacturersApi.ts`,
  `TagsApi.ts`; `src/interfaces/brand.ts`, `manufacturer.ts`, `tag.ts`;
  `src/stores/brand.ts`, `manufacturer.ts`, `tag.ts`.
- Admin pages: `AdminBrandsPage.vue`, `AdminBrandFormPage.vue`,
  `AdminManufacturersPage.vue`, `AdminManufacturerFormPage.vue`, `AdminTagsPage.vue`,
  `AdminTagFormPage.vue` (all under `src/modules/admin/`).

## Modified files (selected)

- `src/router/index.ts` — admin route tree + `meta.breadcrumb`; guard still commented out.
- `src/api/ProductsApi.ts` — `getProducts` accepts/forwards `AbortSignal`.
- `src/interfaces/inventory.ts`, `src/interfaces/product.ts` — filter/param types.
- `src/modules/CartPage.vue`, `CheckoutPage.vue`, `ProductPage.vue`, `WishlistPage.vue`,
  `src/components/ProductCard.vue` — `<AppImage>` rollout.
- `src/modules/admin/AdminProductsPage.vue`, `AdminInventoryListPage.vue`,
  `AdminInventoryDetailPage.vue`, `AdminInventoryBulkUpdatePage.vue`,
  `AdminProductFormPage.vue`, `AdminLayout.vue` — migrated to new primitives.
- `src/stores/ecommerce.ts` — toast plumbing used by `useConfirmAction`.
- `src/utils/productFilters.ts` (+ spec) — storefront client-side filters (unchanged
  philosophy; see [DecisionLog](./DecisionLog.md)).

## Removed

- `docs/ecom_microservices.postman_collection.json` /
  `docs/ecom_microservices.postman_environment.json` (superseded by `docs/v1/` and
  `docs/v2/postman_collection.json`).
</content>
