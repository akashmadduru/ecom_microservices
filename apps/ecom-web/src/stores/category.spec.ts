import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Category } from '@/interfaces/category'

vi.mock('@/api/CategoriesApi', () => ({
  getCategories: vi.fn<(parentId?: number) => Promise<Category[]>>(),
}))

import { getCategories } from '@/api/CategoriesApi'
import { useCategoryStore } from './category'

const mockedGetCategories = vi.mocked(getCategories)

const categories: Category[] = [
  { id: 1, name: 'Electronics', slug: 'electronics' },
  { id: 2, name: 'Home', slug: 'home' },
]

describe('useCategoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedGetCategories.mockReset()
  })

  it('starts with an empty list and no error', () => {
    const store = useCategoryStore()
    expect(store.categories).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchCategories populates categories and toggles loading around the request', async () => {
    mockedGetCategories.mockResolvedValue(categories)
    const store = useCategoryStore()

    const promise = store.fetchCategories()
    expect(store.loading).toBe(true)

    await promise

    expect(store.categories).toEqual(categories)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error and rethrows when the request fails, leaving categories untouched', async () => {
    mockedGetCategories.mockRejectedValue(new Error('network down'))
    const store = useCategoryStore()

    await expect(store.fetchCategories()).rejects.toThrow('network down')

    expect(store.error).toBe('network down')
    expect(store.loading).toBe(false)
    expect(store.categories).toEqual([])
  })

  it('clears a previous error on a subsequent successful fetch', async () => {
    mockedGetCategories.mockRejectedValueOnce(new Error('boom'))
    const store = useCategoryStore()
    await expect(store.fetchCategories()).rejects.toThrow('boom')
    expect(store.error).toBe('boom')

    mockedGetCategories.mockResolvedValueOnce(categories)
    await store.fetchCategories()

    expect(store.error).toBeNull()
    expect(store.categories).toEqual(categories)
  })
})
