import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mount } from '@vue/test-utils'
import DataTable from './DataTable.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonTable from '@/components/SkeletonTable.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import { buildPagination } from '@/utils/pagination'
import type { ListControllerResult, ListStatus } from '@/composables/listController.types'
import type { DataTableColumn } from './dataTable.types'

interface Row {
  id: number
  name: string
}

function makeController(over: {
  status?: ListStatus
  items?: Row[]
  error?: string | null
  totalItems?: number
  refresh?: () => Promise<void>
}): ListControllerResult<Row> {
  const items = ref<Row[]>(over.items ?? [])
  const totalItems = over.totalItems ?? items.value.length
  const status = ref<ListStatus>(over.status ?? 'success')
  return {
    items,
    pagination: ref(buildPagination(1, 10, totalItems)),
    page: ref(1),
    pageSize: ref(10),
    search: ref(''),
    sort: ref(null),
    filters: ref({}),
    status,
    loading: ref(status.value === 'loading'),
    error: ref(over.error ?? null),
    isEmpty: computed(() => status.value === 'empty'),
    setPage: vi.fn<(page: number) => void>(),
    setPageSize: vi.fn<(size: number) => void>(),
    setSearch: vi.fn<(term: string) => void>(),
    setSort: vi.fn<(sort: null) => void>(),
    setFilter: vi.fn<(key: string, value: unknown) => void>(),
    refresh: over.refresh ?? vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    reset: vi.fn<() => void>(),
  } as unknown as ListControllerResult<Row>
}

const columns: DataTableColumn<Row>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
]

function mountTable(controller: ListControllerResult<Row>) {
  return mount(DataTable<Row>, { props: { controller, columns } })
}

describe('DataTable', () => {
  it('renders the skeleton while loading with no items yet', () => {
    const wrapper = mountTable(makeController({ status: 'loading', items: [] }))
    expect(wrapper.findComponent(SkeletonTable).exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('renders the error state with a retry wired to controller.refresh', async () => {
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const wrapper = mountTable(makeController({ status: 'error', error: 'Boom', refresh }))

    const errorState = wrapper.findComponent(ErrorState)
    expect(errorState.exists()).toBe(true)
    expect(errorState.text()).toContain('Boom')

    await errorState.find('button').trigger('click')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state when status is empty', () => {
    const wrapper = mountTable(makeController({ status: 'empty', items: [] }))
    expect(wrapper.findComponent(EmptyState).exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('renders a table row per item on success', () => {
    const wrapper = mountTable(
      makeController({
        status: 'success',
        items: [
          { id: 1, name: 'Alpha' },
          { id: 2, name: 'Beta' },
        ],
      }),
    )
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Alpha')
    expect(rows[1]!.text()).toContain('Beta')
  })

  it('renders pagination only when there is more than one page', () => {
    const single = mountTable(
      makeController({ status: 'success', items: [{ id: 1, name: 'A' }], totalItems: 1 }),
    )
    expect(single.findComponent(PaginationComponent).find('button').exists()).toBe(false)

    const many = mountTable(
      makeController({ status: 'success', items: [{ id: 1, name: 'A' }], totalItems: 25 }),
    )
    // total_pages = 3 -> pagination nav buttons render
    expect(many.findComponent(PaginationComponent).findAll('button').length).toBeGreaterThan(0)
  })

  it('has no sort controls in the header (dead sort code was removed)', () => {
    const wrapper = mountTable(
      makeController({ status: 'success', items: [{ id: 1, name: 'A' }] }),
    )
    expect(wrapper.find('thead button').exists()).toBe(false)
    expect(wrapper.find('thead [aria-sort]').exists()).toBe(false)
  })
})
