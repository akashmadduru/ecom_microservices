import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import type { Product, ProductFilterParams } from '@/interfaces/product'
import { buildPagination } from '@/utils/pagination'
import type { ProductsPaginatedResponse } from '@/api/ProductsApi'

vi.mock('@/api/ProductsApi', () => ({
  getProducts:
    vi.fn<
      (
        page: number,
        pageSize: number,
        filters?: ProductFilterParams,
        signal?: AbortSignal,
      ) => Promise<ProductsPaginatedResponse>
    >(),
}))

import { getProducts } from '@/api/ProductsApi'
import ProductsPage from './ProductsPage.vue'
import CategoryTreeFilter from '@/components/products/CategoryTreeFilter.vue'
import { useCategoryStore } from '@/stores/category'
import { useBrandStore } from '@/stores/brand'

const mockedGetProducts = vi.mocked(getProducts)

function emptyPage() {
  return { products: [] as Product[], pagination: buildPagination(1, 12, 0) }
}

// The fetcher inside ProductsPage.vue builds a ProductFilterParams object from
// the controller's filters; this pulls out just that argument from a given
// getProducts call for readable assertions.
function paramsFromCall(callIndex: number): ProductFilterParams {
  return mockedGetProducts.mock.calls[callIndex]![2] as ProductFilterParams
}

// Component-level errors (e.g. an exception thrown inside an inline event
// handler) are swallowed by Vue's default dev error path unless an
// app.config.errorHandler is registered — in which case Vue routes the error
// there instead of rethrowing into the test runner. We register one on every
// mount so a thrown handler doesn't blow up unrelated assertions, and so the
// regression tests below can assert on what was actually thrown.
function mountPage(caughtErrors: unknown[] = []) {
  return mount(ProductsPage, {
    global: {
      config: { errorHandler: (err: unknown) => caughtErrors.push(err) },
      stubs: {
        ProductCard: true,
        PaginationComponent: true,
        SkeletonGrid: true,
        EmptyState: true,
        ErrorState: true,
        PageHeader: true,
      },
    },
  })
}

async function mountAndFlush(caughtErrors: unknown[] = []) {
  const wrapper = mountPage(caughtErrors)
  await flushPromises()
  return wrapper
}

// CategoryTreeFilter/BrandFilterScroller render "All ..." as the first radio
// row, followed by one radio per store entry in array order (no nodes are
// expanded in these tests, so no child-category radios are rendered).
function categoryRadios(wrapper: Awaited<ReturnType<typeof mountAndFlush>>) {
  return wrapper.findAll('input[name="category-filter"]')
}

function brandRadios(wrapper: Awaited<ReturnType<typeof mountAndFlush>>) {
  return wrapper.findAll('input[name="brand-filter"]')
}

function sortSelect(wrapper: Awaited<ReturnType<typeof mountAndFlush>>) {
  return wrapper.get('select')
}

function priceInputs(wrapper: Awaited<ReturnType<typeof mountAndFlush>>) {
  const all = wrapper.findAll('input[type="range"]')
  return { min: all[0]!, max: all[1]! }
}

