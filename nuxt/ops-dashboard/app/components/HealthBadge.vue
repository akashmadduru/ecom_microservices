<script setup lang="ts">
import type { HealthState } from '~~/server/runtime/types'

const props = defineProps<{ health: HealthState }>()

const label = computed(() => {
  switch (props.health) {
    case 'healthy':
      return 'healthy'
    case 'unhealthy':
      return 'unhealthy'
    case 'starting':
      return 'starting'
    default:
      return 'no check'
  }
})
</script>

<template>
  <span class="badge" :class="`badge--${props.health}`">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid transparent;
}
.badge--healthy {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 15%, transparent);
  background: color-mix(in srgb, var(--success) 13%, transparent);
}
.badge--unhealthy {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 13%, transparent);
}
.badge--starting {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 13%, transparent);
}
.badge--none {
  color: var(--muted);
  background: color-mix(in srgb, var(--muted) 13%, transparent);
}
</style>
