<template>
  <div class="min-h-screen px-4 py-10 text-base-content">
    <div class="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside class="card">
        <div class="card-body space-y-6">
          <div>
            <h2 class="text-xl font-semibold">Filters</h2>
            <p class="text-sm text-muted">Refine your search</p>
          </div>

          <label class="form-control">
            <span class="label-text">Sort by</span>
            <select class="select select-bordered" :value="sortFilter" @change="onSortChange">
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}
              </option>
            </select>
          </label>

          <div class="form-control">
            <span class="label-text">Price</span>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>₹{{ minPrice }}</span>
              <span>₹{{ maxPrice }}</span>
            </div>
            <div class="price-slider">
              <div class="price-slider-track"></div>
              <div class="price-slider-fill" :style="{ left: minPercent + '%', right: (100 - maxPercent) + '%' }">
              </div>
              <input v-model.number="minPrice" type="range" :min="PRICE_MIN" :max="PRICE_MAX" :step="PRICE_STEP"
                class="price-slider-input text-primary" @change="onMinPriceChange" />
              <input v-model.number="maxPrice" type="range" :min="PRICE_MIN" :max="PRICE_MAX" :step="PRICE_STEP"
                class="price-slider-input text-primary" @change="onMaxPriceChange" />
            </div>
          </div>

          <div class="form-control">
            <span class="label-text">Rating</span>
            <RatingFilter :model-value="minRatingFilter" @update:model-value="onMinRatingChange" />
          </div>

          <div class="form-control">
            <span class="label-text">Category</span>
            <CategoryTreeFilter :model-value="categoryFilter" @update:model-value="onCategoryFilterChange" />
          </div>

          <div class="form-control">
            <span class="label-text">Brand</span>
            <BrandFilterScroller :model-value="brandFilter" @update:model-value="onBrandFilterChange" />
          </div>

          <button class="btn btn-outline" @click="clearAll">Clear filters</button>
        </div>
      </aside>

      <section class="space-y-6">
        <PageHeader eyebrow="Catalog" title="Shop the latest collection"
          description="Discover products with filters, smart sorting, and quick purchase actions.">
        </PageHeader>

        <div v-if="activeChips.length" class="flex flex-wrap items-center gap-2">
          <span v-for="chip in activeChips" :key="chip.key"
            class="eyebrow-pill eyebrow-pill-sm flex items-center gap-2">
            {{ chip.label }}
            <button class="text-base-content/60 hover:text-base-content" :aria-label="`Remove ${chip.label} filter`"
              @click="chip.remove">✕</button>
          </span>
          <button class="text-sm text-muted underline hover:text-base-content" @click="clearAll">Clear all</button>
        </div>

        <SkeletonGrid v-if="controller.loading.value && !controller.items.value.length" :count="6" />

        <ErrorState v-else-if="controller.error.value" :message="controller.error.value"
          :on-retry="() => controller.refresh()" />

        <EmptyState v-else-if="controller.isEmpty.value" title="No products match your filters"
          description="Try adjusting or clearing your filters to see more results." />

        <div v-else class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <ProductCard v-for="product in controller.items.value" :key="product.id" :product="product" />
        </div>

        <PaginationComponent v-if="controller.items.value.length" :pagination="controller.pagination.value"
          item-label="products" @change="controller.setPage" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useListController } from '@/composables/useListController'
import type { ListQuery } from '@/composables/listController.types'
import { getProducts } from '@/api/ProductsApi'
import { useCategoryStore } from '@/stores/category'
import { useBrandStore } from '@/stores/brand'
import type { Product, ProductFilterParams } from '@/interfaces/product'
import PageHeader from '@/components/PageHeader.vue'
import ProductCard from '@/components/ProductCard.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import SkeletonGrid from '@/components/SkeletonGrid.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import CategoryTreeFilter from '@/components/products/CategoryTreeFilter.vue'
import BrandFilterScroller from '@/components/products/BrandFilterScroller.vue'
import RatingFilter from '@/components/products/RatingFilter.vue'
import { PRODUCT_SORT_VALUES, type SortOption } from '@/utils/productListFilters'

const categoryStore = useCategoryStore()
const brandStore = useBrandStore()

const sortOptions: SortOption[] = [
  { value: PRODUCT_SORT_VALUES.featured, label: 'Featured' },
  { value: PRODUCT_SORT_VALUES.priceAsc, label: 'Price: Low to High' },
  { value: PRODUCT_SORT_VALUES.priceDesc, label: 'Price: High to Low' },
  { value: PRODUCT_SORT_VALUES.ratingDesc, label: 'Top Rated' },
  { value: PRODUCT_SORT_VALUES.newest, label: 'Newest' },
]

const PRICE_MIN = 0
const PRICE_MAX = 150000
const PRICE_STEP = 500

const categoryFilter = ref<number | null>(null)
const brandFilter = ref<number | null>(null)
const minPrice = ref<number>(PRICE_MIN)
const maxPrice = ref<number>(PRICE_MAX)
const minRatingFilter = ref<number | null>(null)
const sortFilter = ref<string>('')

