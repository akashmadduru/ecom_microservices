<template>
  <fieldset class="m-0 min-w-0 border-0 p-0 space-y-1">
    <legend class="sr-only">Rating</legend>

    <label class="flex cursor-pointer items-center gap-2">
      <input type="radio" name="rating-filter" class="radio radio-sm radio-primary" :checked="modelValue === null"
        @change="selectRating(null)" />
      <span>All ratings</span>
    </label>

    <label class="flex cursor-pointer items-center gap-2">
      <input type="radio" name="rating-filter" class="radio radio-sm radio-primary" :checked="modelValue === 2"
        @change="selectRating(2)" />
      <span>2 Stars & Up</span>
    </label>

    <label class="flex cursor-pointer items-center gap-2">
      <input type="radio" name="rating-filter" class="radio radio-sm radio-primary" :checked="modelValue === 3"
        @change="selectRating(3)" />
      <span>3 Stars & Up</span>
    </label>

    <label class="flex cursor-pointer items-center gap-2">
      <input type="radio" name="rating-filter" class="radio radio-sm radio-primary" :checked="modelValue === 4"
        @change="selectRating(4)" />
      <span>4 Stars & Up</span>
    </label>

    <label class="flex cursor-pointer items-center gap-2">
      <input type="radio" name="rating-filter" class="radio radio-sm radio-primary" :checked="modelValue === 5"
        @change="selectRating(5)" />
      <span>5 Stars</span>
    </label>
  </fieldset>
</template>

<script setup lang="ts">
defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

function selectRating(value: number | null) {
  emit('update:modelValue', value)
}
</script>
