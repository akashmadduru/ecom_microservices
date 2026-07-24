import { describe, expect, it } from 'vitest'
import {
  brandSchema,
  inventorySchema,
  minNumber,
  productSchema,
  tagSchema,
  validate,
} from './validators'
import type { CreateBrandPayload } from '@/interfaces/brand'
import type { CreateInventoryPayload } from '@/interfaces/inventory'
import type { CreateProductPayload } from '@/interfaces/product'
import type { CreateTagPayload } from '@/interfaces/tag'

describe('minNumber', () => {
  it('passes for numbers at or above the floor', () => {
    expect(minNumber(0)(0, {})).toBeNull()
    expect(minNumber(1)(5, {})).toBeNull()
  })

  it('fails for values below the floor, non-numbers, and empty inputs', () => {
    expect(minNumber(0)(-1, {})).not.toBeNull()
    expect(minNumber(1)(0, {})).not.toBeNull()
    // v-model.number yields an empty string when the field is cleared.
    expect(minNumber(0)('' as unknown as number, {})).not.toBeNull()
    expect(minNumber(0)(Number.NaN, {})).not.toBeNull()
  })
})

describe('brandSchema', () => {
  const base: CreateBrandPayload = { name: 'Acme', slug: 'acme', is_active: true }

  it('accepts a valid brand (happy path)', () => {
    expect(validate(base, brandSchema).valid).toBe(true)
  })

  it('rejects a missing name and an invalid slug', () => {
    const result = validate({ ...base, name: '  ', slug: 'Not A Slug' }, brandSchema)
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeDefined()
    expect(result.errors.slug).toBeDefined()
  })

  it('rejects an invalid logo URL but allows an empty one', () => {
    expect(validate({ ...base, logo_url: 'not-a-url' }, brandSchema).valid).toBe(false)
    expect(validate({ ...base, logo_url: '' }, brandSchema).valid).toBe(true)
  })
})

describe('tagSchema', () => {
  it('accepts a valid tag and rejects an empty name', () => {
    const valid: CreateTagPayload = { name: 'Sale', slug: 'sale' }
    expect(validate(valid, tagSchema).valid).toBe(true)
    expect(validate({ name: '', slug: 'sale' }, tagSchema).valid).toBe(false)
  })
})

describe('productSchema', () => {
  const base: CreateProductPayload = {
    title: 'Widget',
    retail_price: 10,
    discount: 5,
    category: 'Tools',
    sub_category: 'Hand tools',
    brand: 'Acme',
    description: 'A useful widget',
  }

  it('accepts a fully populated product (happy path)', () => {
    expect(validate(base, productSchema).valid).toBe(true)
  })

  it('rejects an empty required field so submission is blocked', () => {
    const result = validate({ ...base, title: '' }, productSchema)
    expect(result.valid).toBe(false)
    expect(result.errors.title).toBeDefined()
  })

  it('rejects a cleared numeric price (empty string edge case)', () => {
    const result = validate(
      { ...base, retail_price: '' as unknown as number },
      productSchema,
    )
    expect(result.valid).toBe(false)
    expect(result.errors.retail_price).toBeDefined()
  })

  it('rejects a discount above 100', () => {
    expect(validate({ ...base, discount: 150 }, productSchema).valid).toBe(false)
  })
})

describe('inventorySchema', () => {
  const base: CreateInventoryPayload = {
    product_id: 1,
    sku: 'SKU-1',
    warehouse_location: 'DEFAULT',
    available_quantity: 0,
    safety_stock: 0,
    reorder_threshold: 0,
  }

  it('accepts a valid record with zero quantities (happy path)', () => {
    expect(validate(base, inventorySchema).valid).toBe(true)
  })

  it('rejects a zero product id and negative quantity', () => {
    expect(validate({ ...base, product_id: 0 }, inventorySchema).valid).toBe(false)
    expect(validate({ ...base, available_quantity: -5 }, inventorySchema).valid).toBe(false)
  })
})
