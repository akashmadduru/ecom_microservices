import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CreateManufacturerPayload,
  Manufacturer,
  UpdateManufacturerPayload,
} from '@/interfaces/manufacturer'
import {
  createManufacturer as createManufacturerRequest,
  deleteManufacturer as deleteManufacturerRequest,
  getManufacturer,
  getManufacturers,
  updateManufacturer as updateManufacturerRequest,
} from '@/api/ManufacturersApi'
import { normalizeApiError } from '@/utils/apiError'

export const useManufacturerStore = defineStore('manufacturers', () => {
  const manufacturers = ref<Manufacturer[]>([])
  const selectedManufacturer = ref<Manufacturer>()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const mutating = ref(false)

  async function fetchManufacturers() {
    loading.value = true
    error.value = null
    try {
      manufacturers.value = await getManufacturers()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchManufacturer(id: number) {
    loading.value = true
    error.value = null
    try {
      selectedManufacturer.value = await getManufacturer(id)
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createManufacturer(payload: CreateManufacturerPayload): Promise<Manufacturer> {
    mutating.value = true
    error.value = null
    try {
      const created = await createManufacturerRequest(payload)
      await fetchManufacturers()
      return created
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function updateManufacturer(
    id: number,
    payload: UpdateManufacturerPayload,
  ): Promise<Manufacturer> {
    mutating.value = true
    error.value = null
    try {
      const updated = await updateManufacturerRequest(id, payload)
      const index = manufacturers.value.findIndex((manufacturer) => manufacturer.id === id)
      if (index !== -1) manufacturers.value[index] = updated
      if (selectedManufacturer.value?.id === id) selectedManufacturer.value = updated
      return updated
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  async function deleteManufacturer(id: number): Promise<void> {
    const previous = manufacturers.value
    manufacturers.value = manufacturers.value.filter((manufacturer) => manufacturer.id !== id)
    mutating.value = true
    error.value = null
    try {
      await deleteManufacturerRequest(id)
    } catch (err) {
      manufacturers.value = previous
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      mutating.value = false
    }
  }

  return {
    manufacturers,
    selectedManufacturer,
    loading,
    error,
    mutating,
    fetchManufacturers,
    fetchManufacturer,
    createManufacturer,
    updateManufacturer,
    deleteManufacturer,
  }
})
