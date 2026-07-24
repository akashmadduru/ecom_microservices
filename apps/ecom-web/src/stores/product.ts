import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CreateProductPayload, Product, UpdateProductPayload } from '@/interfaces/product'
import type { Pagination } from '@/interfaces/pagination'
import {
  createProduct as createProductRequest,
  deleteProduct as deleteProductRequest,
  getProduct,
  getProducts,
  seedProducts as seedProductsRequest,
  updateProduct as updateProductRequest,
} from '@/api/ProductsApi'
import { normalizeApiError } from '@/utils/apiError'
import { resolveImageUrls } from '@/utils/image'

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const selectedProduct = ref<Product>()
  const selectedProductImageList = ref<string[]>([])

  const loading = ref(false)
  const error = ref<string | null>(null)
  const mutating = ref(false)

  const pagination = ref<Pagination>({
    page: 1,
    page_size: 10,
    total_items: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
    previous_page: null,
    next_page: null,
  })

  async function fetchProduct(id: number) {
    loading.value = true
    error.value = null
    try {
      const response = await getProduct(id)
      selectedProduct.value = response
      selectedProductImageList.value = resolveImageUrls(response.image_urls)
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchProducts(page = pagination.value.page) {
    loading.value = true
    error.value = null
    try {
      const response = await getProducts(page, pagination.value.page_size)
      products.value = response.products
      pagination.value = response.pagination
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createProduct(payload: CreateProductPayload): Promise<Product> {
    mutating.value = true
    error.value = null
    try {
      const created = await createProductRequest(payload)
      await fetchProducts(1)
      return created
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function updateProduct(id: number, payload: UpdateProductPayload): Promise<Product> {
    mutating.value = true
    error.value = null
    try {
      const updated = await updateProductRequest(id, payload)
      const index = products.value.findIndex((product) => product.id === id)
      if (index !== -1) products.value[index] = updated
      if (selectedProduct.value?.id === id) selectedProduct.value = updated
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function deleteProduct(id: number): Promise<void> {
    const previous = products.value
    products.value = products.value.filter((product) => product.id !== id)
    mutating.value = true
    error.value = null
    try {
      await deleteProductRequest(id)
    } catch (err) {
      products.value = previous
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function seedProducts(): Promise<void> {
    mutating.value = true
    error.value = null
    try {
      await seedProductsRequest()
      await fetchProducts(1)
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  function next() {
    if (pagination.value.has_next && pagination.value.next_page) {
      fetchProducts(pagination.value.next_page)
    }
  }

  function previous() {
    if (pagination.value.has_previous && pagination.value.previous_page) {
      fetchProducts(pagination.value.previous_page)
    }
  }

  function goTo(page: number) {
    if (page >= 1 && page <= pagination.value.total_pages && page !== pagination.value.page) {
      fetchProducts(page)
    }
  }

  function setPageSize(size: number) {
    pagination.value.page_size = size
    fetchProducts(1)
  }

  function refresh() {
    fetchProducts()
  }

  return {
    products,
    loading,
    error,
    mutating,
    pagination,
    selectedProduct,
    selectedProductImageList,
    fetchProduct,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    seedProducts,
    next,
    previous,
    goTo,
    refresh,
    setPageSize,
  }
})