describe('ProductsPage filter -> ProductFilterParams mapping', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedGetProducts.mockReset()
    mockedGetProducts.mockResolvedValue(emptyPage())

    // Pre-populate the stores so onMounted's `if (!store.x.length)` guard skips
    // real fetchCategories()/fetchBrands() network calls entirely (both in
    // ProductsPage.vue itself and in CategoryTreeFilter/BrandFilterScroller,
    // which run the same guard against the same store state).
    const categoryStore = useCategoryStore()
    categoryStore.categories = [
      { id: 10, name: 'Electronics', slug: 'electronics' },
      { id: 20, name: 'Home', slug: 'home' },
    ]
    const brandStore = useBrandStore()
    brandStore.brands = [
      { id: 100, name: 'Acme', slug: 'acme', is_active: true },
      { id: 200, name: 'Globex', slug: 'globex', is_active: true },
    ]
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches on mount with all filters undefined', async () => {
    await mountAndFlush()

    expect(mockedGetProducts).toHaveBeenCalledTimes(1)
    expect(mockedGetProducts.mock.calls[0]![0]).toBe(1)
    expect(mockedGetProducts.mock.calls[0]![1]).toBe(12)
    expect(paramsFromCall(0)).toEqual({
      category_id: undefined,
      brand_id: undefined,
      min_price: undefined,
      max_price: undefined,
      sort: undefined,
    })
  })

  it('maps a selected category to category_id as a number', async () => {
    const wrapper = await mountAndFlush()
    mockedGetProducts.mockClear()

    // radios[0] = "All categories", radios[1] = category id 10 (Electronics)
    await categoryRadios(wrapper)[1]!.setValue()
    await flushPromises()

    expect(mockedGetProducts).toHaveBeenCalledTimes(1)
    expect(paramsFromCall(0).category_id).toBe(10)
  })

  it('maps a selected brand to brand_id as a number', async () => {
    const wrapper = await mountAndFlush()
    mockedGetProducts.mockClear()

    // radios[0] = "All brands", radios[2] = brand id 200 (Globex)
    await brandRadios(wrapper)[2]!.setValue()
    await flushPromises()

    expect(paramsFromCall(0).brand_id).toBe(200)
  })

  it('maps a selected sort option through unchanged', async () => {
    const wrapper = await mountAndFlush()
    mockedGetProducts.mockClear()

    await sortSelect(wrapper).setValue('-price')
    await flushPromises()

    expect(paramsFromCall(0).sort).toBe('-price')
  })

  it('clearAll resets category/brand/sort/price filters back to undefined', async () => {
    const wrapper = await mountAndFlush()

    await categoryRadios(wrapper)[1]!.setValue()
    await brandRadios(wrapper)[2]!.setValue()
    await sortSelect(wrapper).setValue('rating')
    const { min, max } = priceInputs(wrapper)
    await min.setValue('5000')
    await max.setValue('100000')
    await flushPromises()
    mockedGetProducts.mockClear()

    await wrapper.get('button.btn-outline').trigger('click')
    await flushPromises()

    expect(paramsFromCall(0)).toEqual({
      category_id: undefined,
      brand_id: undefined,
      min_price: undefined,
      max_price: undefined,
      sort: undefined,
    })
  })

  // Price is a pair of range sliders bound to number refs (PRICE_MIN..PRICE_MAX);
  // a value still at its bound means "no filter" (undefined), a moved slider
  // sends its value.
  it('maps a moved min-price slider to min_price as a number', async () => {
    const wrapper = await mountAndFlush()
    mockedGetProducts.mockClear()

    const { min } = priceInputs(wrapper)
    await min.setValue('5000')
    await flushPromises()

    expect(mockedGetProducts).toHaveBeenCalledTimes(1)
    expect(paramsFromCall(0).min_price).toBe(5000)
  })

  it('maps a moved max-price slider to max_price as a number', async () => {
    const wrapper = await mountAndFlush()
    mockedGetProducts.mockClear()

    const { max } = priceInputs(wrapper)
    await max.setValue('100000')
    await flushPromises()

    expect(paramsFromCall(0).max_price).toBe(100000)
  })

  // --- Regression guard: subcategory chip label lookup ---------------------
  //
  // activeChips' category-chip label lookup must resolve names for
  // categories that live only in categoryStore.childrenByParentId (i.e. a
  // selected leaf/subcategory), not just the flat top-level `categories`
  // array — otherwise the chip silently falls back to showing a raw numeric
  // id instead of a name.
  it('resolves a subcategory chip label via findCategoryById, not just top-level categories', async () => {
    const wrapper = await mountAndFlush()
    const categoryStore = useCategoryStore()
    categoryStore.childrenByParentId = {
      10: [{ id: 11, name: 'Phones', slug: 'phones', parent_id: 10 }],
    }
    mockedGetProducts.mockClear()

    // Simulate selecting the leaf directly via the child component's emit,
    // since this specific radio isn't rendered without expanding the parent
    // node first.
    wrapper.findComponent(CategoryTreeFilter).vm.$emit('update:modelValue', 11)
    await flushPromises()

    expect(wrapper.text()).toContain('Category: Phones')
  })
})
