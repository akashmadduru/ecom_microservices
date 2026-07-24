<script setup lang="ts">
/**
 * Gated Stop/Start/Restart controls for a single container.
 *
 * Controls render ONLY when ALL of these hold, mirroring the server-side gate
 * exactly (so we never show a button that would just 403):
 *   - mutations are globally enabled (`allowed` from /api/mutations-config), AND
 *   - the container is compose-managed, AND
 *   - its service is on the returned `managedServices` allowlist.
 * When mutations are globally disabled the controls are ABSENT (not disabled),
 * so the UI never implies a capability that isn't there.
 *
 * A native confirm() guards every action — this is an internal tool, so a
 * minimal, dependency-free confirmation is the right amount of ceremony.
 */
const props = defineProps<{
  containerId: string
  service: string | null
  managed: boolean
}>()

// Emitted after a successful action so the parent can refresh its data and
// reflect the container's new state.
const emit = defineEmits<{ done: [] }>()

const api = useApiClient()

// Shared key: every instance on a page (e.g. one per list row) dedupes to a
// single config request. Intentionally NOT awaited — this is a nested (child)
// component, and a top-level await would make it an async component needing its
// own Suspense boundary. `config` starts null and populates reactively, so the
// controls simply stay hidden until the config resolves.
const { data: config } = useAsyncData('mutations-config', () =>
  api.getMutationsConfig(),
)

const eligible = computed(
  () =>
    config.value?.allowed === true
    && props.managed
    && props.service !== null
    && config.value.managedServices.includes(props.service),
)

type Action = 'stop' | 'start' | 'restart'

const busy = ref(false)
const actionError = ref('')

async function run(action: Action): Promise<void> {
  if (busy.value) return
  const label = props.service ?? props.containerId
  if (!window.confirm(`${action} container "${label}"?`)) return

  busy.value = true
  actionError.value = ''
  try {
    if (action === 'stop') await api.stopContainer(props.containerId)
    else if (action === 'start') await api.startContainer(props.containerId)
    else await api.restartContainer(props.containerId)
    emit('done')
  } catch (err) {
    actionError.value
      = err instanceof Error ? err.message : `Failed to ${action} container.`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="eligible" class="actions" @click.stop>
    <button type="button" :disabled="busy" @click="run('start')">Start</button>
    <button type="button" :disabled="busy" @click="run('stop')">Stop</button>
    <button type="button" :disabled="busy" @click="run('restart')">Restart</button>
    <span v-if="actionError" class="actions__error">{{ actionError }}</span>
  </div>
</template>

<style scoped>
.actions {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.actions button {
  background: transparent;
  border: 1px solid var(--border);
  color: inherit;
  border-radius: 0.4rem;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.actions__error {
  color: #ff7b72;
  font-size: 0.78rem;
}
</style>
