<script setup lang="ts">
const route = useRoute()
const api = useApiClient()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `volume-${id.value}`,
  () => api.getVolume(id.value),
  { watch: [id] },
)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <NuxtLink to="/volumes" class="back">← Volumes</NuxtLink>
        <h1>{{ data?.name ?? id }}</h1>
      </div>
      <div class="page-head__actions">
        <VolumeActions v-if="data" :id="data.id" :name="data.name" @done="refresh()" />
        <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
      </div>
    </div>

    <p v-if="error" class="error">Failed to inspect volume: {{ error.message }}</p>
    <template v-else-if="data">
      <dl class="detail">
        <div><dt>ID</dt><dd class="mono">{{ data.id }}</dd></div>
        <div><dt>Driver</dt><dd>{{ data.driver }}</dd></div>
        <div><dt>Scope</dt><dd>{{ data.scope }}</dd></div>
        <div><dt>Mountpoint</dt><dd class="mono">{{ data.mountpoint || '—' }}</dd></div>
        <div><dt>Created</dt><dd>{{ formatDate(data.createdAt) }}</dd></div>
      </dl>

      <section class="block">
        <h2>Labels</h2>
        <ul v-if="Object.keys(data.labels).length" class="plain">
          <li v-for="(value, key) in data.labels" :key="key" class="mono">
            <TextPopover :text="`${key}=${value}`" />
          </li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <h2>Options</h2>
        <ul v-if="Object.keys(data.options).length" class="plain">
          <li v-for="(value, key) in data.options" :key="key" class="mono">
            <TextPopover :text="`${key}=${value}`" />
          </li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <h2>Status</h2>
        <p v-if="data.status === null" class="muted small">
          Not available in this runtime mode (a PersistentVolumeClaim has no equivalent free-form status map).
        </p>
        <ul v-else-if="Object.keys(data.status).length" class="plain">
          <li v-for="(value, key) in data.status" :key="key" class="mono">
            <TextPopover :text="`${key}=${value}`" />
          </li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page-head h1 {
  margin: 0.25rem 0 0;
  font-size: 1.3rem;
}
.page-head h2 {
  margin: 0;
  font-size: 1.05rem;
}
.page-head__actions {
  align-items: center;
}
.back {
  color: var(--muted);
  font-size: 0.85rem;
}
.block {
  margin-bottom: 1.5rem;
}
.block h2 {
  font-size: 1.05rem;
}
</style>
