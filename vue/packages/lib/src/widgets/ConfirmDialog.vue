<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    tone?: 'danger' | 'default'
    loading?: boolean
  }>(),
  {
    title: undefined,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    tone: 'default',
    loading: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:open': [value: boolean]
}>()

const dialogEl = ref<HTMLDialogElement | null>(null)
const cancelBtn = ref<HTMLButtonElement | null>(null)

const uid = useId()
const titleId = `confirm-dialog-title-${uid}`
const descId = `confirm-dialog-desc-${uid}`

watch(
  () => props.open,
  async (open) => {
    const el = dialogEl.value
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
      // Cancel is the safest default focus target for a destructive action.
      await nextTick()
      cancelBtn.value?.focus()
    } else if (el.open) {
      el.close()
    }
  },
)

function onCancel() {
  if (props.loading) return
  emit('cancel')
  emit('update:open', false)
}

// Native `cancel` fires on Escape. Prevent the browser's own close so the
// parent's `open` state stays the single source of truth (the watcher above
// closes the dialog once the parent flips `open` to false).
function onNativeCancel(event: Event) {
  event.preventDefault()
  onCancel()
}
</script>

<template>
  <dialog ref="dialogEl" class="modal" :class="{ 'modal-open': open }" role="dialog" aria-modal="true"
    :aria-labelledby="title ? titleId : undefined" :aria-describedby="descId" @cancel="onNativeCancel">
    <div class="modal-box border border-base-300 bg-base-100">
      <h3 v-if="title" :id="titleId" class="text-lg font-semibold">{{ title }}</h3>
      <p :id="descId" class="py-4 text-base-content/80">{{ message }}</p>
      <div class="modal-action">
        <button ref="cancelBtn" class="btn btn-ghost" :disabled="loading" @click="onCancel">
          {{ cancelText }}
        </button>
        <button class="btn" :class="tone === 'danger' ? 'btn-error' : 'btn-primary'" :disabled="loading"
          @click="emit('confirm')">
          <span v-if="loading" class="loading loading-spinner loading-sm" />
          {{ confirmText }}
        </button>
      </div>
    </div>
    <button type="button" class="modal-backdrop" aria-label="Close" :disabled="loading" @click="onCancel" />
  </dialog>
</template>
