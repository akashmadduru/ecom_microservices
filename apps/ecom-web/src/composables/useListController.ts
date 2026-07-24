import { computed, onScopeDispose, readonly, ref } from 'vue'
import type { Ref } from 'vue'
import type { Pagination } from '@/interfaces/pagination'
import { buildPagination } from '@/utils/pagination'
import { normalizeApiError } from '@/utils/apiError'
import type {
  ListControllerResult,
  ListFetcher,
  ListSort,
  ListStatus,
} from './listController.types'

export interface UseListControllerOptions<T> {
  fetcher: ListFetcher<T>
  initialPageSize?: number
  initialSort?: ListSort | null
  initialFilters?: Record<string, unknown>
  debounceMs?: number
  immediate?: boolean
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown; name?: unknown }).code
    const name = (error as { name?: unknown }).name
    if (code === 'ERR_CANCELED' || name === 'CanceledError' || name === 'AbortError') return true
  }
  return false
}

export function useListController<T>(
  options: UseListControllerOptions<T>,
): ListControllerResult<T> {
  const {
    fetcher,
    initialPageSize = 20,
    initialSort = null,
    initialFilters = {},
    debounceMs = 300,
    immediate = true,
  } = options

  const items = ref<T[]>([]) as Ref<T[]>
  const pagination = ref<Pagination>(buildPagination(1, initialPageSize, 0))
  const page = ref(1)
  const pageSize = ref(initialPageSize)
  const search = ref('')
  const sort = ref<ListSort | null>(initialSort)
  const filters = ref<Record<string, unknown>>({ ...initialFilters })
  const status = ref<ListStatus>('idle')
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isEmpty = computed(() => status.value === 'empty')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let activeController: AbortController | null = null
  let requestId = 0

  function clearTimer() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  async function run(): Promise<void> {
    clearTimer()

    if (activeController) activeController.abort()
    const controller = new AbortController()
    activeController = controller

    const currentId = ++requestId
    status.value = 'loading'
    loading.value = true
    error.value = null

    try {
      const result = await fetcher(
        {
          page: page.value,
          pageSize: pageSize.value,
          search: search.value,
          sort: sort.value,
          filters: filters.value,
        },
        controller.signal,
      )

      if (currentId !== requestId) return

      items.value = result.items
      pagination.value = result.pagination
      status.value = result.items.length === 0 ? 'empty' : 'success'
    } catch (err) {
      if (isAbortError(err)) return
      if (currentId !== requestId) return
      error.value = normalizeApiError(err).message
      status.value = 'error'
    } finally {
      if (currentId === requestId) loading.value = false
    }
  }

  function setPage(next: number): void {
    page.value = next
    void run()
  }

  function setPageSize(size: number): void {
    pageSize.value = size
    page.value = 1
    void run()
  }

  function setSearch(term: string): void {
    search.value = term
    page.value = 1
    clearTimer()
    debounceTimer = setTimeout(() => {
      void run()
    }, debounceMs)
  }

  function setSort(next: ListSort | null): void {
    sort.value = next
    void run()
  }

  function setFilter(key: string, value: unknown): void {
    filters.value = { ...filters.value, [key]: value }
    page.value = 1
    void run()
  }

  async function refresh(): Promise<void> {
    await run()
  }

  function reset(): void {
    page.value = 1
    pageSize.value = initialPageSize
    search.value = ''
    sort.value = initialSort
    filters.value = { ...initialFilters }
    void run()
  }

  onScopeDispose(() => {
    clearTimer()
    if (activeController) activeController.abort()
  })

  if (immediate !== false) {
    void run()
  }

  return {
    items: readonly(items) as Readonly<Ref<T[]>>,
    pagination: readonly(pagination) as Readonly<Ref<Pagination>>,
    page: readonly(page) as Readonly<Ref<number>>,
    pageSize: readonly(pageSize) as Readonly<Ref<number>>,
    search: readonly(search) as Readonly<Ref<string>>,
    sort: readonly(sort) as Readonly<Ref<ListSort | null>>,
    filters: readonly(filters) as Readonly<Ref<Record<string, unknown>>>,
    status: readonly(status) as Readonly<Ref<ListStatus>>,
    loading: readonly(loading) as Readonly<Ref<boolean>>,
    error: readonly(error) as Readonly<Ref<string | null>>,
    isEmpty,
    setPage,
    setPageSize,
    setSearch,
    setSort,
    setFilter,
    refresh,
    reset,
  }
}
