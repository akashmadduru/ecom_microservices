<template>
  <div class="surface-card surface-card-centered">
    <h2 class="text-2xl font-semibold text-base-content">{{ title }}</h2>
    <p class="mt-2 text-muted">{{ description }}</p>
    <router-link v-if="actionTo && actionText" class="btn btn-primary mt-6" :to="actionTo">
      {{ actionText }}
    </router-link>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  actionText?: string
  actionTo?: string
}>()
</script>
