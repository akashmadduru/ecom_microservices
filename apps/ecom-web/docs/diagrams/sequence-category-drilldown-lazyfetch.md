# Sequence Diagram: Category drill-down lazy-fetch flow

## Context

This diagram documents the target flow for `CategoryTreeFilter.vue` (planned addition
under `src/components/products/`), which replaces the current flat `<select>` category
dropdown in `ProductsPage.vue` with an expandable category → subcategory tree. Children
for a given parent category are **fetched lazily**, on first expand, and then **cached
per-parent** in `categoryStore` so re-expanding the same node never re-issues the
network call.

This is a small addition to the existing store: today `categoryStore` only exposes a
flat `categories` list via `fetchCategories()` (see `src/stores/category.ts`). The
drill-down feature adds a `childrenByParentId` cache map and a `fetchChildren(parentId)`
action alongside the existing state, without changing `fetchCategories()`'s current
behavior.

## Participants

| Participant | Role |
|---|---|
| `User` | Clicks the expand caret on a category node in the sidebar tree |
| `CategoryTreeFilter.vue` | New component (`src/components/products/`) rendering the expandable category tree |
| `categoryStore (Pinia)` | `src/stores/category.ts` — owns `childrenByParentId` cache and `fetchChildren(parentId)` |
| `CategoriesApi` | `src/api/CategoriesApi.ts` — `getCategories(parentId)` calls the backend |
| `Backend (GET /products/categories)` | Server endpoint; with `parent_id` returns one level of children ordered by `sort_order` |

## Flow, step by step

1. **User clicks the expand caret** on a top-level (or any) category node in
   `CategoryTreeFilter.vue`.
2. **The component calls `categoryStore.fetchChildren(parentId)`.**
3. **Cache hit branch:** if `childrenByParentId[parentId]` is already populated (this
   parent was expanded before, in this session), the store returns the cached array
   immediately — no network call is made.
4. **Cache miss branch:** otherwise the store toggles `loading` on, calls
   `CategoriesApi.getCategories(parentId)`, which issues
   `GET /products/categories?parent_id=<id>`. The backend returns a flat, one-level
   list of that parent's direct children, ordered by `sort_order`. The store stores the
   result at `childrenByParentId[parentId]` and toggles `loading` off.
5. **The component renders the returned children** as nodes nested under the expanded
   parent.
6. **Filter selection (side note, not re-diagrammed here):** selecting the radio at
   *any* level of the tree — a top-level category or a fetched child — triggers
   `controller.setFilter('category_id', id)`, the exact same `useListController` flow
   already documented end-to-end in
   `docs/diagrams/sequence-products-page-filter-pagination.mmd` (race protection,
   atomic grid+pager update, etc.). That flow is not duplicated here.

## Key invariant

> **Fetch-once-per-parent:** a given `parentId`'s children are fetched from the backend
> at most once per session. Every subsequent expand of that same node is served from
> `childrenByParentId[parentId]` with no network round-trip.

## Diagram source files

- Mermaid: `docs/diagrams/sequence-category-drilldown-lazyfetch.mmd`
- Related: `docs/diagrams/sequence-products-page-filter-pagination.mmd` (filter selection → grid/pager flow, referenced in step 6 above)
