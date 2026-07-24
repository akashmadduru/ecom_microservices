<script setup lang="ts">
import type { ContainerSummary } from '~~/server/runtime/types'

const api = useApiClient()
const router = useRouter()

const { data, pending, error, refresh } = await useAsyncData(
  'containers',
  () => api.listContainers(),
)

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'image', label: 'Image' },
  { key: 'state', label: 'State' },
  { key: 'health', label: 'Health' },
  { key: 'service', label: 'Service' },
  { key: 'project', label: 'Project' },
  { key: 'actions', label: 'Actions' },
]

function openDetail(row: ContainerSummary): void {
  router.push(`/containers/${row.id}`)
}
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Containers</h1>
      <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
    </div>

    <p v-if="error" class="error">Failed to load containers: {{ error.message }}</p>
    <p v-else-if="pending && !data">Loading…</p>

    <DataTable
      v-else
      :columns="columns"
      :rows="data?.containers ?? []"
      :row-key="(row) => row.id"
      empty-text="No containers found."
      @select="openDetail"
    >
      <template #cell-health="{ row }">
        <HealthBadge :health="row.health" />
      </template>
      <template #cell-service="{ row }">
        <span :class="{ muted: !row.managed }">{{ row.service ?? 'unmanaged' }}</span>
      </template>
      <template #cell-project="{ row }">
        {{ row.project ?? '—' }}
      </template>
      <template #cell-actions="{ row }">
        <ContainerActions
          :container-id="row.id"
          :service="row.service"
          :managed="row.managed"
          @done="refresh()"
        />
      </template>
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
.muted {
  color: var(--muted);
}
</style>
