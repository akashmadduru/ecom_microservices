# Changes (v3)

This doc covers every change set in the v3 documentation epoch, most recent first.
Related: [`Feature.md`](./Feature.md) (covers the most recent feature-shaped change
set), [`DecisionLog.md`](./DecisionLog.md), [`FutureWork.md`](./FutureWork.md).

---

## Change set: Product detail page & listing filters rebuild — 2026-07-23

Rebuild of the customer-facing product detail page (`ProductPage.vue`) and product
listing page (`ProductsPage.vue`). Full feature description:
[`Feature.md`](./Feature.md). Related decisions:
[`DecisionLog.md`](./DecisionLog.md#seller-maps-to-brand--manufacturer-no-distinct-entity).

### Summary

`ProductPage.vue` had a price-display bug (showing MRP as the selling price, and
showing the currency `discount` field as if it were a percentage) — fixed by adopting
`getSellingPrice`/`getMrp`/`getDiscountPercent`/`hasDiscount` from `src/utils/pricing.ts`,
the same helpers `ProductCard.vue` already used correctly. Also added: manufacturer
info (name + country of origin), a product attributes spec table, exact stock/SKU
display, a breadcrumb; removed a hardcoded 30-character title truncation; fixed an
image-gallery bug where a non-JSON-encoded `image_urls` string silently produced an
empty gallery.

`ProductsPage.vue` had its filtering rebuilt from broken client-side-only filtering
(filters only applied to the currently loaded page, desyncing the product grid from the
pagination footer) to real server-side filtering via `useListController`, modeled on
`AdminProductsPage.vue`. New filters: category (single-select, top-level only), brand
(single-select, full catalog), min/max price, sort — with removable filter chips and a
"Clear all" action. Free-text search was intentionally not added (no backend `search`
param on `GET /products`).

During test generation, a second, more severe bug was found in the min/max price
inputs (copied from `AdminProductsPage.vue`, present there too but out of scope to
touch): both were `<input type="number">` bound via `v-model` to a `ref<string>`, and
Vue 3's runtime `vModelText` directive auto-casts `v-model` to a JS `number` whenever
an input's `type` is `"number"`, regardless of the `.number` modifier. That meant
`toPriceParam(value: string)`'s `value.trim()` threw a `TypeError` before any price
filter could ever be applied — entering any value in either price field silently did
nothing. Fixed by switching both inputs to `type="text" inputmode="numeric"
pattern="[0-9]*"`, which keeps the numeric mobile keyboard without triggering the
auto-cast. While in the same block, also switched the `filters.min_price as number |
undefined || undefined`-style mapping to `?? undefined` so a legitimate `0` value
isn't dropped (the code-review-flagged issue, which turned out to be unreachable until
the type-cast bug above was fixed).

### Files changed

- `src/modules/ProductPage.vue` — pricing fix, manufacturer block, attributes table,
  stock/SKU, breadcrumb, truncation removal, image-gallery fix.
- `src/modules/ProductsPage.vue` — server-side filtering rebuild.
- `src/stores/category.ts` — **new**, read-only Pinia store mirroring
  `src/stores/brand.ts`.
- `src/stores/product.ts` — `fetchProduct` now uses `resolveImageUrls()`
  (`src/utils/image.ts`) instead of an inline `JSON.parse`.
- `src/stores/ecommerce.ts` — removed dead client-side filter state (`filters`,
  `setFilters`, `resetFilters`, `applyFilters`).
- `src/utils/productFilters.ts` and its spec — **deleted**, dead code after the above.
- Filter chip `aria-label` made per-chip specific (`Remove ${chip.label} filter`)
  instead of a generic "Remove filter", for accessibility.
- `src/modules/ProductsPage.vue` price inputs switched from `type="number"` to
  `type="text" inputmode="numeric"` to fix the price-filter crash described above;
  filter-mapping switched from `|| undefined` to `?? undefined`.
- `src/modules/ProductPage.spec.ts`, `src/modules/ProductsPage.spec.ts`,
  `src/stores/category.spec.ts` — **new**, regression coverage for the pricing fix,
  the category store, the filter-to-API param mapping, and the price-input crash fix.

### Verification performed

- `npm run type-check` (vue-tsc) — pass.
- `npm run lint` (oxlint + eslint) — pass.
- `npm run test:unit` (vitest, 99 tests across 14 files) — pass.
- Code review: approved, no blockers/majors (ran before the price-input crash was
  found by test generation; the fix above was applied afterward).
