import { ref } from 'vue'
import { defineStore } from 'pinia'
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
import {
  adjustStock as adjustStockRequest,
  bulkUpdateInventory as bulkUpdateInventoryRequest,
  createInventory as createInventoryRequest,
  getInventoryByProduct,
  getInventoryHealthReport,
  getLowStockProducts,
  getOutOfStockProducts,
  listInventory,
  releaseStock as releaseStockRequest,
  reserveStock as reserveStockRequest,
  restockProduct as restockProductRequest,
  updateInventory as updateInventoryRequest,
} from '@/api/InventoryApi'
import { normalizeApiError } from '@/utils/apiError'

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref<InventoryRecord[]>([])
  const selected = ref<InventoryRecord>()
  const statusFilter = ref<InventoryStatus | ''>('')

  const loading = ref(false)
  const mutating = ref(false)
  const error = ref<string | null>(null)

  const lowStock = ref<InventoryRecord[]>([])
  const outOfStock = ref<InventoryRecord[]>([])
  const healthReport = ref<InventoryHealthReport | null>(null)
  const reportsLoading = ref(false)

  const pagination = ref<Pagination>({
    page: 1,
    page_size: 20,
    total_items: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
    previous_page: null,
    next_page: null,
  })

  async function fetchList(page = pagination.value.page) {
    loading.value = true
    error.value = null
    try {
      const response = await listInventory(page, pagination.value.page_size, statusFilter.value)
      items.value = response.items
      pagination.value = response.pagination
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function setStatusFilter(status: InventoryStatus | '') {
    statusFilter.value = status
    await fetchList(1)
  }

  async function fetchByProduct(productId: number) {
    loading.value = true
    error.value = null
    try {
      selected.value = await getInventoryByProduct(productId)
      return selected.value
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  function upsertLocal(record: InventoryRecord) {
    const index = items.value.findIndex((item) => item.product_id === record.product_id)
    if (index !== -1) items.value[index] = record
    if (selected.value?.product_id === record.product_id) selected.value = record
  }

  async function createInventory(payload: CreateInventoryPayload): Promise<InventoryRecord> {
    mutating.value = true
    error.value = null
    try {
      const created = await createInventoryRequest(payload)
      await fetchList(1)
      return created
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function updateInventory(
    productId: number,
    payload: UpdateInventoryPayload,
  ): Promise<InventoryRecord> {
    mutating.value = true
    error.value = null
    try {
      const updated = await updateInventoryRequest(productId, payload)
      upsertLocal(updated)
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function reserveStock(
    productId: number,
    payload: ReserveStockPayload,
  ): Promise<InventoryRecord> {
    mutating.value = true
    error.value = null
    const previous = selected.value
    if (selected.value?.product_id === productId) {
      selected.value = {
        ...selected.value,
        available_quantity: selected.value.available_quantity - payload.quantity,
      }
    }
    try {
      const updated = await reserveStockRequest(productId, payload)
      upsertLocal(updated)
      return updated
    } catch (err) {
      selected.value = previous
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function releaseStock(
    productId: number,
    payload: ReleaseStockPayload,
  ): Promise<InventoryRecord> {
    mutating.value = true
    error.value = null
    try {
      const updated = await releaseStockRequest(productId, payload)
      upsertLocal(updated)
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function adjustStock(
    productId: number,
    payload: AdjustStockPayload,
  ): Promise<InventoryRecord> {
    mutating.value = true
    error.value = null
    try {
      const updated = await adjustStockRequest(productId, payload)
      upsertLocal(updated)
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function restockProduct(
    productId: number,
    payload: RestockPayload,
  ): Promise<InventoryRecord> {
    mutating.value = true
    error.value = null
    try {
      const updated = await restockProductRequest(productId, payload)
      upsertLocal(updated)
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function bulkUpdate(payload: BulkUpdatePayload): Promise<void> {
    mutating.value = true
    error.value = null
    try {
      await bulkUpdateInventoryRequest(payload)
      await fetchList()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function fetchReports() {
    reportsLoading.value = true
    error.value = null
    try {
      const [low, out] = await Promise.all([getLowStockProducts(), getOutOfStockProducts()])
      lowStock.value = low
      outOfStock.value = out
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      reportsLoading.value = false
    }
  }

  async function fetchHealthReport() {
    reportsLoading.value = true
    error.value = null
    try {
      healthReport.value = await getInventoryHealthReport()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      reportsLoading.value = false
    }
  }

  function next() {
    if (pagination.value.has_next && pagination.value.next_page) fetchList(pagination.value.next_page)
  }

  function previous() {
    if (pagination.value.has_previous && pagination.value.previous_page)
      fetchList(pagination.value.previous_page)
  }

  function goTo(page: number) {
    if (page >= 1 && page <= pagination.value.total_pages && page !== pagination.value.page) {
      fetchList(page)
    }
  }

  return {
    items,
    selected,
    statusFilter,
    loading,
    mutating,
    error,
    pagination,
    lowStock,
    outOfStock,
    healthReport,
    reportsLoading,
    fetchList,
    setStatusFilter,
    fetchByProduct,
    createInventory,
    updateInventory,
    reserveStock,
    releaseStock,
    adjustStock,
    restockProduct,
    bulkUpdate,
    fetchReports,
    fetchHealthReport,
    next,
    previous,
    goTo,
  }
})
