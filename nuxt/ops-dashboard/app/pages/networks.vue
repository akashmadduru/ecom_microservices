<script setup lang="ts">
import type { NetworkSummary } from '~~/server/runtime/types'

const api = useApiClient()
const router = useRouter()
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
  { key: 'actions', label: 'Actions' },
]

function openDetail(row: NetworkSummary): void {
  router.push(`/networks/${row.id}`)
}

// Page-level "Prune unused" — gated only on the global switch (prune has no
// per-target eligibility, unlike the row-level Remove control below).
const { data: resourceConfig } = useAsyncData('resource-mutations-config', () =>
  api.getResourceMutationsConfig(),
)
const { pruning, pruneError, run: pruneUnused } = usePruneAction({
  confirmMessage: 'Prune all unused networks? This cannot be undone.',
  errorFallback: 'Failed to prune networks.',
  prune: () => api.pruneNetworks(),
  refresh: () => refresh(),
})
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Networks</h1>
      <div class="page-head__actions">
        <button
          v-if="resourceConfig?.allowed"
          type="button"
          :disabled="pruning"
          @click="pruneUnused"
        >
          Prune unused
        </button>
        <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
      </div>
    </div>
    <p v-if="pruneError" class="error">{{ pruneError }}</p>
    <p v-if="error" class="error">Failed to load networks: {{ error.message }}</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="data?.networks ?? []"
      :row-key="(row) => row.id"
      empty-text="No networks found."
      @select="openDetail"
    >
      <template #cell-internal="{ row }">{{ row.internal ? 'yes' : 'no' }}</template>
      <template #cell-subnets="{ row }">{{ row.ipamSubnets.join(', ') || '—' }}</template>
      <template #cell-containers="{ row }">{{ row.containers.length }}</template>
      <template #cell-actions="{ row }">
        <NetworkActions :id="row.id" :name="row.name" @done="refresh()" />
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
.page-head__actions {
  display: flex;
  gap: 0.5rem;
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
