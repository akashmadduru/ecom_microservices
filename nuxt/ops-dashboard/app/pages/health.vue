<script setup lang="ts">
const api = useApiClient()
const { data, pending, error, refresh } = await useAsyncData('health', () =>
  api.getHealth(),
)

const serviceColumns = [
  { key: 'service', label: 'Service' },
  { key: 'project', label: 'Project' },
  { key: 'total', label: 'Total' },
  { key: 'running', label: 'Running' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'unhealthy', label: 'Unhealthy' },
  { key: 'starting', label: 'Starting' },
]
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Health</h1>
      <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
    </div>
    <p v-if="error" class="error">Failed to load health: {{ error.message }}</p>
    <template v-else-if="data">
      <p class="engine" :class="{ 'engine--down': !data.engineReachable }">
        Engine: {{ data.engineReachable ? 'reachable' : 'unreachable' }}
      </p>

      <div class="cards">
        <div class="card"><span class="card__n">{{ data.totals.containers }}</span>Containers</div>
        <div class="card"><span class="card__n">{{ data.totals.running }}</span>Running</div>
        <div class="card"><span class="card__n">{{ data.totals.stopped }}</span>Stopped</div>
        <div class="card"><span class="card__n">{{ data.totals.healthy }}</span>Healthy</div>
        <div class="card"><span class="card__n">{{ data.totals.unhealthy }}</span>Unhealthy</div>
        <div class="card"><span class="card__n">{{ data.totals.starting }}</span>Starting</div>
        <div class="card"><span class="card__n">{{ data.totals.noHealthcheck }}</span>No check</div>
      </div>

      <h2>By service</h2>
      <DataTable
        :columns="serviceColumns"
        :rows="data.services"
        :row-key="(row) => `${row.project ?? ''}/${row.service}`"
        empty-text="No compose-managed services found."
      >
        <template #cell-project="{ row }">{{ row.project ?? '—' }}</template>
      </DataTable>
    </template>
  </div>
</template>

<style scoped>
.page-head h1 {
  margin: 0;
  font-size: 1.3rem;
}
.engine {
  color: var(--success);
  font-size: 0.9rem;
}
.engine--down {
  color: var(--error);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.75rem;
  margin: 1rem 0 2rem;
}
.card {
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.8rem;
  background: var(--surface);
}
.card__n {
  font-size: 1.6rem;
  color: var(--text);
  font-weight: 700;
}
h2 {
  font-size: 1.05rem;
}
</style>
