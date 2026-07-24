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
  color: #7ee787;
  border-color: #2ea04326;
  background: #2ea04322;
}
.badge--unhealthy {
  color: #ff7b72;
  background: #f8514922;
}
.badge--starting {
  color: #e3b341;
  background: #bb800922;
}
.badge--none {
  color: #9aa4b2;
  background: #6e768122;
}
</style>
