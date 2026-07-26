<script setup lang="ts">
/**
 * Gated Remove control for a single volume.
 *
 * Renders ONLY when BOTH hold, mirroring the server-side gate exactly:
 *   - resource mutations are globally enabled (`allowed` from
 *     /api/resource-mutations-config), AND
 *   - `name` is on the returned `managedVolumes` allowlist.
 *
 * NOTE on client/server matching: the server-side gate
 * (`runVolumeRemoval` in `resource-mutation-guard.ts`) actually checks the
 * volume's `com.docker.compose.volume` LABEL value against
 * `OPS_MANAGED_VOLUMES`, re-derived from a fresh inspect — not the volume
 * `name` directly. This client-side mirror compares `name` instead (a Docker
 * volume name and its compose-volume label value are the same string for the
 * common case of an operator naming `OPS_MANAGED_VOLUMES` after the volume
 * itself), which keeps the frontend simple and label-fetch-free. A
 * project-prefixed volume name that differs from its own compose-volume label
 * value is the one edge case where this client-side check and the
 * server-side truth could disagree — in EITHER direction, the server-side
 * gate is what actually decides, so at worst this shows (or hides) a button
 * that the server would then correctly allow (or 403) once clicked.
 * When mutations are globally disabled or the volume isn't allowlisted, the
 * control is ABSENT (not disabled), matching `ContainerActions.vue`.
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
  () => config.value?.allowed === true && config.value.managedVolumes.includes(props.name),
)

const busy = ref(false)
const actionError = ref('')

async function remove(): Promise<void> {
  if (busy.value) return
  if (!window.confirm(`Remove volume "${props.name}"? This cannot be undone.`)) return

  busy.value = true
  actionError.value = ''
  try {
    await api.removeVolume(props.id)
    emit('done')
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to remove volume.'
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

