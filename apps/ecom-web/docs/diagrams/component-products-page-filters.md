# Component Diagram: ProductsPage filter sidebar composition

## Context

This diagram shows how `ProductsPage.vue`'s filter sidebar is composed after adding
category drill-down and a searchable brand panel. Two new components,
`CategoryTreeFilter.vue` and `BrandFilterScroller.vue`, are added under the new folder
`src/components/products/`, replacing the current flat `<select>` dropdowns for
category and brand seen today in `src/modules/ProductsPage.vue`. The product-grid data
path (`useListController` → `ProductsApi.getProducts`) is unchanged and is shown only
for context, not as the focus of this diagram.

## Components

| Component | Role |
|---|---|
| `ProductsPage.vue` | Parent view (`src/modules/ProductsPage.vue`); renders the sidebar and the product grid |
| `CategoryTreeFilter.vue` | New (`src/components/products/`) — expandable category/subcategory tree, see `sequence-category-drilldown-lazyfetch.mmd` for its internal fetch flow |
| `BrandFilterScroller.vue` | New (`src/components/products/`) — searchable, scrollable brand list |
| `useCategoryStore (Pinia)` | `src/stores/category.ts` — category state + `fetchChildren` cache |
| `CategoriesApi` | `src/api/CategoriesApi.ts` — `getCategories(parentId)` |
| `useBrandStore (Pinia)` | `src/stores/brand.ts` — brand state, existing `fetchBrands()` reused |
| `BrandsApi` | `src/api/BrandsApi.ts` — `getBrands()` |
| `useListController` | `src/composables/useListController.ts` — existing, unchanged; owns product page/filter/pagination state |
| `ProductsApi.getProducts` | `src/api/ProductsApi.ts` — existing, unchanged |

## Relationships

- **`ProductsPage.vue` renders** `CategoryTreeFilter.vue` and `BrandFilterScroller.vue`
  in its filter sidebar (replacing the current inline `<select>` markup).
- **`CategoryTreeFilter.vue` depends on `useCategoryStore`**, which calls
  `CategoriesApi` for lazy per-parent child fetches.
- **`BrandFilterScroller.vue` depends on `useBrandStore`**, which calls `BrandsApi`.
  The panel filters the already-fetched `brands` list client-side by search text; no
  new backend endpoint is introduced.
- **`ProductsPage.vue` depends on `useListController`**, which calls
  `ProductsApi.getProducts` — this path is existing and unchanged, shown for context
  only (see `sequence-products-page-filter-pagination.mmd` for its full flow).
- **Both new components communicate selection back up via `v-model`**: each emits
  `update:modelValue` with `category_id` / `brand_id` typed as `number | null`.
  `ProductsPage.vue` receives that value and calls
  `controller.setFilter('category_id' | 'brand_id', value)` on `useListController`
  (same mechanism the existing filter-pagination diagram documents), which is why no
  new prop/emit contract needs to be introduced on the controller itself.

## Diagram source files

- Mermaid: `docs/diagrams/component-products-page-filters.mmd`
- Related: `docs/diagrams/sequence-category-drilldown-lazyfetch.mmd`,
  `docs/diagrams/sequence-products-page-filter-pagination.mmd`
