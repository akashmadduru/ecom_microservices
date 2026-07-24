import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Brand, CreateBrandPayload, UpdateBrandPayload } from '@/interfaces/brand'
import {
  createBrand as createBrandRequest,
  deleteBrand as deleteBrandRequest,
  getBrand,
  getBrands,
  updateBrand as updateBrandRequest,
} from '@/api/BrandsApi'
import { normalizeApiError } from '@/utils/apiError'

export const useBrandStore = defineStore('brands', () => {
  const brands = ref<Brand[]>([])
  const selectedBrand = ref<Brand>()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const mutating = ref(false)

  async function fetchBrands() {
    loading.value = true
    error.value = null
    try {
      brands.value = await getBrands()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchBrand(id: number) {
    loading.value = true
    error.value = null
    try {
      selectedBrand.value = await getBrand(id)
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createBrand(payload: CreateBrandPayload): Promise<Brand> {
    mutating.value = true
    error.value = null
    try {
      const created = await createBrandRequest(payload)
      await fetchBrands()
      return created
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function updateBrand(id: number, payload: UpdateBrandPayload): Promise<Brand> {
    mutating.value = true
    error.value = null
    try {
      const updated = await updateBrandRequest(id, payload)
      const index = brands.value.findIndex((brand) => brand.id === id)
      if (index !== -1) brands.value[index] = updated
      if (selectedBrand.value?.id === id) selectedBrand.value = updated
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function deleteBrand(id: number): Promise<void> {
    const previous = brands.value
    brands.value = brands.value.filter((brand) => brand.id !== id)
    mutating.value = true
    error.value = null
    try {
      await deleteBrandRequest(id)
    } catch (err) {
      brands.value = previous
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  return {
    brands,
    selectedBrand,
    loading,
    error,
    mutating,
    fetchBrands,
    fetchBrand,
    createBrand,
    updateBrand,
    deleteBrand,
  }
})
