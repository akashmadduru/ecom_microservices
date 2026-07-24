import type { Pagination } from '@/interfaces/pagination'
import type {
  CreateProductPayload,
  Product,
  ProductFilterParams,
  UpdateProductPayload,
} from '@/interfaces/product'
import api from '@/config/axios'
import { buildPagination } from '@/utils/pagination'

export interface ProductsPaginatedResponse {
  products: Product[]
  pagination: Pagination
}

function normalizeProductsPayload(payload: unknown): {
  products: Product[]
  pagination: Pagination
} {
  if (Array.isArray(payload)) {
    return {
      products: payload as Product[],
      pagination: buildPagination(1, 20, (payload as Product[]).length),
    }
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const rawProducts = (data.products ??
      data.items ??
      data.results ??
      data.data ??
      []) as Product[]
    const paginationFromApi = (data.pagination ?? data.meta ?? null) as Partial<Pagination> | null
    const totalItems = Number(paginationFromApi?.total_items ?? rawProducts.length)
    const page = Number(paginationFromApi?.page ?? 1)
    const pageSize = Number(paginationFromApi?.page_size ?? 20)

    return {
      products: rawProducts,
      pagination: buildPagination(
        page,
        pageSize,
        Number.isFinite(totalItems) ? totalItems : rawProducts.length,
      ),
    }
  }

  return {
    products: [],
    pagination: buildPagination(1, 20, 0),
  }
}

export async function getProducts(
  page: number,
  pageSize: number,
  filters: ProductFilterParams = {},
  signal?: AbortSignal,
): Promise<ProductsPaginatedResponse> {
  const response = await api.get('/products', {
    params: {
      page,
      page_size: pageSize,
      category: filters.category || undefined,
      brand: filters.brand || undefined,
      brand_id: filters.brand_id || undefined,
      category_id: filters.category_id || undefined,
      min_price: filters.min_price || undefined,
      max_price: filters.max_price || undefined,
      min_rating: filters.min_rating || undefined,
      sort: filters.sort || undefined,
    },
    signal,
  })

  const normalized = normalizeProductsPayload(response.data)
  const pageNumber = Math.max(1, page)
  const pageSizeNumber = Math.max(1, pageSize)

  return {
    products: normalized.products,
    pagination: {
      ...normalized.pagination,
      page: pageNumber,
      page_size: pageSizeNumber,
      has_previous: pageNumber > 1,
      has_next: pageNumber < normalized.pagination.total_pages,
      previous_page: pageNumber > 1 ? pageNumber - 1 : null,
      next_page: pageNumber < normalized.pagination.total_pages ? pageNumber + 1 : null,
    },
  }
}

export async function getProduct(id: number): Promise<Product> {
  const response = await api.get(`/products/${id}`)
  return response.data as Product
}

export async function createProduct(payload: CreateProductPayload): Promise<Product> {
  const response = await api.post('/products', payload)
  return response.data as Product
}

export async function updateProduct(id: number, payload: UpdateProductPayload): Promise<Product> {
  const response = await api.put(`/products/${id}`, payload)
  return response.data as Product
}

export async function deleteProduct(id: number): Promise<void> {
  await api.delete(`/products/${id}`)
}

export async function seedProducts(): Promise<void> {
  await api.post('/admin/products/seed')
}
