# Sequence Diagram: ProductsPage server-side filter + pagination flow

## Context

This diagram documents the target flow for rebuilding `ProductsPage.vue`'s filter
sidebar to be driven entirely by `useListController`, replacing the previous
client-side-slice approach.

**The bug this fixes:** previously, changing a filter only re-sliced the *current
page* of already-fetched products client-side, while the pagination footer kept
reading page/total counts computed from an earlier, unfiltered server response. The
grid and the pager could disagree — e.g. the grid would show 3 filtered items on
"page 1 of 1," while the pager still said "page 1 of 6" because it never saw the
filter. Routing both the grid and the pager through **one** `useListController`
request eliminates this: both are populated from the exact same
`{ products, pagination }` API response, so they can never drift apart.

## Participants

| Participant | Role |
|---|---|
| `User` | Interacts with the filter sidebar |
| `ProductsPage.vue` | View component; owns the sidebar UI and renders the grid + `PaginationComponent` |
| `useListController` | Composable (`src/composables/useListController.ts`) owning `page`, `filters`, `items`, `pagination`, and request lifecycle |
| `ProductsApi.getProducts` | API function (`src/api/ProductsApi.ts`) that calls the backend and normalizes the response |
| `Backend (GET /products)` | Server endpoint returning filtered products + pagination metadata for the same query |

## Flow, step by step

1. **User changes a filter** — category, brand, price range, or sort — in the sidebar.
2. **`ProductsPage.vue` calls `controller.setFilter(key, value)`** on the shared
   `useListController` instance, rather than filtering a locally-held array.
3. **`useListController` resets `page` to 1.** This reset happens only inside
   `setFilter`/`setSort` — it does *not* happen inside `setPage`. Clicking "Next" or a
   page number never jumps the user back to page 1; only a filter/sort change does.
4. **Race protection: abort any in-flight request.** Before issuing the new request,
   the controller aborts the previous `AbortController` (if one is still pending) and
   creates a fresh one for this request. If the user changes a second filter before
   the first response returns, the first request is cancelled and its (now stale)
   result is discarded when it eventually resolves — the controller also guards this
   with an internal `requestId` check, so even a non-aborting stale response can't
   overwrite newer state.
5. **The fetcher closure builds a `ProductFilterParams` object** — `category_id`,
   `brand_id`, `min_price`, `max_price`, `sort` — read directly off
   `controller.filters`. This is a 1:1 field mapping; there is no separate
   translation/normalization layer between the sidebar's filter state and the params
   sent to the API.
6. **`ProductsApi.getProducts(page, pageSize, params, signal)` is called**, which
   issues `GET /products` with those query parameters and the abort signal attached.
7. **The backend returns `{ products, pagination }`** for the *same* filtered query —
   the pagination metadata (total items, total pages, has_next, etc.) is computed
   against the same filter conditions as the returned product list, not against the
   unfiltered full set.
8. **`useListController` sets `controller.items` and `controller.pagination`
   atomically** from that single response. There is no intermediate step where one
   updates before the other.
9. **`ProductsPage.vue` re-renders** — the product grid (reading `items`) and
   `PaginationComponent` (reading `pagination`) update together. Because both are
   sourced from the same response object, they cannot disagree: if the grid shows 3
   filtered products, the pager reflects pagination computed over that same
   3-item-matching filtered set.

## Key invariant

> **Single source of truth:** exactly one API response feeds both the grid and the
> pager, per request. There is no code path where the grid renders from a
> client-side-filtered slice while the pager renders from a different (unfiltered or
> stale) source.

## Race-condition handling, summarized

- Every `setFilter`/`setSort`/`setPage`/`setPageSize` call triggers `run()`, which
  first aborts any previous in-flight request.
- An internal monotonically-increasing `requestId` is checked before committing a
  response to state — if a newer request has started since this one was issued, the
  older response is dropped even if it wasn't (or couldn't be) aborted in time.
- Net effect: only the *latest* filter/sort/page state's response can ever update
  `items`/`pagination`, regardless of network response ordering.

## Diagram source files

- Mermaid: `docs/diagrams/sequence-products-page-filter-pagination.mmd`
