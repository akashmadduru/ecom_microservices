import type { Category } from '@/interfaces/category'
import api from '@/config/axios'

function normalizeCategoriesPayload(payload: unknown): Category[] {
  if (Array.isArray(payload)) {
    return payload as Category[]
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const rawCategories = (data.categories ??
      data.items ??
      data.results ??
      data.data ??
      []) as Category[]
    return rawCategories
  }

  return []
}

export async function getCategories(parentId?: number): Promise<Category[]> {
  const response = await api.get('/products/categories', {
    params: { parent_id: parentId ?? undefined },
  })
  return normalizeCategoriesPayload(response.data)
}

export async function getCategory(id: number): Promise<Category> {
  const response = await api.get(`/products/categories/${id}`)
  return response.data as Category
}
