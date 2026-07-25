<script setup lang="ts">
/**
 * Gated Remove control for a single network.
 *
 * Renders ONLY when BOTH hold, mirroring the server-side gate exactly:
 *   - resource mutations are globally enabled (`allowed` from
 *     /api/resource-mutations-config), AND
 *   - `name` is on the returned `managedNetworks` allowlist.
 *
 * See `VolumeActions.vue`'s doc comment for the same client/server matching
 * caveat: the server-side gate (`runNetworkRemoval`) checks the network's
 * `com.docker.compose.network` LABEL value, re-derived from a fresh inspect,
 * not `name` directly — this client-side check is a same-string-in-the-common-
 * case approximation, and the server-side gate is the actual authority either
 * way a mismatch could occur.
 */
const props = defineProps<{
  id: string
  name: string
}>()

const emit = defineEmits<{ done: [] }>()

const api = useApiClient()

const { data: config } = useAsyncData('resource-mutations-config', () =>
  api.getResourceMutationsConfig(),
)

const eligible = computed(
  () => config.value?.allowed === true && config.value.managedNetworks.includes(props.name),
)

const busy = ref(false)
const actionError = ref('')

async function remove(): Promise<void> {
  if (busy.value) return
  if (!window.confirm(`Remove network "${props.name}"? This cannot be undone.`)) return

  busy.value = true
  actionError.value = ''
  try {
    await api.removeNetwork(props.id)
    emit('done')
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to remove network.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="eligible" class="actions" @click.stop>
    <button type="button" :disabled="busy" @click="remove">Remove</button>
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
