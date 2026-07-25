<script setup lang="ts">
import type { ImageSummary } from '~~/server/runtime/types'

const api = useApiClient()
const router = useRouter()
const { data, pending, error, refresh } = await useAsyncData('images', () =>
  api.listImages(),
)

const columns = [
  { key: 'repoTags', label: 'Tags' },
  { key: 'size', label: 'Size' },
  { key: 'createdAt', label: 'Created' },
  { key: 'dangling', label: 'Dangling' },
  { key: 'containerCount', label: 'Containers' },
  { key: 'actions', label: 'Actions' },
]

function openDetail(row: ImageSummary): void {
  router.push(`/images/${encodeURIComponent(row.id)}`)
}

// Page-level "Prune unused" — gated only on the global switch (prune has no
// per-target eligibility, unlike the row-level Remove control below).
const { data: resourceConfig } = useAsyncData('resource-mutations-config', () =>
  api.getResourceMutationsConfig(),
)
const { pruning, pruneError, run: pruneUnused } = usePruneAction({
  confirmMessage: 'Prune all dangling (unused) images? This cannot be undone.',
  errorFallback: 'Failed to prune images.',
  prune: () => api.pruneImages(),
  refresh: () => refresh(),
})

/** Bytes to a human-readable size; null (kubernetes mode) renders as '—'. */
function formatSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Images</h1>
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
    <p v-if="error" class="error">Failed to load images: {{ error.message }}</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="data?.images ?? []"
      :row-key="(row) => row.id"
      empty-text="No images found."
      @select="openDetail"
    >
      <template #cell-repoTags="{ row }">
        <span :class="{ muted: row.dangling }">{{ row.repoTags.join(', ') || '(dangling)' }}</span>
      </template>
      <template #cell-size="{ row }">{{ formatSize(row.size) }}</template>
      <template #cell-createdAt="{ row }">{{ row.createdAt ?? '—' }}</template>
      <template #cell-dangling="{ row }">{{ row.dangling ? 'yes' : 'no' }}</template>
      <template #cell-actions="{ row }">
        <ImageActions :image-id="row.id" :container-count="row.containerCount" @done="refresh()" />
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
.muted {
  color: var(--muted);
}
</style>
