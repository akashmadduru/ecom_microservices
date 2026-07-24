import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CreateTagPayload, Tag, UpdateTagPayload } from '@/interfaces/tag'
import {
  createTag as createTagRequest,
  deleteTag as deleteTagRequest,
  getTag,
  getTags,
  updateTag as updateTagRequest,
} from '@/api/TagsApi'
import { normalizeApiError } from '@/utils/apiError'

export const useTagStore = defineStore('tags', () => {
  const tags = ref<Tag[]>([])
  const selectedTag = ref<Tag>()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const mutating = ref(false)

  async function fetchTags() {
    loading.value = true
    error.value = null
    try {
      tags.value = await getTags()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchTag(id: number) {
    loading.value = true
    error.value = null
    try {
      selectedTag.value = await getTag(id)
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createTag(payload: CreateTagPayload): Promise<Tag> {
    mutating.value = true
    error.value = null
    try {
      const created = await createTagRequest(payload)
      await fetchTags()
      return created
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function updateTag(id: number, payload: UpdateTagPayload): Promise<Tag> {
    mutating.value = true
    error.value = null
    try {
      const updated = await updateTagRequest(id, payload)
      const index = tags.value.findIndex((tag) => tag.id === id)
      if (index !== -1) tags.value[index] = updated
      if (selectedTag.value?.id === id) selectedTag.value = updated
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function deleteTag(id: number): Promise<void> {
    const previous = tags.value
    tags.value = tags.value.filter((tag) => tag.id !== id)
    mutating.value = true
    error.value = null
    try {
      await deleteTagRequest(id)
    } catch (err) {
      tags.value = previous
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  return {
    tags,
    selectedTag,
    loading,
    error,
    mutating,
    fetchTags,
    fetchTag,
    createTag,
    updateTag,
    deleteTag,
  }
})
