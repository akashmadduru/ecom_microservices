<script setup lang="ts">
const route = useRoute()
const api = useApiClient()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `image-${id.value}`,
  () => api.inspectImage(id.value),
  { watch: [id] },
)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <NuxtLink to="/images" class="back">← Images</NuxtLink>
        <h1 class="mono">{{ data?.repoTags.join(', ') || id }}</h1>
      </div>
      <div class="page-head__actions">
        <ImageActions
          v-if="data"
          :image-id="data.id"
          :container-count="data.containerCount"
          @done="refresh()"
        />
        <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
      </div>
    </div>

    <p v-if="error" class="error">Failed to inspect image: {{ error.message }}</p>
    <template v-else-if="data">
      <dl class="detail">
        <div><dt>ID</dt><dd class="mono">{{ data.id }}</dd></div>
        <div><dt>Tags</dt><dd>{{ data.repoTags.join(', ') || '(dangling)' }}</dd></div>
        <div><dt>Size</dt><dd>{{ data.size ?? '—' }}</dd></div>
        <div><dt>Created</dt><dd>{{ data.createdAt ?? '—' }}</dd></div>
        <div><dt>Dangling</dt><dd>{{ data.dangling ? 'yes' : 'no' }}</dd></div>
        <div><dt>Containers</dt><dd>{{ data.containerCount }}</dd></div>
      </dl>

      <section class="block">
        <h2>Labels</h2>
        <ul v-if="Object.keys(data.labels).length" class="plain">
          <li v-for="(value, key) in data.labels" :key="key" class="mono">{{ key }}={{ value }}</li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <h2>Layers</h2>
        <p v-if="data.layers === null" class="muted small">
          Not available in this runtime mode (no Kubernetes API surfaces per-image layer data).
        </p>
        <ul v-else-if="data.layers.length" class="plain">
          <li v-for="l in data.layers" :key="l" class="mono">{{ l }}</li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <h2>History</h2>
        <p v-if="data.history === null" class="muted small">
          Not available in this runtime mode (no `docker history` equivalent for a bare image reference).
        </p>
        <ul v-else-if="data.history.length" class="plain">
          <li v-for="(h, i) in data.history" :key="i" class="mono">
            {{ h.id ?? '(no id)' }} — {{ h.createdBy }} ({{ h.size }} bytes)
          </li>
        </ul>
        <p v-else class="muted">None.</p>
      </section>

      <section class="block">
        <h2>Referenced by</h2>
        <ul v-if="data.referencedBy.length" class="plain">
          <li v-for="ref in data.referencedBy" :key="ref.containerId" class="mono">
            {{ ref.containerName }} ({{ ref.service ?? 'unmanaged' }})
          </li>
        </ul>
        <p v-else class="muted">No containers currently reference this image.</p>
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
.small {
  font-size: 0.78rem;
}
.error {
  color: #ff7b72;
}
</style>
