<script setup lang="ts">
import { computed } from 'vue'
import type { Pagination } from '@/interfaces/pagination'

const props = withDefaults(
  defineProps<{
    pagination: Pagination
    itemLabel?: string
    maxButtons?: number
  }>(),
  { itemLabel: 'items', maxButtons: 5 },
)

const emit = defineEmits<{
  change: [page: number]
}>()

const visiblePages = computed(() => {
  const current = props.pagination.page
  const total = props.pagination.total_pages
  const span = Math.max(1, props.maxButtons)

  let start = Math.max(1, current - Math.floor(span / 2))
  const end = Math.min(total, start + span - 1)

  if (end - start < span - 1) {
    start = Math.max(1, end - (span - 1))
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

function goTo(page: number) {
  if (page >= 1 && page <= props.pagination.total_pages && page !== props.pagination.page) {
    emit('change', page)
  }
}

function previous() {
  if (props.pagination.has_previous && props.pagination.previous_page) {
    emit('change', props.pagination.previous_page)
  }
}

function next() {
  if (props.pagination.has_next && props.pagination.next_page) {
    emit('change', props.pagination.next_page)
  }
}
</script>

<template>
  <div v-if="pagination.total_pages > 1" class="mt-8 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <button class="btn btn-outline btn-sm min-w-24" :disabled="!pagination.has_previous" @click="previous()">
      Previous
    </button>

    <div class="flex flex-wrap items-center justify-center gap-2">
      <button v-for="page in visiblePages" :key="page" @click="goTo(page)"
        class="btn btn-sm h-10 w-10 border border-base-300 transition-all duration-200" :class="page === pagination.page
          ? 'btn-primary text-white'
          : 'btn-ghost text-base-content/80 hover:bg-base-200 hover:text-base-content'">
        {{ page }}
      </button>
    </div>

    <button class="btn btn-outline btn-sm min-w-24" :disabled="!pagination.has_next" @click="next()">
      Next
    </button>
  </div>

  <p class="mt-4 text-center text-sm text-muted">
    Page {{ pagination.page }}
    of {{ pagination.total_pages }}
    • {{ pagination.total_items }} {{ itemLabel }}
  </p>
</template>
