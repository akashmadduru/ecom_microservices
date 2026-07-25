<script setup lang="ts">
const route = useRoute()
const api = useApiClient()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `network-${id.value}`,
  () => api.getNetwork(id.value),
  { watch: [id] },
)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <NuxtLink to="/networks" class="back">← Networks</NuxtLink>
        <h1>{{ data?.name ?? id }}</h1>
      </div>
      <div class="page-head__actions">
        <NetworkActions v-if="data" :id="data.id" :name="data.name" @done="refresh()" />
        <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
      </div>
    </div>

    <p v-if="error" class="error">Failed to inspect network: {{ error.message }}</p>
    <template v-else-if="data">
      <dl class="detail">
        <div><dt>ID</dt><dd class="mono">{{ data.id }}</dd></div>
        <div><dt>Driver</dt><dd>{{ data.driver }}</dd></div>
        <div><dt>Scope</dt><dd>{{ data.scope }}</dd></div>
        <div><dt>Internal</dt><dd>{{ data.internal ? 'yes' : 'no' }}</dd></div>
        <div><dt>Attachable</dt><dd>{{ data.attachable ? 'yes' : 'no' }}</dd></div>
        <div><dt>Subnets</dt><dd>{{ data.ipamSubnets.join(', ') || '—' }}</dd></div>
        <div><dt>Created</dt><dd>{{ data.createdAt ?? '—' }}</dd></div>
      </dl>

      <section class="block">
        <h2>Options</h2>
        <ul v-if="Object.keys(data.options).length" class="plain">
          <li v-for="(value, key) in data.options" :key="key" class="mono">{{ key }}={{ value }}</li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <h2>Attached containers</h2>
        <ul v-if="data.containerDetails.length" class="plain">
          <li v-for="c in data.containerDetails" :key="c.id" class="mono">
            {{ c.name }}
            <span v-if="c.ipv4Address || c.ipv6Address"> — {{ c.ipv4Address ?? c.ipv6Address }}</span>
          </li>
        </ul>
        <p v-else class="muted">No containers attached.</p>
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
.page-head__actions {
  display: flex;
  align-items: center;
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
.error {
  color: #ff7b72;
}
</style>