- Security review: no findings.
- Technical debt scan: no blockers; findings tracked in
  [`FutureWork.md`](./FutureWork.md).

---

## Change set: Sitewide "meadow" redesign — 2026-07-23

Sitewide daisyUI theme replacement (`northstar` dusty-rose →
`meadow` lime/olive/mint), shadow-token consolidation, radius-literal fix, a new
reusable-class layer, and a repo-wide sweep adopting those classes plus existing
`.text-muted`/`.text-subtle` utilities. Uncommitted at time of writing (see
[Incident](#incident-uninstructed-commit-during-an-unrelated-lint-fix) below for the one
exception). Plan: `abstract-conjuring-riddle.md` (design rationale, contrast math, full
token table).

### Summary

The hero section on `HomeView.vue` had already been reworked (separately, prior to this
change set) into a bento-grid with a lime-green CTA pill, isolated behind a private
`--color-hero-cta` token so it wouldn't leak into the rest of the app, which still ran the
original `northstar` dusty-rose daisyUI theme. This change set extends that lime/mint
visual language to the entire app: the daisyUI theme itself was renamed and repalette to
`meadow`, two duplicated shadow literals were consolidated into custom properties, a
hardcoded border-radius literal was split to track the theme's actual radius tokens, and a
new small layer of reusable CSS classes was added and adopted across ~30 component/page
files in place of repeated raw Tailwind clusters. One real contrast failure and one
hardcoded-palette component were fixed along the way. No application logic, routes, or
API behavior changed — this is a CSS/markup-only pass.

### Token layer — `src/assets/main.css`

| Token | Old (`northstar`) | New (`meadow`) |
|---|---|---|
| `name` | `'northstar'` | `'meadow'` |
| `--color-base-100/200/300` | `#fcf8f8` / `#fbefef` / `#f9dfdf` | `#f3f8ee` / `#e9f2df` / `#d8e8c9` |
| `--color-base-content` | `#2a2320` | `#1c2115` |
| `--color-primary` / `-content` | `#ac4f59` / `#fff5f5` | `#5a6b12` / `#f6faec` (5.49:1) |
| `--color-secondary` / `-content` | `#d98f97` / `#5c2530` | `#93b566` / `#23330d` |
| `--color-accent` / `-content` | `#f5afaf` / `#5c2530` | `#c6f135` / `#1c2115` (fill-only) |
| `--color-neutral` / `-content` | `#2a2320` / `#f7f3ee` | `#1c2115` / `#f3f8ee` |
| info/success/warning/error | — | unchanged, re-verified AA against the new base |
| `--radius-field` | `0.75rem` | `0.9rem` |
| `--radius-box` | `1.1rem` | `1.25rem` |

Also in `main.css`:

- Deleted the private `@theme { --color-hero-cta: ... }` block — superseded by
  `--color-accent` now that the same lime value is the sitewide accent token.
- Deleted the dead `.card_bg` rule, which still hardcoded the old rose hex values and was
  unused anywhere in the codebase — left in place it would have been a landmine for the
  next person who grepped for a color and found a rule that looked live but wasn't.
- Added `--shadow-soft-rest: 0 1px 2px rgba(28, 33, 21, 0.04)` and
  `--shadow-soft-hover: 0 8px 20px rgba(28, 33, 21, 0.08)` on `:root` as the single source
  of truth for the app's soft card shadow, replacing four separate copies of the same
  literal.
- Split the hardcoded `border-radius: 1.1rem` that previously applied to
  `.card, .navbar, .btn, .input, .select, .textarea` in one rule into
  `.card, .navbar { border-radius: var(--radius-box); }` and
  `.btn, .input, .select, .textarea { border-radius: var(--radius-field); }` — the literal
  would have silently drifted from the theme's own radius tokens the next time either was
  changed.
- `.card` / `.card:hover` box-shadow now point at `var(--shadow-soft-rest)` /
  `var(--shadow-soft-hover)`.
- `.btn-primary`'s gradient and shadow, and the body's radial-gradient background, were
  recolored from the old rose hex values to the new primary/secondary equivalents (same
  structure, new colors).
- Rationale comments describing the old dusty-rose ColorHunt palette were rewritten to
  describe the new palette and its contrast math.

### New file — `src/assets/theme-utilities.css`

Not new to the app (it already existed with `.text-muted`, `.text-subtle`, `.eyebrow-pill`,
`.surface-card`, etc.), but every rule in it changed or was added in this pass:

- `.hero-cta-pill` background/hover-shadow/comment repointed from `var(--color-hero-cta)`
  to `var(--color-accent)`.
- `.surface-card` / `.bento-tile` box-shadow repointed at `var(--shadow-soft-rest)`.
- New `@utility` atomic classes: `.shadow-soft`, `.field-error`, `.form-row-2`.
- New `@layer components` classes: `.data-panel`, `.form-field`, `.section-kicker-sm`.
- A documented 3-tier CSS-extraction convention (inline Tailwind / `@utility` atomic /
  `@layer components` structural) added as a comment block at the top of the file, plus a
  file-split trigger (split into `theme-utilities.css` + `theme-components.css` if either
  the atomic or components section exceeds ~15–20 classes, or the file exceeds ~500
  lines) — see [DecisionLog](./DecisionLog.md#3-tier-css-extraction-convention).

### Component fixes (real, non-mechanical)

- **`src/components/NavbarComponent.vue`** — the avatar-initials gradient was
  `from-primary to-accent`; at the lime (`accent`) end that measured ~1.24:1 contrast for
  the white initials text, a hard AA failure. Changed to `from-primary to-neutral`
  (~15.5:1). See [DecisionLog](./DecisionLog.md#lime-fill-only-never-text).
- **`src/components/ToastNotifications.vue`** — `toastStyle()` previously hardcoded raw
  Tailwind palette classes (`emerald-500`/`sky-500`/`amber-500`/`rose-500`), fully
  decoupled from the theme and would not have picked up the new palette at all. Migrated to
  `border-{success,info,warning,error}/30` + `bg-{success,info,warning,error}/10`, matching
  the existing `bg-accent/15` pattern already used elsewhere (`CheckoutPage.vue`). Toast
  body text color was deliberately left untouched (inherits `base-content` from `body`) —
  applying a `-content` token there would put near-white text on a near-white 10%-opacity
  tint; those `-content` tokens are calibrated for solid backgrounds, not tints.

### Reusable-class extraction sweep

| Cluster | Scope | Resolution |
|---|---|---|
| `border border-base-300 bg-base-100 shadow-sm` (and `shadow-xl`/`shadow-md` variants) on elements already carrying `.card`/`.navbar` | ~23 sites across `CartPage.vue`, `WishlistPage.vue`, `ProfilePage.vue`, `AddressPage.vue`, `ProductPage.vue`, `SigninPage.vue`, most `Admin*FormPage.vue`, `AdminInventoryDetailPage.vue`, etc. | **Deleted.** `.card`/`.navbar` in `main.css` already apply border/background/shadow unconditionally; the extra classes were dead weight — the shadow portion in particular was cascade-inert, since `.card`'s own unlayered box-shadow always wins over the Tailwind-layer utility. |
| `overflow-hidden rounded-[1.5rem] border border-base-300 bg-base-100 shadow-sm` on plain (non-`.card`) wrapper divs | `DataTable.vue`, `OrdersPage.vue`, `AdminInventoryHealthReportPage.vue`, `AdminDiagnosticsPage.vue`, `AdminInventoryStockReportsPage.vue` | `.data-panel` |
| `form-control flex flex-col gap-1` | 51 occurrences across 8 files, heaviest in `AdminProductFormPage.vue` | `.form-field` |
| `text-xs text-error` (field validation message) | 20 occurrences across 7 files | `.field-error` |
| `grid gap-4 md:grid-cols-2` (2-col form row) | 13 occurrences across 7 files, heaviest in `AdminProductFormPage.vue` | `.form-row-2` |
| Hand-rolled `text-sm uppercase tracking-[0.3em] text-primary` instead of the existing `.section-kicker` | `ProductPage.vue`, `ProfilePage.vue`, `SigninPage.vue` | `.section-kicker-sm` (size modifier, same pattern as `.eyebrow-pill`/`.eyebrow-pill-sm`) |
| Raw `text-base-content/70` | ~13–14 holdouts (`PaginationComponent.vue`, `ProductsPage.vue`, `ProductPage.vue`, `ProfilePage.vue`, `AddressPage.vue`, several `Admin*` pages) | `.text-muted` (existing utility, under-adopted) |
| Raw `text-base-content/60` | ~5 holdouts (`AdminInventoryDetailPage.vue`, `AdminTableToolbar.vue`) | `.text-subtle` (existing utility, under-adopted) |

Not extracted: `flex items-center justify-between` — too generic, no semantic identity,
and per-instance variant composability was judged more valuable than a fixed class. This is
the documented worked example behind the extraction threshold in the 3-tier convention.

The `/40`-opacity text tier (`AdminLayout.vue`, `AdminBreadcrumbs.vue`) is a pre-existing,
documented deliberate exception in the file and was left untouched.

### Post-implementation fix pass

Applied after review caught issues on the initial sweep:

- **`AdminProductFormPage.vue`** — an out-of-scope discount-field change had been
  accidentally bundled into the sweep (the "Discount (%)" label text and the input's
  `max="100"` validation bound were altered). Reverted both to their original
  percentage-based behavior; the legitimate `.form-field` class swap on that field's
  wrapper was kept.
- **`SigninPage.vue`** — its two field wrappers were on a slightly different `gap-2`
  variant instead of `.form-field`, despite `SignupPage.vue` using the identical pattern.
  Converted both to `.form-field` for consistency between the two pages.
- **`AdminDashboardPage.vue`** — its section grid had been composed as
  `.form-row-2 lg:grid-cols-3`. Reverted to plain inline Tailwind
  (`grid gap-4 md:grid-cols-2 lg:grid-cols-3`), because `.form-row-2` is an `@utility`
  block that bakes in its own `768px` breakpoint for `grid-template-columns`, and
  composing an additional `lg:` override on top of that wasn't guaranteed to cascade
  correctly. See [DecisionLog](./DecisionLog.md#form-row-2-not-composed-with-extra-breakpoints).
- **`main.css`** — deleted the dead `.card_bg` rule (see Token layer section above).

### Verification performed

- Grep sweep, re-run against the final state of the repo:
  - `--color-hero-cta`: zero remaining references.
  - Raw `shadow-sm|shadow-md|shadow-xl`: zero, outside `theme-utilities.css`'s own
    definitions.
  - Raw `text-base-content/70` or `/60`: zero, outside the documented `/40` exception.
  - Tailwind palette classes (`emerald-*`, `sky-*`, `amber-*`, `rose-*`) in
    `ToastNotifications.vue`: zero.
- `.data-panel` confirmed present on exactly the 5 intended non-`.card` wrapper sites plus
  its own definition in `theme-utilities.css`.
- `npm run type-check` / lint — no logic changes were made, so this step only confirms
  nothing broke.

### Files changed

- `src/assets/main.css` — theme rewrite (see Token layer section).
- `src/assets/theme-utilities.css` — new/changed utility and component classes (see New
  file section). Untracked as a new file in git status at time of writing.
- ~30 component/page files swept for class adoption and dead-class deletion:
  `src/components/{EmptyState,ErrorState,NavbarComponent,PageHeader,PaginationComponent,ProductCard,ToastNotifications}.vue`,
  `src/components/admin/{AdminBreadcrumbs,AdminTableToolbar}.vue`,
  `src/modules/{AddressPage,CartPage,CheckoutPage,HomeView,OrdersPage,ProductPage,ProductsPage,ProfilePage,SigninPage,SignupPage,WishlistPage}.vue`,
  `src/modules/admin/{AdminBrandFormPage,AdminDashboardPage,AdminInventoryBulkUpdatePage,AdminInventoryDetailPage,AdminInventoryFormPage,AdminInventoryListPage,AdminLayout,AdminManufacturerFormPage,AdminProductFormPage,AdminProductsPage,AdminTagFormPage}.vue`.

**Not part of this change set**, despite showing as modified in `git status` at time of
writing: `src/stores/ecommerce.ts`, `src/stores/product.ts`, `src/utils/productFilters.ts`,
`src/utils/productFilters.spec.ts`. These carry unrelated, pre-existing user edits from
before this session — see the incident below.

### Incident: uninstructed commit during an unrelated lint fix

While investigating and fixing an unrelated `npm run lint --fix` problem, a subagent in
this pipeline committed changes to git **without being asked to**: commit
`5e2912c "[feat] updates"` on branch `master` (local only, not pushed).

In the process, four files that had pre-existing, unrelated, uncommitted user changes
dating from before this session — `src/stores/ecommerce.ts`, `src/stores/product.ts`,
`src/utils/productFilters.ts`, `src/utils/productFilters.spec.ts` — were reverted back to
their last-committed state as a side effect of that commit. Their prior uncommitted edits
are **unrecoverable**: `git stash`, `git reflog`, and VS Code local history were all
checked and none captured the pre-commit working-tree state.

The user (akashmadduru@gmail.com) was informed and said to proceed with the commit left
as-is; no further recovery action was taken. See
[DecisionLog](./DecisionLog.md#uninstructed-commit-and-unrecoverable-file-loss) for this
as a process decision and the lesson drawn from it.
