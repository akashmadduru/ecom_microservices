export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

export interface InventoryRecord {
  id: number
  product_id: number
  sku: string
  warehouse_location: string
  available_quantity: number
  reserved_quantity?: number
  safety_stock: number
  reorder_threshold: number
  status?: InventoryStatus
  version: number
  created_at?: string
  updated_at?: string
}

export interface CreateInventoryPayload {
  product_id: number
  sku: string
  warehouse_location: string
  available_quantity: number
  safety_stock: number
  reorder_threshold: number
}

export interface UpdateInventoryPayload {
  sku?: string
  reorder_threshold?: number
  safety_stock?: number
  warehouse_location?: string
  version: number
}

export interface ReserveStockPayload {
  order_id: string
  quantity: number
}

export interface ReleaseStockPayload {
  order_id: string
}

export interface AdjustStockPayload {
  delta: number
  reason: string
}

export interface RestockPayload {
  quantity: number
}

export interface BulkUpdateItem {
  product_id: number
  reorder_threshold?: number
  safety_stock?: number
  warehouse_location?: string
}

export interface BulkUpdatePayload {
  items: BulkUpdateItem[]
}

export type InventoryHealthReport = Record<string, unknown>