const minPercent = computed(() => ((minPrice.value - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100)
const maxPercent = computed(() => ((maxPrice.value - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100)

const controller = useListController<Product>({
  initialPageSize: 12,
  fetcher: async (query: ListQuery, signal?: AbortSignal) => {
    const filters = query.filters
    const params: ProductFilterParams = {
      category_id: (filters.category_id as number | undefined) ?? undefined,
      brand_id: (filters.brand_id as number | undefined) ?? undefined,
      min_price: (filters.min_price as number | undefined) ?? undefined,
      max_price: (filters.max_price as number | undefined) ?? undefined,
      min_rating: (filters.min_rating as number | undefined) ?? undefined,
      sort: (filters.sort as string | undefined) ?? undefined,
    }
    const response = await getProducts(query.page, query.pageSize, params, signal)
    return { items: response.products, pagination: response.pagination }
  },
})

function onCategoryFilterChange(value: number | null) {
  categoryFilter.value = value
  controller.setFilter('category_id', value ?? undefined)
}

function onBrandFilterChange(value: number | null) {
  brandFilter.value = value
  controller.setFilter('brand_id', value ?? undefined)
}

function onMinRatingChange(value: number | null) {
  minRatingFilter.value = value
  controller.setFilter('min_rating', value ?? undefined)
}

function onMinPriceChange() {
  if (minPrice.value > maxPrice.value) minPrice.value = maxPrice.value
  controller.setFilter('min_price', minPrice.value > PRICE_MIN ? minPrice.value : undefined)
}

function onMaxPriceChange() {
  if (maxPrice.value < minPrice.value) maxPrice.value = minPrice.value
  controller.setFilter('max_price', maxPrice.value < PRICE_MAX ? maxPrice.value : undefined)
}

function onSortChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  sortFilter.value = value
  controller.setFilter('sort', value === '' ? undefined : value)
}

function clearAll() {
  categoryFilter.value = null
  brandFilter.value = null
  minPrice.value = PRICE_MIN
  maxPrice.value = PRICE_MAX
  minRatingFilter.value = null
  sortFilter.value = ''
  controller.reset()
}

interface FilterChip {
  key: string
  label: string
  remove: () => void
}

const activeChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = []
  const filters = controller.filters.value

  const categoryId = filters.category_id as number | undefined
  if (categoryId) {
    const category = categoryStore.findCategoryById(categoryId)
    chips.push({
      key: 'category_id',
      label: `Category: ${category?.name ?? categoryId}`,
      remove: () => {
        categoryFilter.value = null
        controller.setFilter('category_id', undefined)
      },
    })
  }

  const brandId = filters.brand_id as number | undefined
  if (brandId) {
    const brand = brandStore.brands.find((item) => item.id === brandId)
    chips.push({
      key: 'brand_id',
      label: `Brand: ${brand?.name ?? brandId}`,
      remove: () => {
        brandFilter.value = null
        controller.setFilter('brand_id', undefined)
      },
    })
  }

  const minPriceFilter = filters.min_price as number | undefined
  if (minPriceFilter !== undefined) {
    chips.push({
      key: 'min_price',
      label: `Min ₹${minPriceFilter}`,
      remove: () => {
        minPrice.value = PRICE_MIN
        controller.setFilter('min_price', undefined)
      },
    })
  }

  const maxPriceFilter = filters.max_price as number | undefined
  if (maxPriceFilter !== undefined) {
    chips.push({
      key: 'max_price',
      label: `Max ₹${maxPriceFilter}`,
      remove: () => {
        maxPrice.value = PRICE_MAX
        controller.setFilter('max_price', undefined)
      },
    })
  }

  const minRatingValue = filters.min_rating as number | undefined
  if (minRatingValue !== undefined) {
    const ratingLabel = minRatingValue === 5 ? '5 Stars' : `${minRatingValue} Stars & Up`
    chips.push({
      key: 'min_rating',
      label: `Rating: ${ratingLabel}`,
      remove: () => {
        minRatingFilter.value = null
        controller.setFilter('min_rating', undefined)
      },
    })
  }

  const sort = filters.sort as string | undefined
  if (sort) {
    const option = sortOptions.find((item) => item.value === sort)
    chips.push({
      key: 'sort',
      label: `Sort: ${option?.label ?? sort}`,
      remove: () => {
        sortFilter.value = ''
        controller.setFilter('sort', undefined)
      },
    })
  }

  return chips
})

</script>

<style scoped>
.price-slider {
  position: relative;
  height: 1.25rem;
}

.price-slider-track {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 4px;
  transform: translateY(-50%);
  border-radius: 9999px;
  background-color: var(--color-base-300, #d1d5db);
}

.price-slider-fill {
  position: absolute;
  top: 50%;
  height: 4px;
  transform: translateY(-50%);
  border-radius: 9999px;
  background-color: currentColor;
  color: inherit;
}

.price-slider-input {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  appearance: none;
  background: transparent;
  pointer-events: none;
}

.price-slider-input::-webkit-slider-runnable-track {
  background: transparent;
}

.price-slider-input::-webkit-slider-thumb {
  pointer-events: auto;
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: 0;
  border-radius: 9999px;
  background-color: currentColor;
  cursor: pointer;
  box-shadow: 0 0 0 2px var(--color-base-100, #fff);
}

.price-slider-input::-moz-range-track {
  background: transparent;
  border: none;
}

.price-slider-input::-moz-range-thumb {
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 9999px;
  background-color: currentColor;
  cursor: pointer;
  box-shadow: 0 0 0 2px var(--color-base-100, #fff);
}
</style>
