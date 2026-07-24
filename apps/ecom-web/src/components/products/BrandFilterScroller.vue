<template>
  <div class="space-y-2">
    <input v-model="searchTerm" type="search" class="input input-bordered w-full" placeholder="Search brands"
      aria-label="Search brands" />

    <fieldset class="m-0 min-w-0 max-h-64 border-0 p-0 space-y-1 overflow-y-auto">
      <legend class="sr-only">Brand</legend>

      <span v-if="brandStore.loading && brandStore.brands.length === 0"
        class="loading loading-spinner loading-sm" />

      <template  v-else>
        <label class="flex cursor-pointer items-center gap-2 px-2">
          <input type="radio" name="brand-filter" class="radio radio-sm radio-primary" :checked="modelValue === null"
            @change="selectBrand(null)" />
          <span>All brands</span>
        </label>

        <label  v-for="brand in filteredBrands" :key="brand.id" class="flex cursor-pointer items-center gap-2 px-2">
          <input type="radio" name="brand-filter" class="radio radio-sm radio-primary"
            :checked="modelValue === brand.id" @change="selectBrand(brand.id)" />
          <span>{{ brand.name }}</span>
        </label>

        <p v-if="filteredBrands.length === 0 && searchTerm.trim() !== ''" class="text-sm text-muted">
          No brands match '{{ searchTerm.trim() }}'
        </p>
      </template>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBrandStore } from '@/stores/brand'

defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const brandStore = useBrandStore()
const searchTerm = ref('')

const filteredBrands = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (term === '') return brandStore.brands
  return brandStore.brands.filter((brand) => brand.name.toLowerCase().includes(term))
})

function selectBrand(id: number | null) {
  emit('update:modelValue', id)
}

onMounted(() => {
  if (brandStore.brands.length === 0) void brandStore.fetchBrands()
})
</script>
