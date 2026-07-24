import type { ComputedRef, Ref } from 'vue'
import type { Pagination } from '@/interfaces/pagination'

export type SortDirection = 'asc' | 'desc'

export interface ListSort {
  key: string
  direction: SortDirection
}

export interface ListQuery {
  page: number
  pageSize: number
  search: string
  sort: ListSort | null
  filters: Record<string, unknown>
}

export interface ListPageResult<T> {
  items: T[]
  pagination: Pagination
}

export type ListFetcher<T> = (query: ListQuery, signal?: AbortSignal) => Promise<ListPageResult<T>>

export type ListStatus = 'idle' | 'loading' | 'success' | 'error' | 'empty'

export interface ListControllerResult<T> {
  items: Readonly<Ref<T[]>>
  pagination: Readonly<Ref<Pagination>>
  page: Readonly<Ref<number>>
  pageSize: Readonly<Ref<number>>
  search: Readonly<Ref<string>>
  sort: Readonly<Ref<ListSort | null>>
  filters: Readonly<Ref<Record<string, unknown>>>
  status: Readonly<Ref<ListStatus>>
  loading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  isEmpty: ComputedRef<boolean>
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSearch: (term: string) => void
  setSort: (sort: ListSort | null) => void
  setFilter: (key: string, value: unknown) => void
  refresh: () => Promise<void>
  reset: () => void
}
