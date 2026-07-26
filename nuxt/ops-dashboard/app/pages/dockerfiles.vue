<script setup lang="ts">
import type { DockerfileSummary } from '~~/server/runtime/types'

const api = useApiClient()
const router = useRouter()
const { data, pending, error, refresh } = await useAsyncData('dockerfiles', () =>
  api.listDockerfiles(),
)

const columns = [
  { key: 'label', label: 'Label' },
  { key: 'buildContext', label: 'Build Context' },
  { key: 'baseImage', label: 'Base Image' },
  { key: 'exposedPorts', label: 'Exposed Ports' },
  { key: 'stageCount', label: 'Stages' },
]

function openDetail(row: DockerfileSummary): void {
  router.push(`/dockerfiles/${encodeURIComponent(row.id)}`)
}

/** `.` is this script's own shorthand for "repo root" (see the manifest's own `buildContext` values). */
function formatBuildContext(buildContext: string): string {
  return buildContext === '.' ? '(repo root)' : buildContext
}
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Dockerfiles</h1>
      <div class="page-head__actions">
        <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
      </div>
    </div>
    <p class="muted small">
      A fixed, hardcoded list of this monorepo's own 7 Dockerfiles — read-only display
      only, never a filesystem scan and never editable here.
    </p>
    <p v-if="error" class="error">Failed to load Dockerfiles: {{ error.message }}</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="data?.dockerfiles ?? []"
      :row-key="(row) => row.id"
      empty-text="No Dockerfiles found."
      @select="openDetail"
    >
      <template #cell-buildContext="{ row }">{{ formatBuildContext(row.buildContext) }}</template>
      <template #cell-exposedPorts="{ row }">{{ row.exposedPorts.join(', ') || '—' }}</template>
    </DataTable>
  </div>
</template>

<style scoped>
.page-head h1 {
  margin: 0;
  font-size: 1.3rem;
}
</style>
