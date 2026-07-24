# Feature — Product Detail Page & Listing Filters Rebuild (v3)

Audience: engineers and product stakeholders. Companion docs:
[`Changes.md`](./Changes.md), [`DecisionLog.md`](./DecisionLog.md),
[`FutureWork.md`](./FutureWork.md).

## What it does

Rebuilds the two customer-facing storefront pages a shopper spends the most time on:
the product detail page (`ProductPage.vue`, `/products/:id`) and the product listing
page (`ProductsPage.vue`, `/products`). Both pages had pre-existing bugs — this pass
fixes them and brings the listing page's filtering up to the same server-side pattern
already proven in the admin catalog (`AdminProductsPage.vue`).

## Product detail page (`src/modules/ProductPage.vue`)

| Before | After |
|---|---|
| Showed `retail_price` (MRP) as if it were the price the customer pays | Shows the actual selling price (`getSellingPrice`), with MRP struck through only when a real discount applies (`getMrp`, `hasDiscount`) |
| Treated the `discount` field (a currency amount) as if it were already a percentage | Derives the displayed "X% off" badge from the currency amount (`getDiscountPercent`) |
| Title hard-truncated to 30 characters (`.substring(0, 30)`) regardless of actual length | Full title shown, clamped visually with `line-clamp-3` instead of being cut server-of-truth |
| No manufacturer info | Manufacturer name + country of origin shown when a manufacturer record resolves for the product |
| No structured spec info | Product `attributes` (key/value) rendered as a specification table, with an explicit empty state when a product has none |
| Stock shown only implicitly | Exact stock badge (in stock / "Only N left" / out of stock) plus SKU and available quantity, sourced from the inventory store |
| No breadcrumb | `Products / <category> / <title>` breadcrumb added |
| Image gallery silently empty for some products | Gallery now resolves `image_urls` (which the API sometimes serializes as a non-JSON-encoded string) via the shared `resolveImageUrls()` helper instead of a fragile inline `JSON.parse` that would throw and swallow the whole gallery |

The pricing fix reuses `getSellingPrice` / `getMrp` / `getDiscountPercent` / `hasDiscount`
from `src/utils/pricing.ts` — the same helpers `ProductCard.vue` already used correctly.
`ProductPage.vue` had simply never been updated to match when those helpers were
introduced.

## Product listing page (`src/modules/ProductsPage.vue`)

**The bug being fixed:** filtering was entirely client-side, applied only to whatever
single page of products happened to already be loaded into the store. The pagination
footer, meanwhile, reflected the full unfiltered catalog. A shopper could filter to
"Category: Electronics" and see 3 results on page 1 with a footer claiming 40 pages —
the grid and the pager were reading from two different realities.

**The fix:** real server-side filtering via `useListController`, the same composable
`AdminProductsPage.vue` already uses for server-mode pagination. Filters are sent as
request parameters (`ProductFilterParams`) on every page/filter change, so the grid and
the pagination footer always describe the same filtered result set.

Filters available:

| Filter | Shape | Source |
|---|---|---|
| Category | Single-select, top-level categories only | `useCategoryStore` (new) → `GET /products/categories` |
| Brand | Single-select, full catalog | `useBrandStore` (existing) |
| Min / max price | Two number inputs | Sent as `min_price`/`max_price` |
| Sort | Single-select (Featured, Price asc/desc, Top rated, Newest) | Sent as `sort` |

Selected filters render as removable chips above the grid, each with a filter-specific
`aria-label` (`Remove ${chip.label} filter`, not a generic "Remove filter"), plus a
"Clear all" action.

**Free-text search was intentionally not added** — see
[DecisionLog](./DecisionLog.md#no-search-box-products-listing).

## New/changed data layer

- **New:** `src/stores/category.ts` — read-only Pinia store (`categories`, `loading`,
  `error`, `fetchCategories()`), mirroring the existing `src/stores/brand.ts` shape.
- **`src/stores/product.ts`** — `fetchProduct` now uses `resolveImageUrls()`
  (`src/utils/image.ts`) instead of an inline `JSON.parse`.
- **`src/stores/ecommerce.ts`** — dead client-side filter state removed (`filters`,
  `setFilters`, `resetFilters`, `applyFilters`), fully superseded by server-side
  filtering on the listing page.
- **Deleted:** `src/utils/productFilters.ts` and its spec — dead code once the above
  landed.

## How to extend — adding another server-side filter to the listing page

Follows the same recipe as `AdminProductsPage.vue`'s server-mode pattern (see
`docs/v2/Feature.md#how-to-extend--adding-a-6th-paginated-admin-list`):

1. Confirm the backend `GET /products` actually accepts the new query param — do not
   add a filter the API can't honor (this is exactly the mistake being fixed here).
2. Add the field to `ProductFilterParams` (`src/interfaces/product.ts`) if not already
   present.
3. Add a local `ref` for the control's UI value, a change handler that calls
   `controller.setFilter(key, value)`, and a corresponding entry in `activeChips` for
   the removable-chip UI.
4. Map the filter into the `fetcher`'s `params` object in `ProductsPage.vue`.

## Known limitations (must-read)

Full detail and status in [`FutureWork.md`](./FutureWork.md):

- No free-text search on the listing page — `GET /products` has no `search` param.
- Category filter is single-select, top-level only — no subcategory drill-down.
- Brand filter is single-select — the API only accepts one `brand_id` per request.
- `ProductsPage.vue` / `ProductPage.vue` are statically imported in the router, not
  lazy-loaded (pre-existing, not introduced by this change).
- `ProductPage.vue`'s `onMounted` does not react to `route.params.id` changing — a
  future in-place navigation between two product detail pages (e.g. a "related
  products" link) would not refetch.
- The specification table will often show its empty state — the admin product form has
  no UI yet to collect `attributes`.
