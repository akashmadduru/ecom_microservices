import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { effectScope } from 'vue'
import type { EffectScope } from 'vue'
import { useListController } from './useListController'
import type { ListFetcher, ListPageResult } from './listController.types'
import { buildPagination } from '@/utils/pagination'

interface Row {
  id: number
  name: string
}

function pageOf(items: Row[]): ListPageResult<Row> {
  return { items, pagination: buildPagination(1, 20, items.length) }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Track the active scope so each controller is created inside a real effect
// scope (giving onScopeDispose a home and allowing deterministic cleanup).
let scope: EffectScope | null = null

function createController(options: Parameters<typeof useListController<Row>>[0]) {
  scope = effectScope()
  return scope.run(() => useListController<Row>(options))!
}

afterEach(() => {
  scope?.stop()
  scope = null
  vi.useRealTimers()
})

describe('useListController', () => {
  it('fetches immediately on creation with page 1', async () => {
    const fetcher = vi.fn<ListFetcher<Row>>().mockResolvedValue(pageOf([{ id: 1, name: 'a' }]))
    const c = createController({ fetcher })

    await flushPromises()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0].page).toBe(1)
    expect(c.items.value).toEqual([{ id: 1, name: 'a' }])
    expect(c.status.value).toBe('success')
    expect(c.loading.value).toBe(false)
  })

  it('reports empty status when the fetcher returns no items', async () => {
    const fetcher = vi.fn<ListFetcher<Row>>().mockResolvedValue(pageOf([]))
    const c = createController({ fetcher })

    await flushPromises()

    expect(c.status.value).toBe('empty')
    expect(c.isEmpty.value).toBe(true)
  })

  it('debounces search and resets the page to 1 immediately', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<ListFetcher<Row>>().mockResolvedValue(pageOf([]))
    const c = createController({ fetcher, immediate: false, debounceMs: 300 })

    c.setPage(3)
    await flushPromises()
    expect(c.page.value).toBe(3)
    fetcher.mockClear()

    c.setSearch('phone')
    // Page resets synchronously; the fetch itself is deferred.
    expect(c.page.value).toBe(1)
    expect(fetcher).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(fetcher).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0].search).toBe('phone')
    expect(fetcher.mock.calls[0]![0].page).toBe(1)
  })

  it('collapses rapid successive keystrokes into a single fetch', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<ListFetcher<Row>>().mockResolvedValue(pageOf([]))
    const c = createController({ fetcher, immediate: false, debounceMs: 300 })

    c.setSearch('a')
    c.setSearch('ab')
    c.setSearch('abc')
    vi.advanceTimersByTime(300)
    await flushPromises()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0].search).toBe('abc')
  })

  it('fetches immediately (no debounce) for page, filter and sort changes', async () => {
    const fetcher = vi.fn<ListFetcher<Row>>().mockResolvedValue(pageOf([]))
    const c = createController({ fetcher, immediate: false })

    c.setPage(2)
    c.setFilter('brand', 'Acme')
    c.setSort({ key: 'name', direction: 'asc' })
    await flushPromises()

    expect(fetcher).toHaveBeenCalledTimes(3)
    // setFilter resets page to 1
    expect(c.page.value).toBe(1)
    expect(c.filters.value).toEqual({ brand: 'Acme' })
  })

  it('ignores a slow earlier response so it cannot overwrite a newer one (staleness guard)', async () => {
    const deferreds: Deferred<ListPageResult<Row>>[] = []
    const fetcher = vi.fn<ListFetcher<Row>>(() => {
      const d = deferred<ListPageResult<Row>>()
      deferreds.push(d)
      return d.promise
    })
    const c = createController({ fetcher, immediate: false })

    void c.refresh() // request #1 (slow)
    void c.refresh() // request #2 (fast) — supersedes #1

    // Newer request resolves first.
    deferreds[1]!.resolve(pageOf([{ id: 2, name: 'newer' }]))
    await flushPromises()
    expect(c.items.value).toEqual([{ id: 2, name: 'newer' }])

    // Older request resolves later and must be discarded.
    deferreds[0]!.resolve(pageOf([{ id: 1, name: 'stale' }]))
    await flushPromises()
    expect(c.items.value).toEqual([{ id: 2, name: 'newer' }])
  })

  it('keeps loading=true when a stale request settles while a newer one is in flight', async () => {
    const deferreds: Deferred<ListPageResult<Row>>[] = []
    const fetcher = vi.fn<ListFetcher<Row>>(() => {
      const d = deferred<ListPageResult<Row>>()
      deferreds.push(d)
      return d.promise
    })
    const c = createController({ fetcher, immediate: false })

    void c.refresh() // #1
    void c.refresh() // #2
    expect(c.loading.value).toBe(true)

    // Resolving the stale #1 must NOT clear loading — #2 is still pending.
    deferreds[0]!.resolve(pageOf([{ id: 1, name: 'stale' }]))
    await flushPromises()
    expect(c.loading.value).toBe(true)

    // Resolving the latest #2 clears loading.
    deferreds[1]!.resolve(pageOf([{ id: 2, name: 'newer' }]))
    await flushPromises()
    expect(c.loading.value).toBe(false)
  })

  it('sets status="error" and an error message for a real (non-abort) failure', async () => {
    const fetcher = vi.fn<ListFetcher<Row>>().mockRejectedValue(new Error('kaboom'))
    const c = createController({ fetcher, immediate: false })

    await c.refresh()

    expect(c.status.value).toBe('error')
    expect(c.error.value).toBe('kaboom')
    expect(c.loading.value).toBe(false)
  })

  it('swallows abort/cancel errors silently without flipping to error status', async () => {
    const fetcher = vi
      .fn<ListFetcher<Row>>()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const c = createController({ fetcher, immediate: false })

    await c.refresh()

    expect(c.status.value).not.toBe('error')
    expect(c.error.value).toBeNull()
  })

  it('also swallows axios-style CanceledError', async () => {
    const canceled = Object.assign(new Error('canceled'), {
      name: 'CanceledError',
      code: 'ERR_CANCELED',
    })
    const fetcher = vi.fn<ListFetcher<Row>>().mockRejectedValue(canceled)
    const c = createController({ fetcher, immediate: false })

    await c.refresh()

    expect(c.status.value).not.toBe('error')
    expect(c.error.value).toBeNull()
  })

  it('aborts the previous in-flight request when a new one starts', async () => {
    const signals: AbortSignal[] = []
    const deferreds: Deferred<ListPageResult<Row>>[] = []
    const fetcher = vi.fn<ListFetcher<Row>>((_query, signal) => {
      if (signal) signals.push(signal)
      const d = deferred<ListPageResult<Row>>()
      deferreds.push(d)
      return d.promise
    })
    const c = createController({ fetcher, immediate: false })

    void c.refresh()
    expect(signals[0]!.aborted).toBe(false)

    void c.refresh()
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
  })

  it('reset() restores initial page size, search, sort and filters, then refetches', async () => {
    const fetcher = vi.fn<ListFetcher<Row>>().mockResolvedValue(pageOf([]))
    const c = createController({
      fetcher,
      immediate: false,
      initialPageSize: 20,
      initialSort: { key: 'id', direction: 'asc' },
    })

    c.setPageSize(50)
    c.setSort({ key: 'name', direction: 'desc' })
    c.setFilter('brand', 'Acme')
    await flushPromises()
    fetcher.mockClear()

    c.reset()
    await flushPromises()

    expect(c.pageSize.value).toBe(20)
    expect(c.page.value).toBe(1)
    expect(c.sort.value).toEqual({ key: 'id', direction: 'asc' })
    expect(c.filters.value).toEqual({})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
