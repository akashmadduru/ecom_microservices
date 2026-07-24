export interface SortOption {
  value: string
  label: string
}

export const PRODUCT_SORT_VALUES = {
  featured: '',
  priceAsc: 'price',
  priceDesc: '-price',
  ratingDesc: 'rating',
  newest: 'newest',
} as const

export function toPriceParam(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}
