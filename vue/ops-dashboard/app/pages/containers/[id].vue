<script setup lang="ts">
const route = useRoute()
const api = useApiClient()

const id = computed(() => String(route.params.id))
const showLogs = ref(false)

const { data, pending, error, refresh } = await useAsyncData(
  () => `container-${id.value}`,
  () => api.inspectContainer(id.value),
  { watch: [id] },
)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <NuxtLink to="/containers" class="back">← Containers</NuxtLink>
        <h1>{{ data?.name ?? id }}</h1>
      </div>
      <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
    </div>

    <p v-if="error" class="error">Failed to inspect container: {{ error.message }}</p>
    <template v-else-if="data">
      <dl class="detail">
        <div><dt>ID</dt><dd class="mono">{{ data.id }}</dd></div>
        <div><dt>Image</dt><dd>{{ data.image }}</dd></div>
        <div><dt>State</dt><dd>{{ data.state }}</dd></div>
        <div><dt>Health</dt><dd><HealthBadge :health="data.health" /></dd></div>
        <div><dt>Running</dt><dd>{{ data.running ? 'yes' : 'no' }}</dd></div>
        <div><dt>Exit code</dt><dd>{{ data.exitCode ?? '—' }}</dd></div>
        <div><dt>Restarts</dt><dd>{{ data.restartCount }}</dd></div>
        <div><dt>Service</dt><dd>{{ data.service ?? 'unmanaged' }}</dd></div>
        <div><dt>Project</dt><dd>{{ data.project ?? '—' }}</dd></div>
        <div><dt>Created</dt><dd>{{ data.createdAt }}</dd></div>
        <div><dt>Command</dt><dd class="mono">{{ data.command }}</dd></div>
        <div><dt>Networks</dt><dd>{{ data.networks.join(', ') || '—' }}</dd></div>
      </dl>

      <section class="block">
        <h2>Ports</h2>
        <ul v-if="data.ports.length" class="plain">
          <li v-for="(p, i) in data.ports" :key="i" class="mono">
            {{ p.ip ?? '0.0.0.0' }}:{{ p.publicPort ?? '—' }} → {{ p.privatePort }}/{{ p.type }}
          </li>
        </ul>
        <p v-else class="muted">No published ports.</p>
      </section>

      <section class="block">
        <h2>Mounts</h2>
        <ul v-if="data.mounts.length" class="plain">
          <li v-for="(m, i) in data.mounts" :key="i" class="mono">
            {{ m.type }}: {{ m.source || '(anonymous)' }} → {{ m.destination }}
            ({{ m.readWrite ? 'rw' : 'ro' }})
          </li>
        </ul>
        <p v-else class="muted">No mounts.</p>
      </section>

      <section class="block">
        <h2>Environment keys</h2>
        <p class="muted small">Values are redacted; names only.</p>
        <ul v-if="data.envKeys.length" class="plain">
          <li v-for="k in data.envKeys" :key="k" class="mono">{{ k }}</li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <div class="page-head">
          <h2>Logs</h2>
          <button type="button" @click="showLogs = !showLogs">
            {{ showLogs ? 'Hide logs' : 'View logs' }}
          </button>
        </div>
        <LogViewer v-if="showLogs" :container-id="data.id" />
      </section>
    </template>
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
  margin: 0.25rem 0 0;
  font-size: 1.3rem;
}
.page-head h2 {
  margin: 0;
  font-size: 1.05rem;
}
.page-head button {
  background: transparent;
  border: 1px solid var(--border);
  color: inherit;
  border-radius: 0.4rem;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.back {
  color: var(--muted);
  font-size: 0.85rem;
}
.detail {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 0.5rem 1.5rem;
  margin: 0 0 1.5rem;
}
.detail div {
  display: flex;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 0.4rem 0;
}
.detail dt {
  width: 6.5rem;
  color: var(--muted);
  flex: none;
}
.detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.block {
  margin-bottom: 1.5rem;
}
.block h2 {
  font-size: 1.05rem;
}
.plain {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 0.78rem;
}
.error {
  color: #ff7b72;
}
</style>
