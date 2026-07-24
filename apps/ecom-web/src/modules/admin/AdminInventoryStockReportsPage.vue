<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Inventory" title="Stock reports"
      description="Products that need reordering or have run out of stock." />

    <div role="tablist" class="tabs tabs-boxed w-fit">
      <a role="tab" class="tab" :class="{ 'tab-active': activeTab === 'low' }" @click="activeTab = 'low'">
        Low stock ({{ inventoryStore.lowStock.length }})
      </a>
      <a role="tab" class="tab" :class="{ 'tab-active': activeTab === 'out' }" @click="activeTab = 'out'">
        Out of stock ({{ inventoryStore.outOfStock.length }})
      </a>
    </div>

    <SkeletonTable v-if="inventoryStore.reportsLoading" :rows="5" />

    <ErrorState v-else-if="inventoryStore.error" :message="inventoryStore.error" :on-retry="load" />

    <EmptyState v-else-if="!activeList.length"
      :title="activeTab === 'low' ? 'No low stock products' : 'No out-of-stock products'"
      description="Everything looks healthy right now." />

    <div v-else class="data-panel">
      <table class="table">
        <thead>
          <tr>
            <th>Product ID</th>
            <th>SKU</th>
            <th>Warehouse</th>
            <th>Available</th>
            <th>Reorder threshold</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in activeList" :key="item.product_id">
            <td class="font-semibold text-base-content">{{ item.product_id }}</td>
            <td>{{ item.sku }}</td>
            <td>{{ item.warehouse_location }}</td>
            <td>{{ item.available_quantity }}</td>
            <td>{{ item.reorder_threshold }}</td>
            <td class="text-right">
              <router-link class="btn btn-ghost btn-xs" :to="`/admin/inventory/${item.product_id}`">Manage</router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'

const inventoryStore = useInventoryStore()
const activeTab = ref<'low' | 'out'>('low')

const activeList = computed(() =>
  activeTab.value === 'low' ? inventoryStore.lowStock : inventoryStore.outOfStock,
)

function load() {
  inventoryStore.fetchReports()
}

onMounted(load)
</script>
