<template>
  <div class="grid gap-6" :class="gridClass">
    <div
      v-for="n in count"
      :key="n"
      class="h-64 animate-pulse rounded-[1.4rem] border border-base-300 bg-base-200"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    count?: number
    gridClass?: string
  }>(),
  { count: 6, gridClass: 'md:grid-cols-2 xl:grid-cols-3' },
)
</script>
