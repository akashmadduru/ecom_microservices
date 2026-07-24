import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Category } from '@/interfaces/category'
import { getCategories } from '@/api/CategoriesApi'
import { normalizeApiError } from '@/utils/apiError'

export const useCategoryStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const childrenByParentId = ref<Record<number, Category[]>>({})
  const childrenLoading = ref<Record<number, boolean>>({})

  async function fetchCategories() {
    loading.value = true
    error.value = null
    try {
      categories.value = await getCategories()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchChildren(parentId: number, force = false): Promise<Category[]> {
    if (!force && childrenByParentId.value[parentId]) {
      return childrenByParentId.value[parentId]
    }
    childrenLoading.value[parentId] = true
    error.value = null
    try {
      const children = await getCategories(parentId)
      childrenByParentId.value[parentId] = children
      return children
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      childrenLoading.value[parentId] = false
    }
  }

  function isChildrenLoading(parentId: number): boolean {
    return childrenLoading.value[parentId] === true
  }

  function getChildren(parentId: number): Category[] | undefined {
    return childrenByParentId.value[parentId]
  }

  function findCategoryById(id: number): Category | undefined {
    const topLevel = categories.value.find((c) => c.id === id)
    if (topLevel) return topLevel
    for (const bucket of Object.values(childrenByParentId.value)) {
      const match = bucket.find((c) => c.id === id)
      if (match) return match
    }
    return undefined
  }

  return {
    categories,
    loading,
    error,
    childrenByParentId,
    childrenLoading,
    fetchCategories,
    fetchChildren,
    isChildrenLoading,
    getChildren,
    findCategoryById,
  }
})
