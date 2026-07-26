<script setup lang="ts">
const route = useRoute()
const api = useApiClient()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `dockerfile-${id.value}`,
  () => api.inspectDockerfile(id.value),
  { watch: [id] },
)

/** `.` is the manifest's own shorthand for "repo root". */
function formatBuildContext(buildContext: string): string {
  return buildContext === '.' ? '(repo root)' : buildContext
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <NuxtLink to="/dockerfiles" class="back">← Dockerfiles</NuxtLink>
        <h1 class="mono">{{ data?.label ?? id }}</h1>
      </div>
      <div class="page-head__actions">
        <button type="button" :disabled="pending" @click="refresh()">Refresh</button>
      </div>
    </div>

    <p v-if="error" class="error">Failed to inspect Dockerfile: {{ error.message }}</p>
    <template v-else-if="data">
      <dl class="detail">
        <div><dt>ID</dt><dd class="mono">{{ data.id }}</dd></div>
        <div><dt>Build Context</dt><dd class="mono">{{ formatBuildContext(data.buildContext) }}</dd></div>
        <div><dt>Base Image</dt><dd class="mono">{{ data.baseImage }}</dd></div>
        <div><dt>Stages</dt><dd>{{ data.stageCount }}</dd></div>
        <div><dt>Exposed Ports</dt><dd>{{ data.exposedPorts.join(', ') || '—' }}</dd></div>
        <div><dt>Entrypoint</dt><dd class="mono">{{ data.entrypoint ?? '—' }}</dd></div>
        <div><dt>Cmd</dt><dd class="mono">{{ data.cmd ?? '—' }}</dd></div>
      </dl>

      <section class="block">
        <h2>Stages</h2>
        <ul class="plain">
          <li v-for="(stage, i) in data.stages" :key="i" class="mono">
            {{ i + 1 }}. {{ stage.baseImage }}<span v-if="stage.name"> (as {{ stage.name }})</span>
          </li>
        </ul>
      </section>

      <section class="block">
        <h2>Build Args</h2>
        <p v-if="data.argNames.length === 0" class="muted">None.</p>
        <ul v-else class="plain">
          <li v-for="name in data.argNames" :key="name" class="mono">{{ name }}</li>
        </ul>
      </section>

      <section class="block">
        <h2>Environment Variable Names</h2>
        <p class="muted small">Names only, never values — see this app's existing container-detail precedent.</p>
        <p v-if="data.envNames.length === 0" class="muted">None.</p>
        <ul v-else class="plain">
          <li v-for="name in data.envNames" :key="name" class="mono">{{ name }}</li>
        </ul>
      </section>

      <section class="block">
        <h2>Raw Source</h2>
        <TextPopover :text="data.rawContent" />
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
