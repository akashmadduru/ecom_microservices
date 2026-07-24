import { ref } from 'vue'
import type { Ref } from 'vue'
import { useEcommerceStore } from '@/stores/ecommerce'

export interface UseConfirmActionOptions<T> {
  perform: (row: T) => Promise<void>
  label: (row: T) => string
  onSuccess?: (row: T) => void | Promise<void>
  successMessage?: (label: string) => string
  errorMessage?: (label: string) => string
}

export interface UseConfirmActionResult<T> {
  pendingDelete: Ref<T | null>
  confirmOpen: Ref<boolean>
  deleting: Ref<boolean>
  ask: (row: T) => void
  cancel: () => void
  confirm: () => Promise<void>
}

/**
 * Shared confirm-then-delete flow for the admin list pages. Owns the pending
 * row, dialog open state, and in-flight flag, and routes success/error toasts
 * through the ecommerce store so every page behaves identically.
 */
export function useConfirmAction<T>(
  options: UseConfirmActionOptions<T>,
): UseConfirmActionResult<T> {
  const ecommerceStore = useEcommerceStore()

  const pendingDelete = ref<T | null>(null) as Ref<T | null>
  const confirmOpen = ref(false)
  const deleting = ref(false)

  function ask(row: T): void {
    pendingDelete.value = row
    confirmOpen.value = true
  }

  function cancel(): void {
    if (deleting.value) return
    confirmOpen.value = false
    pendingDelete.value = null
  }

  async function confirm(): Promise<void> {
    const row = pendingDelete.value
    if (!row) return
    const label = options.label(row)
    deleting.value = true
    try {
      await options.perform(row)
      ecommerceStore.showToast(
        options.successMessage?.(label) ?? `Deleted ${label}.`,
        'success',
      )
      await options.onSuccess?.(row)
      confirmOpen.value = false
      pendingDelete.value = null
    } catch {
      ecommerceStore.showToast(
        options.errorMessage?.(label) ?? `Failed to delete ${label}.`,
        'error',
      )
    } finally {
      deleting.value = false
    }
  }

  return { pendingDelete, confirmOpen, deleting, ask, cancel, confirm }
}
