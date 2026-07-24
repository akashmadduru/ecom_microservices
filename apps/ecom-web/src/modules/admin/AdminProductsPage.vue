<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Products" title="Product catalog"
      description="Create, edit, delete, or seed demo products.">
      <template #action>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" :disabled="productStore.mutating" @click="onSeed">
            {{ productStore.mutating ? 'Seeding...' : 'Seed products' }}
          </button>
          <router-link class="btn btn-primary btn-sm" to="/admin/products/new">New product</router-link>
        </div>
      </template>
    </PageHeader>

    <DataTable :controller="controller" :columns="columns" empty-title="No products yet"
      empty-description="Create a product or seed demo data to get started.">
      <template #toolbar>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">Brand</span>
            <select class="select select-bordered select-sm min-w-40" :value="brandFilter" @change="onBrandChange">
              <option value="">All brands</option>
              <option v-for="brand in brandStore.brands" :key="brand.id" :value="brand.id">{{ brand.name }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">Min price</span>
            <input v-model="minPrice" type="number" min="0" inputmode="numeric" placeholder="0"
              class="input input-bordered input-sm w-28" @change="onPriceChange('min_price', minPrice)" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">Max price</span>
            <input v-model="maxPrice" type="number" min="0" inputmode="numeric" placeholder="Any"
              class="input input-bordered input-sm w-28" @change="onPriceChange('max_price', maxPrice)" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">Sort</span>
            <select class="select select-bordered select-sm min-w-44" :value="sortFilter" @change="onSortChange">
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>
      </template>
      <template #cell:image="{ row }">
        <AppImage :src="row.image_urls" :alt="row.title" img-class="h-12 w-12 rounded-lg object-cover" />
      </template>
      <template #cell:retail_price="{ row }">₹{{ row.retail_price }}</template>
      <template #cell:discount="{ row }">{{ row.discount }}%</template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <router-link class="btn btn-ghost btn-xs" :to="`/admin/products/${row.id}/edit`">Edit</router-link>
          <button class="btn btn-ghost btn-xs text-error" :disabled="productStore.mutating"
            @click="askDelete(row)">Delete</button>
        </div>
      </template>
    </DataTable>

    <ConfirmDialog :open="confirmOpen" title="Delete product"
      :message="`Delete &quot;${pendingDelete?.title ?? ''}&quot;? This cannot be undone.`" tone="danger"
      :loading="deleting" @confirm="confirmDelete" @cancel="cancelDelete"
      @update:open="(value) => value || cancelDelete()" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useProductStore } from '@/stores/product'
import { useEcommerceStore } from '@/stores/ecommerce'
import { useBrandStore } from '@/stores/brand'
import PageHeader from '@/components/PageHeader.vue'
import AppImage from '@/components/AppImage.vue'
import DataTable from '@/components/admin/DataTable.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import { getProducts } from '@/api/ProductsApi'
import { useListController } from '@/composables/useListController'
import { useConfirmAction } from '@/composables/useConfirmAction'
import type { ListQuery } from '@/composables/listController.types'
import type { DataTableColumn } from '@/components/admin/dataTable.types'
import type { Product, ProductFilterParams } from '@/interfaces/product'
import { PRODUCT_SORT_VALUES, toPriceParam, type SortOption } from '@/utils/productListFilters'

const productStore = useProductStore()
const ecommerceStore = useEcommerceStore()
const brandStore = useBrandStore()

const columns: DataTableColumn<Product>[] = [
  { key: 'image', header: '', width: '4rem' },
  { key: 'title', header: 'Name', cellClass: 'font-semibold text-base-content' },
  { key: 'category', header: 'Category' },
  { key: 'brand', header: 'Brand' },
  { key: 'retail_price', header: 'Price' },
  { key: 'discount', header: 'Discount' },
]

const sortOptions: SortOption[] = [
  { value: PRODUCT_SORT_VALUES.featured, label: 'Default' },
  { value: PRODUCT_SORT_VALUES.priceAsc, label: 'Price: Low to High' },
  { value: PRODUCT_SORT_VALUES.priceDesc, label: 'Price: High to Low' },
  { value: PRODUCT_SORT_VALUES.ratingDesc, label: 'Rating: High to Low' },
  { value: PRODUCT_SORT_VALUES.newest, label: 'Newest first' },
]

const brandFilter = ref<string>('')
const minPrice = ref<string>('')
const maxPrice = ref<string>('')
const sortFilter = ref<string>('')

const controller = useListController<Product>({
  initialPageSize: 10,
  fetcher: async (query: ListQuery, signal?: AbortSignal) => {
    const filters = query.filters
    const params: ProductFilterParams = {
      brand_id: (filters.brand_id as number | undefined) || undefined,
      min_price: (filters.min_price as number | undefined) || undefined,
      max_price: (filters.max_price as number | undefined) || undefined,
      sort: (filters.sort as string | undefined) || undefined,
    }
    const response = await getProducts(query.page, query.pageSize, params, signal)
    return { items: response.products, pagination: response.pagination }
  },
})

function onBrandChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  brandFilter.value = value
  controller.setFilter('brand_id', value === '' ? undefined : Number(value))
}

function onPriceChange(key: 'min_price' | 'max_price', value: string) {
  controller.setFilter(key, toPriceParam(value))
}

function onSortChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  sortFilter.value = value
  controller.setFilter('sort', value === '' ? undefined : value)
}

const {
  pendingDelete,
  confirmOpen,
  deleting,
  ask: askDelete,
  cancel: cancelDelete,
  confirm: confirmDelete,
} = useConfirmAction<Product>({
  perform: async (product) => {
    await productStore.deleteProduct(product.id)
  },
  label: (product) => product.title,
  onSuccess: async () => {
    await controller.refresh()
    // Server-mode delete can leave us on a now-empty last page; clamp back.
    const totalPages = controller.pagination.value.total_pages
    if (controller.page.value > totalPages && totalPages > 0) {
      controller.setPage(totalPages)
    }
  },
  errorMessage: () => productStore.error ?? 'Failed to delete product.',
})

async function onSeed() {
  try {
    await productStore.seedProducts()
    ecommerceStore.showToast('Demo products seeded.', 'success')
    await controller.refresh()
  } catch {
    ecommerceStore.showToast(productStore.error ?? 'Failed to seed products.', 'error')
  }
}

onMounted(() => {
  if (!brandStore.brands.length) void brandStore.fetchBrands()
})
</script>
