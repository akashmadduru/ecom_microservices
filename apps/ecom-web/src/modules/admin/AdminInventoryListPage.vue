<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Inventory" title="Inventory records"
      description="Track stock levels across warehouses.">
      <template #action>
        <router-link class="btn btn-primary btn-sm" to="/admin/inventory/new">New inventory record</router-link>
      </template>
    </PageHeader>

    <DataTable :controller="controller" :columns="columns" row-key="product_id" empty-title="No inventory records"
      empty-description="Create an inventory record for a product to start tracking stock.">
      <template #toolbar>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">Status</span>
            <select class="select select-bordered select-sm min-w-40" :value="statusFilter" @change="onStatusChange">
              <option value="">All statuses</option>
              <option value="IN_STOCK">In stock</option>
              <option value="LOW_STOCK">Low stock</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">Warehouse</span>
            <input v-model="warehouseFilter" type="text" placeholder="e.g. DEFAULT"
              class="input input-bordered input-sm w-40" @change="onWarehouseChange" />
          </label>
        </div>
      </template>
      <template #cell:status="{ row }">
        <span class="badge" :class="statusClass(row.status)">{{ row.status ?? 'UNKNOWN' }}</span>
      </template>
      <template #actions="{ row }">
        <router-link class="btn btn-ghost btn-xs" :to="`/admin/inventory/${row.product_id}`">Manage</router-link>
      </template>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import DataTable from '@/components/admin/DataTable.vue'
import { listInventory } from '@/api/InventoryApi'
import { useListController } from '@/composables/useListController'
import type { ListQuery } from '@/composables/listController.types'
import type { DataTableColumn } from '@/components/admin/dataTable.types'
import type { InventoryRecord, InventoryStatus } from '@/interfaces/inventory'

const columns: DataTableColumn<InventoryRecord>[] = [
  { key: 'product_id', header: 'Product ID', cellClass: 'font-semibold text-base-content' },
  { key: 'sku', header: 'SKU' },
  { key: 'warehouse_location', header: 'Warehouse' },
  { key: 'available_quantity', header: 'Available' },
  { key: 'reorder_threshold', header: 'Reorder threshold' },
  { key: 'status', header: 'Status' },
]

const statusFilter = ref<InventoryStatus | ''>('')
const warehouseFilter = ref<string>('')

const controller = useListController<InventoryRecord>({
  initialPageSize: 20,
  fetcher: async (query: ListQuery, signal?: AbortSignal) => {
    const status = (query.filters.status as InventoryStatus | '' | undefined) ?? ''
    const warehouse = (query.filters.warehouse_location as string | undefined) ?? ''
    const response = await listInventory(query.page, query.pageSize, status, warehouse, signal)
    return { items: response.items, pagination: response.pagination }
  },
})

function statusClass(status?: InventoryStatus) {
  if (status === 'OUT_OF_STOCK') return 'badge-error'
  if (status === 'LOW_STOCK') return 'badge-warning'
  return 'badge-success'
}

function onStatusChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as InventoryStatus | ''
  statusFilter.value = value
  controller.setFilter('status', value === '' ? undefined : value)
}

function onWarehouseChange() {
  const value = warehouseFilter.value.trim()
  controller.setFilter('warehouse_location', value === '' ? undefined : value)
}
</script>
