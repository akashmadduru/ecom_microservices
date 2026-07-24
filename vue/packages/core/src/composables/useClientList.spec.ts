import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { EffectScope } from 'vue'
import { useClientList } from './useClientList'

interface Row {
  id: number
  name: string
  brand: string
  price: number
}

const rows: Row[] = [
  { id: 1, name: 'Wireless Headphones', brand: 'SoundMax', price: 120 },
  { id: 2, name: 'Smart Watch', brand: 'FitPro', price: 200 },
  { id: 3, name: 'Audio Speaker', brand: 'SoundMax', price: 80 },
  { id: 4, name: 'Bluetooth Earbuds', brand: 'SoundMax', price: 60 },
]

let scope: EffectScope | null = null

function create(options: Parameters<typeof useClientList<Row>>[0]) {
  scope = effectScope()
  return scope.run(() => useClientList<Row>(options))!
}

afterEach(() => {
  scope?.stop()
  scope = null
  vi.useRealTimers()
})

describe('useClientList', () => {
  it('exposes the full source as a single page by default', () => {
    const c = create({ source: ref(rows), initialPageSize: 10 })
    expect(c.items.value).toHaveLength(4)
    expect(c.status.value).toBe('success')
  })

  it('paginates the source and reports pagination metadata', () => {
    const c = create({ source: ref(rows), initialPageSize: 2 })

    expect(c.items.value.map((r) => r.id)).toEqual([1, 2])
    expect(c.pagination.value.total_pages).toBe(2)
    expect(c.pagination.value.total_items).toBe(4)

    c.setPage(2)
    expect(c.items.value.map((r) => r.id)).toEqual([3, 4])
  })

  it('filters by an array of search field keys (case-insensitive substring)', () => {
    vi.useFakeTimers()
    const c = create({ source: ref(rows), searchFields: ['name', 'brand'], debounceMs: 200 })

    c.setSearch('audio')
    vi.advanceTimersByTime(200)
    expect(c.items.value.map((r) => r.id)).toEqual([3])

    c.setSearch('soundmax')
    vi.advanceTimersByTime(200)
    expect(c.items.value.map((r) => r.id)).toEqual([1, 3, 4])
  })

  it('filters via a custom predicate function when searchFields is a function', () => {
    vi.useFakeTimers()
    const c = create({
      source: ref(rows),
      searchFields: (item, term) => item.price < Number(term),
      debounceMs: 200,
    })

    c.setSearch('100')
    vi.advanceTimersByTime(200)
    expect(c.items.value.map((r) => r.id)).toEqual([3, 4])
  })

  it('applies filterPredicates and ignores empty/undefined filter values', () => {
    const c = create({
      source: ref(rows),
      filterPredicates: { brand: (item, value) => item.brand === value },
    })

    c.setFilter('brand', 'FitPro')
    expect(c.items.value.map((r) => r.id)).toEqual([2])

    // Clearing the filter (empty string) restores the full list.
    c.setFilter('brand', '')
    expect(c.items.value).toHaveLength(4)
  })

  it('sorts ascending and descending by key', () => {
    const c = create({ source: ref(rows), initialPageSize: 10 })

    c.setSort({ key: 'price', direction: 'asc' })
    expect(c.items.value.map((r) => r.price)).toEqual([60, 80, 120, 200])

    c.setSort({ key: 'price', direction: 'desc' })
    expect(c.items.value.map((r) => r.price)).toEqual([200, 120, 80, 60])
  })

  it('resets the page to 1 when searching or filtering', () => {
    const c = create({
      source: ref(rows),
      initialPageSize: 2,
      filterPredicates: { brand: (item, value) => item.brand === value },
    })
    c.setPage(2)
    expect(c.page.value).toBe(2)

    c.setFilter('brand', 'SoundMax')
    expect(c.page.value).toBe(1)
  })

  it('recomputes pagination and items as the source array shrinks (e.g. after a delete)', () => {
    const source = ref([...rows])
    const c = create({ source, initialPageSize: 2 })
    c.setPage(2)
    expect(c.items.value.map((r) => r.id)).toEqual([3, 4])

    // Delete two items — total pages drops from 2 to 1.
    source.value = source.value.filter((r) => r.id <= 2)
    expect(c.pagination.value.total_pages).toBe(1)
    expect(c.pagination.value.total_items).toBe(2)
    // The current page still points at 2 but the slice is now empty; the store
    // consumer would clamp — here we assert the derived data reflects the source.
    expect(c.pagination.value.has_next).toBe(false)
  })

  it('reflects an injected loading ref in status', () => {
    const loading = ref(true)
    const c = create({ source: ref(rows), loading })
    expect(c.status.value).toBe('loading')
    loading.value = false
    expect(c.status.value).toBe('success')
  })

  it('reflects an injected error ref in status, taking priority over loading', () => {
    const error = ref<string | null>('boom')
    const loading = ref(true)
    const c = create({ source: ref(rows), loading, error })
    expect(c.status.value).toBe('error')
  })

  it('reports empty status when the source has no rows', () => {
    const c = create({ source: ref([] as Row[]) })
    expect(c.status.value).toBe('empty')
    expect(c.isEmpty.value).toBe(true)
  })

  it('reset() clears a pending debounce timer so a stale search never lands (regression)', () => {
    vi.useFakeTimers()
    const c = create({ source: ref(rows), searchFields: ['name'], debounceMs: 200 })

    c.setSearch('audio')
    // Reset before the debounce fires. The previously-buggy version left the
    // timer running, so `debouncedSearch` would later be set to 'audio' and the
    // list would filter down unexpectedly after a reset.
    c.reset()
    vi.advanceTimersByTime(500)

    expect(c.search.value).toBe('')
    expect(c.items.value).toHaveLength(4)
  })

  it('accepts a reactive getter function as the source', () => {
    const backing = ref(rows.slice(0, 2))
    const c = create({ source: () => backing.value, initialPageSize: 10 })
    expect(c.items.value).toHaveLength(2)

    backing.value = rows
    expect(c.items.value).toHaveLength(4)
  })
})
