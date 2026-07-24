<script setup lang="ts">
const api = useApiClient()
const { data, pending, error, refresh } = await useAsyncData('networks', () =>
  api.listNetworks(),
)

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'driver', label: 'Driver' },
  { key: 'scope', label: 'Scope' },
  { key: 'internal', label: 'Internal' },
  { key: 'subnets', label: 'Subnets' },
  { key: 'containers', label: 'Containers' },
]
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Networks</h1>
      <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
    </div>
    <p v-if="error" class="error">Failed to load networks: {{ error.message }}</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="data?.networks ?? []"
      :row-key="(row) => row.id"
      empty-text="No networks found."
    >
      <template #cell-internal="{ row }">{{ row.internal ? 'yes' : 'no' }}</template>
      <template #cell-subnets="{ row }">{{ row.ipamSubnets.join(', ') || '—' }}</template>
      <template #cell-containers="{ row }">{{ row.containers.length }}</template>
    </DataTable>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.page-head h1 {
  margin: 0;
  font-size: 1.3rem;
}
.page-head button {
  background: transparent;
  border: 1px solid var(--border);
  color: inherit;
  border-radius: 0.4rem;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.error {
  color: #ff7b72;
}
</style>
