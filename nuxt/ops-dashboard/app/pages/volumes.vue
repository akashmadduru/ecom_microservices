<script setup lang="ts">
import type { VolumeSummary } from '~~/server/runtime/types'

const api = useApiClient()
const router = useRouter()
const { data, pending, error, refresh } = await useAsyncData('volumes', () =>
  api.listVolumes(),
)

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'driver', label: 'Driver' },
  { key: 'scope', label: 'Scope' },
  { key: 'mountpoint', label: 'Mountpoint' },
  { key: 'createdAt', label: 'Created' },
  { key: 'actions', label: 'Actions' },
]

function openDetail(row: VolumeSummary): void {
  router.push(`/volumes/${row.id}`)
}

// Page-level "Prune unused" — gated only on the global switch (prune has no
// per-target eligibility, unlike the row-level Remove control below).
const { data: resourceConfig } = useAsyncData('resource-mutations-config', () =>
  api.getResourceMutationsConfig(),
)
const { pruning, pruneError, run: pruneUnused } = usePruneAction({
  confirmMessage: 'Prune all unused volumes? This cannot be undone.',
  errorFallback: 'Failed to prune volumes.',
  prune: () => api.pruneVolumes(),
  refresh: () => refresh(),
})
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Volumes</h1>
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
    <p v-if="error" class="error">Failed to load volumes: {{ error.message }}</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="data?.volumes ?? []"
      :row-key="(row) => row.id"
      empty-text="No volumes found."
      @select="openDetail"
    >
      <template #cell-mountpoint="{ row }">
        <TextPopover :text="row.mountpoint" />
      </template>
      <template #cell-createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
      <template #cell-actions="{ row }">
        <VolumeActions :id="row.id" :name="row.name" @done="refresh()" />
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.page-head h1 {
  margin: 0;
  font-size: 1.3rem;
}
</style>
