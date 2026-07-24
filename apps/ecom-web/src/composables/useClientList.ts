import { computed, onScopeDispose, readonly, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Pagination } from '@/interfaces/pagination'
import { buildPagination } from '@/utils/pagination'
import type { ListControllerResult, ListSort, ListStatus } from './listController.types'

export interface UseClientListOptions<T> {
  source: Ref<T[]> | (() => T[])
  searchFields?: (keyof T)[] | ((item: T, term: string) => boolean)
  initialPageSize?: number
  initialSort?: ListSort | null
  filterPredicates?: Record<string, (item: T, value: unknown) => boolean>
  debounceMs?: number
  loading?: Ref<boolean>
  error?: Ref<string | null>
  onRefresh?: () => Promise<void> | void
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export function useClientList<T>(options: UseClientListOptions<T>): ListControllerResult<T> {
  const {
    source,
    searchFields,
    initialPageSize = 10,
    initialSort = null,
    filterPredicates = {},
    debounceMs = 200,
    loading,
    error,
    onRefresh,
  } = options

  const sourceItems = computed<T[]>(() =>
    typeof source === 'function' ? source() : source.value,
  )

  const page = ref(1)
  const pageSize = ref(initialPageSize)
  const search = ref('')
  const debouncedSearch = ref('')
  const sort = ref<ListSort | null>(initialSort)
  const filters = ref<Record<string, unknown>>({})

  const loadingRef = loading ?? ref(false)
  const errorRef = error ?? ref<string | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function matchesSearch(item: T, term: string): boolean {
    if (!term) return true
    if (typeof searchFields === 'function') return searchFields(item, term)
    if (Array.isArray(searchFields)) {
      const needle = term.toLowerCase()
      return searchFields.some((field) => {
        const value = item[field]
        if (value === null || value === undefined) return false
        return String(value).toLowerCase().includes(needle)
      })
    }
    return true
  }

  function matchesFilters(item: T): boolean {
    for (const [key, predicate] of Object.entries(filterPredicates)) {
      const value = filters.value[key]
      if (value === undefined || value === null || value === '') continue
      if (!predicate(item, value)) return false
    }
    return true
  }

  const filtered = computed<T[]>(() => {
    const term = debouncedSearch.value.trim()
    let result = sourceItems.value.filter(
      (item) => matchesSearch(item, term) && matchesFilters(item),
    )

    const activeSort = sort.value
    if (activeSort) {
      const { key, direction } = activeSort
      const factor = direction === 'desc' ? -1 : 1
      result = [...result].sort((a, b) => {
        const av = (a as Record<string, unknown>)[key]
        const bv = (b as Record<string, unknown>)[key]
        return compareValues(av, bv) * factor
      })
    }

    return result
  })

  const pagination = computed<Pagination>(() =>
    buildPagination(page.value, pageSize.value, filtered.value.length),
  )

  const items = computed<T[]>(() => {
    const start = (page.value - 1) * pageSize.value
    return filtered.value.slice(start, start + pageSize.value)
  })

  const status = computed<ListStatus>(() => {
    if (errorRef.value) return 'error'
    if (loadingRef.value) return 'loading'
    return filtered.value.length === 0 ? 'empty' : 'success'
  })

  const isEmpty: ComputedRef<boolean> = computed(() => status.value === 'empty')

  function setPage(next: number): void {
    page.value = next
  }

  function setPageSize(size: number): void {
    pageSize.value = size
    page.value = 1
  }

  function setSearch(term: string): void {
    search.value = term
    page.value = 1
    clearTimer()
    debounceTimer = setTimeout(() => {
      debouncedSearch.value = term
    }, debounceMs)
  }

  function setSort(next: ListSort | null): void {
    sort.value = next
  }

  function setFilter(key: string, value: unknown): void {
    filters.value = { ...filters.value, [key]: value }
    page.value = 1
  }

  async function refresh(): Promise<void> {
    if (onRefresh) await onRefresh()
  }

  function reset(): void {
    clearTimer()
    page.value = 1
    pageSize.value = initialPageSize
    search.value = ''
    debouncedSearch.value = ''
    sort.value = initialSort
    filters.value = {}
  }

  onScopeDispose(() => {
    clearTimer()
  })

  return {
    items: items as Readonly<Ref<T[]>>,
    pagination: pagination as Readonly<Ref<Pagination>>,
    page: readonly(page) as Readonly<Ref<number>>,
    pageSize: readonly(pageSize) as Readonly<Ref<number>>,
    search: readonly(search) as Readonly<Ref<string>>,
    sort: readonly(sort) as Readonly<Ref<ListSort | null>>,
    filters: readonly(filters) as Readonly<Ref<Record<string, unknown>>>,
    status: status as Readonly<Ref<ListStatus>>,
    loading: readonly(loadingRef) as Readonly<Ref<boolean>>,
    error: readonly(errorRef) as Readonly<Ref<string | null>>,
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
