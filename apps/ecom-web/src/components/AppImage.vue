<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IMAGE_PLACEHOLDER, resolveImageUrl } from '@/utils/image'

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    fallback?: string
    imgClass?: string
    raw?: boolean
  }>(),
  { alt: '', fallback: IMAGE_PLACEHOLDER, raw: true },
)

const errored = ref(false)

watch(
  () => props.src,
  () => {
    errored.value = false
  },
)

const resolvedSrc = computed(() => {
  if (errored.value) return props.fallback
  if (props.raw) return resolveImageUrl(props.src, props.fallback)
  return props.src || props.fallback
})

function onError() {
  if (errored.value) return
  errored.value = true
}
</script>

<template>
  <img :src="resolvedSrc" :alt="alt" :class="imgClass" @error="onError" />
</template>
