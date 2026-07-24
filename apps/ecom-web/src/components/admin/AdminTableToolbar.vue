<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    searchPlaceholder?: string
    loading?: boolean
  }>(),
  { searchPlaceholder: 'Search', loading: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex flex-1 items-center gap-3">
      <label class="relative flex-1 sm:max-w-xs">
        <input :value="modelValue" type="search" class="input input-bordered w-full"
          :placeholder="searchPlaceholder" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
        <span v-if="loading"
          class="loading loading-spinner loading-sm absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
      </label>
      <slot name="filters" />
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
