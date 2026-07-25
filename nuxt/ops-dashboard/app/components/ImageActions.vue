<script setup lang="ts">
/**
 * Gated Remove control for a single image.
 *
 * Renders ONLY when BOTH hold, mirroring the server-side gate in
 * `resource-mutation-guard.ts`'s `runImageRemoval` exactly (so we never show
 * a button that would just 403):
 *   - resource mutations are globally enabled (`allowed` from
 *     /api/resource-mutations-config), AND
 *   - the image has ZERO currently-listed containers referencing it
 *     (`containerCount === 0`).
 * Images have no Compose-label identity to allowlist against the way
 * volumes/networks do (an image can back zero or many containers), so there
 * is no managed-list to check here — this is a deliberate difference from
 * `VolumeActions`/`NetworkActions`, not an inconsistency.
 * When mutations are globally disabled OR the image is still referenced, the
 * control is ABSENT (not disabled), matching `ContainerActions.vue`'s own
 * rationale for the same choice.
 */
const props = defineProps<{
  imageId: string
  containerCount: number
}>()

// Emitted after a successful removal so the parent can refresh its data.
const emit = defineEmits<{ done: [] }>()

const api = useApiClient()

// Shared key: every instance on a page dedupes to a single config request.
const { data: config } = useAsyncData('resource-mutations-config', () =>
  api.getResourceMutationsConfig(),
)

const eligible = computed(
  () => config.value?.allowed === true && props.containerCount === 0,
)

const busy = ref(false)
const actionError = ref('')

async function remove(): Promise<void> {
  if (busy.value) return
  if (!window.confirm(`Remove image "${props.imageId}"? This cannot be undone.`)) return

  busy.value = true
  actionError.value = ''
  try {
    await api.removeImage(props.imageId)
    emit('done')
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Failed to remove image.'
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
