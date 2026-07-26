<script setup lang="ts">
/**
 * Click/focus-triggered popover for a long string that needs to be truncated
 * in place (table cells, key=value list items) but stay fully readable —
 * and selectable/copyable — on demand. Deliberately click/focus rather than
 * hover: hover popovers vanish before a pointer can reach them, and don't
 * work for keyboard/touch users at all.
 *
 * Opens on click or focus of the trigger, closes on click-outside, Escape,
 * or blur. Positioned with plain CSS (`position: absolute`, anchored to the
 * trigger) — no positioning library, consistent with this app's zero-
 * dependency styling approach.
 */
const props = defineProps<{
  /** Full text shown truncated on the trigger and in full in the panel. */
  text: string
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function show(): void {
  open.value = true
}

function hide(): void {
  open.value = false
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) hide()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') hide()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ hide })
</script>

<template>
  <span ref="root" class="popover">
    <button
      type="button"
      class="popover-trigger"
      :title="props.text"
      @click.stop="show"
      @focus="show"
      @blur="hide"
    >
      <span class="popover-trigger__text">{{ props.text }}</span>
    </button>
    <div v-if="open" class="popover__panel" @click.stop>
      {{ props.text }}
    </div>
  </span>
</template>

<style scoped>
.popover {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.popover-trigger {
  display: block;
  max-width: 100%;
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.popover-trigger__text {
  display: block;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.popover__panel {
  position: absolute;
  z-index: 10;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  max-width: 28rem;
  max-height: 16rem;
  overflow: auto;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.82rem;
}
</style>
