<template>
  <div class="space-y-6">
    <PageHeader eyebrow="Admin · Auth service" title="Diagnostics"
      description="Raw diagnostics reported by the auth service admin endpoint." />

    <SkeletonTable v-if="authStore.loading && !diagnostics" :rows="5" />

    <ErrorState v-else-if="loadError" :message="loadError" :on-retry="load" />

    <EmptyState v-else-if="!entries.length" title="No diagnostics data"
      description="The diagnostics endpoint returned no data." />

    <div v-else class="data-panel">
      <table class="table">
        <tbody>
          <tr v-for="[key, value] in entries" :key="key">
            <td class="w-1/3 font-semibold text-base-content">{{ key }}</td>
            <td class="font-mono text-sm">{{ formatValue(value) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { normalizeApiError } from '@/utils/apiError'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import type { AdminDiagnostics } from '@/interfaces/auth'

const authStore = useAuthStore()
const diagnostics = ref<AdminDiagnostics | null>(null)
const loadError = ref<string | null>(null)

const entries = computed(() => Object.entries(diagnostics.value ?? {}))

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function load() {
  loadError.value = null
  try {
    diagnostics.value = await authStore.fetchAdminDiagnostics()
  } catch (err) {
    loadError.value = normalizeApiError(err).message
  }
}

onMounted(load)
</script>
