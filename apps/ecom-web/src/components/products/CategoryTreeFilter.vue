<template>
  <fieldset class="m-0 min-w-0 border-0 p-0 space-y-1">
    <legend class="sr-only">Category</legend>

    <label class="flex cursor-pointer items-center gap-2">
      <input type="radio" name="category-filter" class="radio radio-sm radio-primary" :checked="modelValue === null"
        @change="selectCategory(null)" />
      <span>All categories</span>
    </label>

    <div v-for="category in categoryStore.categories" :key="category.id">
      <div class="flex items-center gap-1">
        <button type="button" class="btn btn-ghost btn-xs px-1"
          :aria-label="expanded.has(category.id) ? `Collapse ${category.name}` : `Expand ${category.name}`"
          :aria-expanded="expanded.has(category.id)" :aria-controls="`category-children-${category.id}`"
          @click="toggleExpanded(category.id)">
          {{ expanded.has(category.id) ? '▾' : '▸' }}
        </button>
        <label class="flex flex-1 cursor-pointer items-center gap-2">
          <input type="radio" name="category-filter" class="radio radio-xs radio-primary"
            :checked="modelValue === category.id" @change="selectCategory(category.id)" />
          <span>{{ category.name }}</span>
        </label>
      </div>

      <div v-if="expanded.has(category.id)" :id="`category-children-${category.id}`" class="ml-6 mt-1 space-y-1">
        <span v-if="categoryStore.isChildrenLoading(category.id)" class="loading loading-spinner loading-xs" />
        <div v-else-if="childrenFailed.has(category.id)" class="flex items-center gap-2 text-sm text-error">
          <span>Couldn't load subcategories.</span>
          <button type="button" class="link" @click="toggleExpanded(category.id, true)">Retry</button>
        </div>
        <label v-for="child in categoryStore.getChildren(category.id)" :key="child.id"
          class="flex cursor-pointer items-center gap-2">
          <input type="radio" name="category-filter" class="radio radio-sm radio-primary"
            :checked="modelValue === child.id" @change="selectCategory(child.id)" />
          <span>{{ child.name }}</span>
        </label>
      </div>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useCategoryStore } from '@/stores/category'

defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const categoryStore = useCategoryStore()
const expanded = ref<Set<number>>(new Set())
const childrenFailed = ref<Set<number>>(new Set())

function selectCategory(id: number | null) {
  emit('update:modelValue', id)
}

function toggleExpanded(id: number, retry = false) {
  if (!retry) {
    if (expanded.value.has(id)) {
      expanded.value.delete(id)
      return
    }
    expanded.value.add(id)
  }

  if (retry || !categoryStore.getChildren(id)) {
    childrenFailed.value.delete(id)
    categoryStore.fetchChildren(id, retry).catch(() => {
      childrenFailed.value.add(id)
    })
  }
}

onMounted(() => {
  if (categoryStore.categories.length === 0) void categoryStore.fetchCategories()
})
</script>
