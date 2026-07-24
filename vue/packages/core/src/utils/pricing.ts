// `discount` on a Product is an absolute currency amount subtracted from
// `retail_price` (the MRP/list price) — NOT a percentage. Confirmed against
// live seeded data: discount is consistently a modest fraction (~7-29%) of
// retail_price, never comparable in magnitude to a raw percentage field.
//
// Both fields are typed `number` on the `Product` interface, but the API
// actually serializes them as decimal strings (e.g. "4622.32"). Coerce
// defensively here rather than trusting the declared type.
export interface Priceable {
  retail_price: number
  discount?: number
}

function toNumber(value: number | undefined): number {
  if (value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(n) ? 0 : n
}

export function hasDiscount(product: Priceable): boolean {
  const price = toNumber(product.retail_price)
  const discount = toNumber(product.discount)
  return discount > 0 && discount < price
}

/** The actual price a customer pays. */
export function getSellingPrice(product: Priceable): number {
  const price = toNumber(product.retail_price)
  return hasDiscount(product) ? price - toNumber(product.discount) : price
}

/** MRP to show struck through — only meaningful when there's a real discount. */
export function getMrp(product: Priceable): number | null {
  return hasDiscount(product) ? toNumber(product.retail_price) : null
}

/** Absolute amount saved. */
export function getSavings(product: Priceable): number | null {
  return hasDiscount(product) ? toNumber(product.discount) : null
}

/** Discount percentage for "X% off" badges, derived from the currency amount. */
export function getDiscountPercent(product: Priceable): number | null {
  if (!hasDiscount(product)) return null
  return Math.round((toNumber(product.discount) / toNumber(product.retail_price)) * 100)
}
