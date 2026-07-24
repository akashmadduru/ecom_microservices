import api from '@/config/axios'
import { buildPagination } from '@/utils/pagination'
import type { Pagination } from '@/interfaces/pagination'
import type {
  AdjustStockPayload,
  BulkUpdatePayload,
  CreateInventoryPayload,
  InventoryHealthReport,
  InventoryRecord,
  InventoryStatus,
  ReleaseStockPayload,
  ReserveStockPayload,
  RestockPayload,
  UpdateInventoryPayload,
} from '@/interfaces/inventory'

export interface InventoryPaginatedResponse {
  items: InventoryRecord[]
  pagination: Pagination
}

function normalizeInventoryListPayload(
  payload: unknown,
  page: number,
  pageSize: number,
): InventoryPaginatedResponse {
  if (Array.isArray(payload)) {
    return {
      items: payload as InventoryRecord[],
      pagination: buildPagination(page, pageSize, payload.length),
    }
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const rawItems = (data.items ?? data.inventory ?? data.results ?? data.data ?? []) as InventoryRecord[]
    const paginationFromApi = (data.pagination ?? data.meta ?? null) as Partial<Pagination> | null
    const totalItems = Number(paginationFromApi?.total_items ?? rawItems.length)

    return {
      items: rawItems,
      pagination: buildPagination(
        Number(paginationFromApi?.page ?? page),
        Number(paginationFromApi?.page_size ?? pageSize),
        Number.isFinite(totalItems) ? totalItems : rawItems.length,
      ),
    }
  }

  return { items: [], pagination: buildPagination(page, pageSize, 0) }
}

function normalizeInventoryArray(payload: unknown): InventoryRecord[] {
  if (Array.isArray(payload)) return payload as InventoryRecord[]
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    return (data.items ?? data.inventory ?? data.results ?? data.data ?? []) as InventoryRecord[]
  }
  return []
}

export async function createInventory(payload: CreateInventoryPayload): Promise<InventoryRecord> {
  const response = await api.post('/inventory', payload)
  return response.data as InventoryRecord
}

export async function getInventoryByProduct(productId: number): Promise<InventoryRecord> {
  const response = await api.get(`/inventory/${productId}`)
  return response.data as InventoryRecord
}

export async function listInventory(
  page: number,
  pageSize: number,
  status?: InventoryStatus | '',
  warehouseLocation?: string,
  signal?: AbortSignal,
): Promise<InventoryPaginatedResponse> {
  const response = await api.get('/inventory', {
    params: {
      page,
      page_size: pageSize,
      status: status || undefined,
      warehouse_location: warehouseLocation || undefined,
    },
    signal,
  })
  return normalizeInventoryListPayload(response.data, page, pageSize)
}

export async function updateInventory(
  productId: number,
  payload: UpdateInventoryPayload,
): Promise<InventoryRecord> {
  const response = await api.put(`/inventory/${productId}`, payload)
  return response.data as InventoryRecord
}

export async function reserveStock(
  productId: number,
  payload: ReserveStockPayload,
): Promise<InventoryRecord> {
  const response = await api.post(`/inventory/${productId}/reserve`, payload)
  return response.data as InventoryRecord
}

export async function releaseStock(
  productId: number,
  payload: ReleaseStockPayload,
): Promise<InventoryRecord> {
  const response = await api.post(`/inventory/${productId}/release`, payload)
  return response.data as InventoryRecord
}

export async function adjustStock(
  productId: number,
  payload: AdjustStockPayload,
): Promise<InventoryRecord> {
  const response = await api.post(`/inventory/${productId}/adjust`, payload)
  return response.data as InventoryRecord
}

export async function restockProduct(
  productId: number,
  payload: RestockPayload,
): Promise<InventoryRecord> {
  const response = await api.post(`/inventory/${productId}/restock`, payload)
  return response.data as InventoryRecord
}

export async function bulkUpdateInventory(payload: BulkUpdatePayload): Promise<void> {
  await api.post('/admin/inventory/bulk-update', payload)
}

export async function getInventoryHealthReport(): Promise<InventoryHealthReport> {
  const response = await api.get('/admin/inventory/health-report')
  return response.data as InventoryHealthReport
}

export async function getLowStockProducts(): Promise<InventoryRecord[]> {
  const response = await api.get('/inventory/reports/low-stock')
  return normalizeInventoryArray(response.data)
}

export async function getOutOfStockProducts(): Promise<InventoryRecord[]> {
  const response = await api.get('/inventory/reports/out-of-stock')
  return normalizeInventoryArray(response.data)
}
