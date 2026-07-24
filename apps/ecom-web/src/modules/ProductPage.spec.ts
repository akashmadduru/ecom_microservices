import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Product } from '@/interfaces/product'
import type { InventoryRecord } from '@/interfaces/inventory'
import type { Manufacturer } from '@/interfaces/manufacturer'

// ProductPage only calls useRoute() from vue-router; mock it per-test like
// AdminBreadcrumbs.spec.ts does, and stub router-link/AppImage in the mount.
const currentRoute = { value: { params: { id: '1' } } as unknown as RouteLocationNormalizedLoaded }
vi.mock('vue-router', () => ({
  useRoute: () => currentRoute.value,
}))

vi.mock('@/api/ProductsApi', () => ({
  getProduct: vi.fn<(id: number) => Promise<Product>>(),
}))

vi.mock('@/api/InventoryApi', () => ({
  getInventoryByProduct: vi.fn<(productId: number) => Promise<InventoryRecord>>(),
}))

vi.mock('@/api/ManufacturersApi', () => ({
  getManufacturer: vi.fn<(id: number) => Promise<Manufacturer>>(),
}))

import { getProduct } from '@/api/ProductsApi'
import { getInventoryByProduct } from '@/api/InventoryApi'
import ProductPage from './ProductPage.vue'

const mockedGetProduct = vi.mocked(getProduct)
const mockedGetInventoryByProduct = vi.mocked(getInventoryByProduct)

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    uniq_id: 'uniq-1',
    product_url: 'https://example.com/p/1',
    title: 'Test Product',
    retail_price: 1000,
    discount: 200,
    image_urls: '[]',
    description: 'A great product',
    category: 'Gadgets',
    sub_category: 'Phones',
    rating: 4.5,
    brand: 'BrandX',
    ...overrides,
  }
}

async function mountPage() {
  const wrapper = mount(ProductPage, {
    global: {
      stubs: {
        'router-link': { template: '<a><slot /></a>' },
        AppImage: true,
      },
    },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('ProductPage pricing (regression: discount is a currency amount, not a percent)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedGetProduct.mockReset()
    mockedGetInventoryByProduct.mockReset()
    mockedGetInventoryByProduct.mockRejectedValue(new Error('no inventory record'))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders retail_price minus discount as the selling price (800), not the raw discount', async () => {
    mockedGetProduct.mockResolvedValue(baseProduct({ retail_price: 1000, discount: 200 }))

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('₹800.00')
    // The raw retail_price should still appear, struck through, as the MRP.
    expect(wrapper.text()).toContain('₹1000.00')
  })

  it('shows a genuine percentage-off badge (20% off), never the raw discount amount as a percent', async () => {
    mockedGetProduct.mockResolvedValue(baseProduct({ retail_price: 1000, discount: 200 }))

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('20% off')
    expect(wrapper.text()).not.toContain('200% off')
  })

  it('hides MRP strike-through and badge entirely when there is no discount', async () => {
    mockedGetProduct.mockResolvedValue(baseProduct({ retail_price: 1000, discount: 0 }))

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('₹1000.00')
    expect(wrapper.find('.badge-success').exists()).toBe(false)
  })
})
