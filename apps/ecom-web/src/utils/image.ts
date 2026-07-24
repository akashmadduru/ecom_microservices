import placeholder from '@/assets/placeholder-product.svg'

export const IMAGE_PLACEHOLDER = placeholder

/**
 * Resolve a product `image_urls` field into a single displayable URL.
 * The backend stores images either as a JSON-encoded string array or a plain
 * URL string. Falls back to the placeholder for null/empty/malformed input.
 */
export function resolveImageUrl(raw?: string | null, fallback: string = IMAGE_PLACEHOLDER): string {
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      const first = parsed.find((url) => typeof url === 'string' && url.length > 0)
      return typeof first === 'string' ? first : fallback
    }
  } catch {
    // Not JSON — treat as a plain URL string below.
  }

  return raw
}

/**
 * Resolve a product `image_urls` field into a list of URLs (gallery use-case).
 * Returns an empty array for null/empty/malformed input.
 */
export function resolveImageUrls(raw?: string | null): string[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((url): url is string => typeof url === 'string' && url.length > 0)
    }
  } catch {
    // Not JSON — treat as a single plain URL below.
  }

  return [raw]
}
