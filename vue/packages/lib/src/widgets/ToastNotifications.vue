<template>
    <div class="toast-shell fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
        <transition-group name="toast" tag="div">
            <div v-for="toast in notificationStore.toasts" :key="toast.id"
                :class="['toast-card max-w-sm rounded-[1.1rem] border p-4 shadow-soft text-left', toastStyle(toast.type)]">
                <div class="flex items-start justify-between gap-3">
                    <div class="space-y-1">
                        <p class="text-sm font-semibold">{{ toast.title || capitalizeType(toast.type) }}</p>
                        <p class="text-sm text-base-content/80">{{ toast.message }}</p>
                    </div>
                    <button class="btn btn-ghost btn-xs text-muted"
                        @click="notificationStore.removeToast(toast.id)">×</button>
                </div>
            </div>
        </transition-group>
    </div>
</template>

<script setup lang="ts">
// Deviation (Phase 1, flagged): ToastNotifications is functionally coupled to
// the notification store — it isn't purely presentational like the rest of
// `lib`. This is a known, temporary exception to the "lib only imports types
// from core" rule; a future improvement is to decouple it (e.g. props/emit or
// a lib-local toast bus that core adapts to) so the layering holds without
// exception.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- see note above
import { useNotificationStore } from 'core/stores/notification'

const notificationStore = useNotificationStore()

function toastStyle(type: 'success' | 'info' | 'warning' | 'error') {
    switch (type) {
        case 'success':
            return 'border-success/30 bg-success/10'
        case 'info':
            return 'border-info/30 bg-info/10'
        case 'warning':
            return 'border-warning/30 bg-warning/10'
        case 'error':
            return 'border-error/30 bg-error/10'
        default:
            return 'border-base-300 bg-base-200'
    }
}

function capitalizeType(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}
</script>
