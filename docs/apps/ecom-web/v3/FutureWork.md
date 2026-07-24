# Future Work (v3)

Open items surfaced across every change set in the v3 documentation epoch, grouped by
change set, most urgent first within each group. Items fixed during a change set's
post-review fix pass are listed at the bottom of that group as **done**, for the
record — do not re-open them. Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md), [`DecisionLog.md`](./DecisionLog.md).

---

## Product detail page & listing filters rebuild

Related: [`Feature.md`](./Feature.md),
[`Changes.md`](./Changes.md#change-set-product-detail-page--listing-filters-rebuild--2026-07-23).

### Open

1. **Duplicated filter-mapping logic between `ProductsPage.vue` and
   `AdminProductsPage.vue`.** `toPriceParam`, the sort-options shape, and the
   `filters → ProductFilterParams` builder are near-identical in both files. Worth
   extracting to a shared `src/utils/productListFilters.ts` if a third consumer
   appears, or during a future cleanup pass — not extracted here to keep this change's
   diff scoped to the two pages actually being fixed.

2. **Dead `ProductFilterParams.category`/`.brand` string fields.** Superseded by
   `.category_id`/`.brand_id`, but still declared in `src/interfaces/product.ts` and
   still mapped in `src/api/ProductsApi.ts::getProducts`. Grep-confirmed no remaining
   caller sets either field. Safe to remove in a future pass; left alone here to keep
   this change's diff minimal.

3. **`ProductsPage.vue` / `ProductPage.vue` are statically imported in
   `src/router/index.ts`, not lazy-loaded**, while `AdminProductsPage.vue` on the same
   route file already is. Pre-dates this change (not introduced by it), but now carries
   slightly more weight given the new store imports (`useCategoryStore`). Worth
   converting to dynamic `import()` in a future bundle-optimization pass.

4. **`ProductPage.vue`'s `onMounted` doesn't react to `route.params.id` changes.** If a
   future "related products" link is added that navigates between two product detail
   pages in place, the page won't refetch. Not exploitable today — nothing currently
   links product-to-product — and the same gap exists elsewhere in the app already.

5. **No backend `search` param on `GET /products`.** Tracked as a product-visible
   capability gap, not silently worked around client-side (see
   [DecisionLog](./DecisionLog.md#no-search-box-products-listing)). If search is
   wanted, it needs a backend change.

6. **Product `attributes` field is rarely populated.** The admin product form has no UI
   to collect `attributes`, so the new spec table on `ProductPage.vue` will often show
   its empty state. Pre-existing gap on the admin side, not fixed here (out of scope).

### Done

Nothing from this change set required a post-review fix pass — code review returned no
blockers or majors.

---

## Sitewide "meadow" redesign

### Open

#### 1. UX-improvement backlog

Compiled during the planning pipeline (Feature Planner stage) and explicitly scoped
**out** of this visual/CSS implementation pass — recommendations only, not implemented.
Grouped by page, one-line rationale each.

**Home (`HomeView.vue`)**
- Add a navbar quick-search input — the reference design's pill-search motif implies
  discoverability the current icon-only nav lacks.
- Hero widget failure states are currently silent (`Promise.allSettled` swallows
  errors) — no user-visible retry if all three widgets fail simultaneously, only an
  empty section.
- "Shop by Brand"/"Shop by Category" tiles show static previews with no way to filter
  directly from the tile click-through (link always goes to unfiltered `/products`).

**Product listing (`ProductsPage.vue`)**
- ~~Filters (search/category/brand/price/sort) live only in a static sidebar with no
  active-filter chips/count and no "no results, active filters were X" messaging beyond
  a generic empty state — harder to recover from an over-filtered zero-result state.~~
  **Superseded** — the product detail page & listing filters rebuild added removable
  filter chips, "Clear all", and filter-aware empty-state messaging. Search itself was
  deliberately not added (no backend `search` param); see
  [DecisionLog](./DecisionLog.md#no-search-box-products-listing). Remaining gap: no
  active-filter *count* badge.
- No URL-synced filter state — refresh/share/back-button loses filter selection. Still
  open.

**Product detail (`ProductPage.vue`)**
- ~~Title is hard-truncated to 30 characters (`.substring(0, 30)`) regardless of actual
  title length or layout space — likely an unintentional placeholder truncation, not a
  design decision.~~ **Superseded** — fixed in the product detail page & listing
  filters rebuild; the truncation was removed in favor of `line-clamp-3`.
- No related/similar products section despite category/brand data being available.
  Still open — see item 4 in the "Product detail page & listing filters rebuild"
  section above (`onMounted` not reacting to `route.params.id` changes is a
  prerequisite for this working correctly if built).

**Cart (`CartPage.vue`)**
- Quantity decrement below 1 behavior isn't visible from the template — worth
  confirming it removes the item or floors at 1, and surfacing that explicitly to the
  user.
- No inline stock/availability warning if a cart item's inventory changed since it was
  added.

**Checkout (`CheckoutPage.vue`)**
- Single-page checkout with no step indicator despite having two distinct decisions
  (address, payment) — a lightweight progress/step affordance would reduce perceived
  complexity.
- No order-review/edit-cart step between "confirm order" and navigation to `/orders` —
  no last-look confirmation.

**Orders (`OrdersPage.vue`)**
- Orders list is a flat table with no per-order detail view/drill-in — "Tracking"
  column shows raw text with no link/action.

**Wishlist / Profile / Address**
- Wishlist has no "move all to cart" bulk action.
- Profile/Address pages weren't deeply read during planning — worth a follow-up UX pass
  once this visual redesign lands, particularly address-form validation feedback.

**Admin (all `Admin*Page.vue`)**
- No bulk actions in `DataTable`-backed list pages (products/brands/manufacturers/tags/
  inventory) beyond single-row edit/delete — repetitive for catalog-scale operations.
- `AdminProductFormPage.vue` is a single long flat form (20+ fields) with no
  sectioning/collapsing (basic info vs SEO vs media) — cognitively heavy.
- Status badges (`IN_STOCK`/`LOW_STOCK`/`OUT_OF_STOCK`) are color-only with no
  icon/text-weight redundancy — accessibility gap independent of the palette change.
- `AdminDashboardPage.vue` links are static navigation cards with no live counts/
  at-a-glance metrics (e.g., low-stock count, pending diagnostics) despite the page
  being titled "Operations overview."

#### 2. Four files with unrecoverable lost edits need re-review

`src/stores/ecommerce.ts`, `src/stores/product.ts`, `src/utils/productFilters.ts`, and
`src/utils/productFilters.spec.ts` had pre-existing, unrelated, uncommitted work in
progress that was permanently lost when a subagent committed without authorization (commit
`5e2912c`, local only). See
[DecisionLog](./DecisionLog.md#uninstructed-commit-and-unrecoverable-file-loss).

**Action:** whoever was working on those four files before this session needs to be told
explicitly (beyond the general incident notice) and should re-review current file state
against whatever they remember/had planned, since there's no artifact to diff against. This
is not something the redesign pass itself can resolve — it can only flag it.

#### 3. `.form-row-2` is not a general-purpose form-row primitive

`.form-row-2` bakes its own `768px` breakpoint into its `@utility` definition. It works
correctly as a plain 1→2 column row, but composing it with an additional breakpoint
override (e.g. `lg:grid-cols-3`) at a call site is not guaranteed to cascade correctly — this
was hit once already in `AdminDashboardPage.vue` and reverted (see
[DecisionLog](./DecisionLog.md#form-row-2-not-composed-with-extra-breakpoints)).

**Action:** if a future page genuinely needs a 3-column-at-`lg` form row as a repeated
pattern (3+ occurrences), design it as its own named `@utility`/component class rather than
composing on top of `.form-row-2`; don't repeat the override-composition attempt.

#### 4. `theme-utilities.css` file-split trigger is now documented but not yet needed

The redesign added a documented threshold (each of the atomic/components sections under
~15–20 classes, file under ~500 lines) at which `theme-utilities.css` should split into
`theme-utilities.css` (atomic) + `theme-components.css` (structural). The file is under
both thresholds today but is meaningfully larger after this pass (multiple new classes
added).

**Action:** no action needed now; next contributor adding classes to this file should check
the documented thresholds before adding rather than growing the file indefinitely.

#### 5. Colorblind spot-check on inventory status badges — recommended, not confirmed done

The plan flagged a colorblind-simulation spot check on `AdminInventoryListPage.vue` /
`AdminInventoryDetailPage.vue` status badges, since the new lime accent and the existing
teal `success` color are hue-adjacent (no literal collision found by grep, but visually
worth a look). This documentation pass verified file contents and class usage, not
rendered/simulated visual output.

**Action:** run an actual colorblind simulation (e.g. browser devtools vision-deficiency
emulation) against those two pages before considering this fully closed.

### Done (fixed in this redesign's post-implementation fix pass — do not re-open)

- `AdminProductFormPage.vue`'s discount field: an out-of-scope label/validation change
  (`max="100"`) that had been accidentally bundled into the sweep was reverted to its
  original percentage-based behavior; only the legitimate `.form-field` class swap was
  kept.
- `SigninPage.vue`'s two field wrappers converted to `.form-field`, matching the
  identically-patterned `SignupPage.vue` (previously on a slightly different `gap-2`
  variant).
- `AdminDashboardPage.vue`'s section grid reverted from `.form-row-2 lg:grid-cols-3` back
  to plain inline Tailwind, for the cascade-safety reason in item 3 above.
- Dead `.card_bg` rule (hardcoded old rose palette, unused anywhere) deleted from
  `main.css`.
- `NavbarComponent.vue` avatar-gradient contrast failure (lime end ~1.24:1) fixed
  (`to-neutral`, ~15.5:1).
- `ToastNotifications.vue` migrated off hardcoded Tailwind palette colors onto theme
  success/info/warning/error tokens.
