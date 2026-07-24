<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Manufacturers" title="Manufacturers"
      description="Create, edit, or delete manufacturers used by brands.">
      <template #action>
        <router-link class="btn btn-primary btn-sm" to="/admin/manufacturers/new">New manufacturer</router-link>
      </template>
    </PageHeader>

    <DataTable :controller="controller" :columns="columns" empty-title="No manufacturers yet"
      empty-description="Create a manufacturer to get started.">
      <template #toolbar>
        <AdminTableToolbar :model-value="controller.search.value" search-placeholder="Search manufacturers"
          :loading="controller.loading.value" @update:model-value="controller.setSearch" />
      </template>
      <template #cell:country_of_origin="{ row }">{{ row.country_of_origin || '—' }}</template>
      <template #cell:contact_email="{ row }">{{ row.contact_info?.email || '—' }}</template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <router-link class="btn btn-ghost btn-xs" :to="`/admin/manufacturers/${row.id}/edit`">Edit</router-link>
          <button class="btn btn-ghost btn-xs text-error" :disabled="manufacturerStore.mutating"
            @click="askDelete(row)">Delete</button>
        </div>
      </template>
    </DataTable>

    <ConfirmDialog :open="confirmOpen" title="Delete manufacturer"
      :message="`Delete &quot;${pendingDelete?.name ?? ''}&quot;? This cannot be undone.`" tone="danger"
      :loading="deleting" @confirm="confirmDelete" @cancel="cancelDelete"
      @update:open="(value) => value || cancelDelete()" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useManufacturerStore } from '@/stores/manufacturer'
import PageHeader from '@/components/PageHeader.vue'
import DataTable from '@/components/admin/DataTable.vue'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import { useClientList } from '@/composables/useClientList'
import { useConfirmAction } from '@/composables/useConfirmAction'
import type { DataTableColumn } from '@/components/admin/dataTable.types'
import type { Manufacturer } from '@/interfaces/manufacturer'

const manufacturerStore = useManufacturerStore()

const { manufacturers, loading, error } = storeToRefs(manufacturerStore)

const columns: DataTableColumn<Manufacturer>[] = [
  { key: 'name', header: 'Name', cellClass: 'font-semibold text-base-content' },
  { key: 'country_of_origin', header: 'Country of origin' },
  { key: 'contact_email', header: 'Contact email' },
]

const controller = useClientList<Manufacturer>({
  source: manufacturers,
  searchFields: ['name', 'country_of_origin'],
  initialPageSize: 10,
  loading,
  error,
  onRefresh: () => manufacturerStore.fetchManufacturers(),
})

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
} = useConfirmAction<Manufacturer>({
  perform: async (manufacturer) => {
    await manufacturerStore.deleteManufacturer(manufacturer.id)
  },
  label: (manufacturer) => manufacturer.name,
  onSuccess: () => clampPage(),
  errorMessage: () => manufacturerStore.error ?? 'Failed to delete manufacturer.',
})

onMounted(() => {
  manufacturerStore.fetchManufacturers()
})
</script>
