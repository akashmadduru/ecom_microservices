<template>
  <div class="surface-card surface-card-centered border-error/30 bg-error/10">
    <h2 class="text-2xl font-semibold text-base-content">{{ title }}</h2>
    <p class="mt-2 text-muted">{{ message }}</p>
    <button v-if="onRetry" class="btn btn-outline mt-6" @click="onRetry">Try again</button>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    message: string
    onRetry?: () => void
  }>(),
  { title: 'Something went wrong' },
)
</script>
