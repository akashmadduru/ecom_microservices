<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Inventory" title="Inventory health report"
      description="Aggregate health metrics reported by the inventory service." />

    <SkeletonTable v-if="inventoryStore.reportsLoading && !inventoryStore.healthReport" :rows="5" />

    <ErrorState v-else-if="inventoryStore.error && !inventoryStore.healthReport" :message="inventoryStore.error"
      :on-retry="load" />

    <EmptyState v-else-if="!entries.length" title="No health data" description="The health report returned no data." />

    <div v-else class="data-panel">
      <table class="table">
        <tbody>
          <tr v-for="[key, value] in entries" :key="key">
            <td class="w-1/3 font-semibold text-base-content">{{ key }}</td>
            <td class="font-mono text-sm">{{ formatValue(value) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'

const inventoryStore = useInventoryStore()

const entries = computed(() => Object.entries(inventoryStore.healthReport ?? {}))

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function load() {
  inventoryStore.fetchHealthReport()
}

onMounted(load)
</script>
