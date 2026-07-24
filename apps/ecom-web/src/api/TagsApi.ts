import type { CreateTagPayload, Tag, UpdateTagPayload } from '@/interfaces/tag'
import api from '@/config/axios'

function normalizeTagsPayload(payload: unknown): Tag[] {
  if (Array.isArray(payload)) {
    return payload as Tag[]
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const rawTags = (data.tags ?? data.items ?? data.results ?? data.data ?? []) as Tag[]
    return rawTags
  }

  return []
}

export async function getTags(): Promise<Tag[]> {
  const response = await api.get('/products/tags')
  return normalizeTagsPayload(response.data)
}

export async function getTag(id: number): Promise<Tag> {
  const response = await api.get(`/products/tags/${id}`)
  return response.data as Tag
}

export async function createTag(payload: CreateTagPayload): Promise<Tag> {
  const response = await api.post('/admin/products/tags', payload)
  return response.data as Tag
}

export async function updateTag(id: number, payload: UpdateTagPayload): Promise<Tag> {
  const response = await api.put(`/admin/products/tags/${id}`, payload)
  return response.data as Tag
}

export async function deleteTag(id: number): Promise<void> {
  await api.delete(`/admin/products/tags/${id}`)
}
