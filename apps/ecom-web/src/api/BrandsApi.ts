import type { Brand, CreateBrandPayload, UpdateBrandPayload } from '@/interfaces/brand'
import api from '@/config/axios'

function normalizeBrandsPayload(payload: unknown): Brand[] {
  if (Array.isArray(payload)) {
    return payload as Brand[]
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const rawBrands = (data.brands ?? data.items ?? data.results ?? data.data ?? []) as Brand[]
    return rawBrands
  }

  return []
}

export async function getBrands(): Promise<Brand[]> {
  const response = await api.get('/products/brands')
  return normalizeBrandsPayload(response.data)
}

export async function getBrand(id: number): Promise<Brand> {
  const response = await api.get(`/products/brands/${id}`)
  return response.data as Brand
}

export async function createBrand(payload: CreateBrandPayload): Promise<Brand> {
  const response = await api.post('/admin/products/brands', payload)
  return response.data as Brand
}

export async function updateBrand(id: number, payload: UpdateBrandPayload): Promise<Brand> {
  const response = await api.put(`/admin/products/brands/${id}`, payload)
  return response.data as Brand
}

export async function deleteBrand(id: number): Promise<void> {
  await api.delete(`/admin/products/brands/${id}`)
}
