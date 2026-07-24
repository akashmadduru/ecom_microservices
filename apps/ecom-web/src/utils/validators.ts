import type { CreateBrandPayload } from '@/interfaces/brand'
import type { CreateTagPayload } from '@/interfaces/tag'
import type { CreateManufacturerPayload } from '@/interfaces/manufacturer'
import type { CreateProductPayload } from '@/interfaces/product'
import type { CreateInventoryPayload } from '@/interfaces/inventory'

export type FieldValidator<V> = (value: V, form: Record<string, unknown>) => string | null

export type ValidationSchema<T> = {
  [K in keyof T]?: FieldValidator<T[K]> | FieldValidator<T[K]>[]
}

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string[]>
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

export const required =
  (msg = 'This field is required.'): FieldValidator<unknown> =>
  (value) =>
    isEmpty(value) ? msg : null

export const slugRule =
  (
    msg = 'Must be a valid slug (lowercase letters, numbers, and hyphens).',
  ): FieldValidator<string | undefined> =>
  (value) =>
    value && !SLUG_PATTERN.test(value) ? msg : null

export const emailRule =
  (msg = 'Must be a valid email address.'): FieldValidator<string | undefined> =>
  (value) =>
    value && !EMAIL_PATTERN.test(value) ? msg : null

export const urlRule =
  (msg = 'Must be a valid URL.'): FieldValidator<string | undefined> =>
  (value) => {
    if (!value) return null
    try {
      new URL(value)
      return null
    } catch {
      return msg
    }
  }

export const numberInRange =
  (min: number, max: number, msg?: string): FieldValidator<number> =>
  (value) =>
    typeof value !== 'number' || Number.isNaN(value) || value < min || value > max
      ? (msg ?? `Must be between ${min} and ${max}.`)
      : null

export const minNumber =
  (min: number, msg?: string): FieldValidator<number> =>
  (value) =>
    typeof value !== 'number' || Number.isNaN(value) || value < min
      ? (msg ?? `Must be a number of at least ${min}.`)
      : null

export function validate<T extends object>(
  form: T,
  schema: ValidationSchema<T>,
): ValidationResult {
  const errors: Record<string, string[]> = {}

  for (const key of Object.keys(schema) as (keyof T)[]) {
    const validators = schema[key]
    if (!validators) continue

    const list = Array.isArray(validators) ? validators : [validators]
    for (const validator of list) {
      const message = validator(form[key], form as Record<string, unknown>)
      if (message) {
        errors[key as string] = [message]
        break
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export const brandSchema: ValidationSchema<CreateBrandPayload> = {
  name: required('Name is required.'),
  slug: [required('Slug is required.'), slugRule()],
  logo_url: urlRule(),
}

export const tagSchema: ValidationSchema<CreateTagPayload> = {
  name: required('Name is required.'),
  slug: [required('Slug is required.'), slugRule()],
}

export const manufacturerSchema: ValidationSchema<CreateManufacturerPayload> = {
  name: required('Name is required.'),
}

export const productSchema: ValidationSchema<CreateProductPayload> = {
  title: required('Title is required.'),
  brand: required('Brand is required.'),
  category: required('Category is required.'),
  sub_category: required('Sub-category is required.'),
  description: required('Description is required.'),
  slug: slugRule(),
  retail_price: minNumber(0, 'Retail price must be zero or greater.'),
  discount: numberInRange(0, 100, 'Discount must be between 0 and 100.'),
}

export const inventorySchema: ValidationSchema<CreateInventoryPayload> = {
  product_id: minNumber(1, 'Product ID must be a valid product.'),
  sku: required('SKU is required.'),
  warehouse_location: required('Warehouse location is required.'),
  available_quantity: minNumber(0, 'Available quantity must be zero or greater.'),
  safety_stock: minNumber(0, 'Safety stock must be zero or greater.'),
  reorder_threshold: minNumber(0, 'Reorder threshold must be zero or greater.'),
}
