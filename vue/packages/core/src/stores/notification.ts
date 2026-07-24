import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ToastMessage {
  id: number
  title?: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
}

export const useNotificationStore = defineStore('notification', () => {
  const toasts = ref<ToastMessage[]>([])

  function showToast(message: string, type: ToastMessage['type'] = 'success', title?: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    toasts.value.unshift({ id, title, message, type })
    window.setTimeout(() => removeToast(id), 3200)
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return {
    toasts,
    showToast,
    removeToast,
  }
})
