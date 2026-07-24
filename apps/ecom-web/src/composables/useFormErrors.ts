import { ref } from 'vue'
import { normalizeApiError } from '@/utils/apiError'
import { validate } from '@/utils/validators'
import type { ValidationSchema } from '@/utils/validators'
import type { ApiError } from '@/interfaces/api'

export function useFormErrors() {
  const fieldErrors = ref<Record<string, string[]>>({})
  const formError = ref<string | null>(null)
  const clientErrors = ref<Record<string, string[]>>({})

  function setFromError(err: unknown): ApiError {
    const apiError = normalizeApiError(err)
    formError.value = apiError.message
    fieldErrors.value = apiError.fieldErrors
    return apiError
  }

  function clear(): void {
    formError.value = null
    fieldErrors.value = {}
    clientErrors.value = {}
  }

  function clearClient(): void {
    clientErrors.value = {}
  }

  function validateForm<T extends object>(
    form: T,
    schema: ValidationSchema<T>,
  ): boolean {
    const result = validate(form, schema)
    clientErrors.value = result.errors
    return result.valid
  }

  function fieldError(field: string): string | undefined {
    return clientErrors.value[field]?.[0] ?? fieldErrors.value[field]?.[0]
  }

  return {
    fieldErrors,
    formError,
    clientErrors,
    setFromError,
    clear,
    clearClient,
    validateForm,
    fieldError,
  }
}
