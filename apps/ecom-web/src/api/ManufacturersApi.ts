import type {
  CreateManufacturerPayload,
  Manufacturer,
  UpdateManufacturerPayload,
} from '@/interfaces/manufacturer'
import api from '@/config/axios'

function normalizeManufacturersPayload(payload: unknown): Manufacturer[] {
  if (Array.isArray(payload)) {
    return payload as Manufacturer[]
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const rawManufacturers = (data.manufacturers ??
      data.items ??
      data.results ??
      data.data ??
      []) as Manufacturer[]
    return rawManufacturers
  }

  return []
}

export async function getManufacturers(): Promise<Manufacturer[]> {
  const response = await api.get('/products/manufacturers')
  return normalizeManufacturersPayload(response.data)
}

export async function getManufacturer(id: number): Promise<Manufacturer> {
  const response = await api.get(`/products/manufacturers/${id}`)
  return response.data as Manufacturer
}

export async function createManufacturer(
  payload: CreateManufacturerPayload,
): Promise<Manufacturer> {
  const response = await api.post('/admin/products/manufacturers', payload)
  return response.data as Manufacturer
}

export async function updateManufacturer(
  id: number,
  payload: UpdateManufacturerPayload,
): Promise<Manufacturer> {
  const response = await api.put(`/admin/products/manufacturers/${id}`, payload)
  return response.data as Manufacturer
}

export async function deleteManufacturer(id: number): Promise<void> {
  await api.delete(`/admin/products/manufacturers/${id}`)
}
