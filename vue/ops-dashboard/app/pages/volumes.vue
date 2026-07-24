<script setup lang="ts">
const api = useApiClient()
const { data, pending, error, refresh } = await useAsyncData('volumes', () =>
  api.listVolumes(),
)

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'driver', label: 'Driver' },
  { key: 'scope', label: 'Scope' },
  { key: 'mountpoint', label: 'Mountpoint' },
  { key: 'createdAt', label: 'Created' },
]
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Volumes</h1>
      <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
    </div>
    <p v-if="error" class="error">Failed to load volumes: {{ error.message }}</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="data?.volumes ?? []"
      :row-key="(row) => row.name"
      empty-text="No volumes found."
    >
      <template #cell-createdAt="{ row }">{{ row.createdAt ?? '—' }}</template>
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
