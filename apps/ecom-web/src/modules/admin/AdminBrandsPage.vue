<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Brands" title="Brands"
      description="Create, edit, or delete brands used by products.">
      <template #action>
        <router-link class="btn btn-primary btn-sm" to="/admin/brands/new">New brand</router-link>
      </template>
    </PageHeader>

    <DataTable :controller="controller" :columns="columns" empty-title="No brands yet"
      empty-description="Create a brand to get started.">
      <template #toolbar>
        <AdminTableToolbar :model-value="controller.search.value" search-placeholder="Search brands"
          :loading="controller.loading.value" @update:model-value="controller.setSearch" />
      </template>
      <template #cell:logo="{ row }">
        <AppImage :src="row.logo_url" :alt="row.name" img-class="h-12 w-12 rounded-lg object-cover" />
      </template>
      <template #cell:manufacturer="{ row }">{{ manufacturerName(row.manufacturer_id) }}</template>
      <template #cell:is_active="{ row }">
        <span class="badge" :class="row.is_active ? 'badge-success' : 'badge-outline'">
          {{ row.is_active ? 'Active' : 'Inactive' }}
        </span>
      </template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <router-link class="btn btn-ghost btn-xs" :to="`/admin/brands/${row.id}/edit`">Edit</router-link>
          <button class="btn btn-ghost btn-xs text-error" :disabled="brandStore.mutating"
            @click="askDelete(row)">Delete</button>
        </div>
      </template>
    </DataTable>

    <ConfirmDialog :open="confirmOpen" title="Delete brand"
      :message="`Delete &quot;${pendingDelete?.name ?? ''}&quot;? This cannot be undone.`" tone="danger"
      :loading="deleting" @confirm="confirmDelete" @cancel="cancelDelete"
      @update:open="(value) => value || cancelDelete()" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrandStore } from '@/stores/brand'
import { useManufacturerStore } from '@/stores/manufacturer'
import PageHeader from '@/components/PageHeader.vue'
import AppImage from '@/components/AppImage.vue'
import DataTable from '@/components/admin/DataTable.vue'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import { useClientList } from '@/composables/useClientList'
import { useConfirmAction } from '@/composables/useConfirmAction'
import type { DataTableColumn } from '@/components/admin/dataTable.types'
import type { Brand } from '@/interfaces/brand'

const brandStore = useBrandStore()
const manufacturerStore = useManufacturerStore()

const { brands, loading, error } = storeToRefs(brandStore)

const columns: DataTableColumn<Brand>[] = [
  { key: 'logo', header: 'Logo', width: '4rem' },
  { key: 'name', header: 'Name', cellClass: 'font-semibold text-base-content' },
  { key: 'slug', header: 'Slug' },
  { key: 'manufacturer', header: 'Manufacturer' },
  { key: 'is_active', header: 'Active' },
]

const controller = useClientList<Brand>({
  source: brands,
  searchFields: ['name', 'slug'],
  initialPageSize: 10,
  loading,
  error,
  onRefresh: () => brandStore.fetchBrands(),
})

function manufacturerName(manufacturerId?: number): string {
  if (!manufacturerId) return '—'
  const manufacturer = manufacturerStore.manufacturers.find((m) => m.id === manufacturerId)
  return manufacturer?.name ?? `#${manufacturerId}`
}

function clampPage(): void {
  const totalPages = controller.pagination.value.total_pages
  if (controller.page.value > totalPages) controller.setPage(totalPages)
}

const {
  pendingDelete,
  confirmOpen,
  deleting,
  ask: askDelete,
  cancel: cancelDelete,
  confirm: confirmDelete,
} = useConfirmAction<Brand>({
  perform: async (brand) => {
    await brandStore.deleteBrand(brand.id)
  },
  label: (brand) => brand.name,
  onSuccess: () => clampPage(),
  errorMessage: () => brandStore.error ?? 'Failed to delete brand.',
})

onMounted(() => {
  brandStore.fetchBrands()
  manufacturerStore.fetchManufacturers()
})
</script>
