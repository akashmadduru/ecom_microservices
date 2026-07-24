import { describe, expect, it } from 'vitest'
import { IMAGE_PLACEHOLDER, resolveImageUrl, resolveImageUrls } from './image'

describe('resolveImageUrl', () => {
  it('returns the first URL of a JSON-encoded string array', () => {
    const raw = JSON.stringify(['https://cdn/a.jpg', 'https://cdn/b.jpg'])
    expect(resolveImageUrl(raw)).toBe('https://cdn/a.jpg')
  })

  it('skips empty entries and returns the first non-empty URL in the array', () => {
    const raw = JSON.stringify(['', 'https://cdn/b.jpg'])
    expect(resolveImageUrl(raw)).toBe('https://cdn/b.jpg')
  })

  it('returns a plain (non-JSON) URL string unchanged', () => {
    expect(resolveImageUrl('https://cdn/plain.jpg')).toBe('https://cdn/plain.jpg')
  })

  it('falls back to the placeholder for null, undefined and empty input', () => {
    expect(resolveImageUrl(null)).toBe(IMAGE_PLACEHOLDER)
    expect(resolveImageUrl(undefined)).toBe(IMAGE_PLACEHOLDER)
    expect(resolveImageUrl('')).toBe(IMAGE_PLACEHOLDER)
  })

  it('falls back to the placeholder for a JSON array with no usable URLs', () => {
    expect(resolveImageUrl(JSON.stringify([]))).toBe(IMAGE_PLACEHOLDER)
    expect(resolveImageUrl(JSON.stringify(['', '']))).toBe(IMAGE_PLACEHOLDER)
  })

  it('treats a malformed JSON string as a plain URL (returns it verbatim)', () => {
    expect(resolveImageUrl('[not valid json')).toBe('[not valid json')
  })

  it('honours a custom fallback', () => {
    expect(resolveImageUrl(null, '/custom.png')).toBe('/custom.png')
  })
})

describe('resolveImageUrls', () => {
  it('returns all non-empty URLs from a JSON-encoded array', () => {
    const raw = JSON.stringify(['https://cdn/a.jpg', '', 'https://cdn/b.jpg'])
    expect(resolveImageUrls(raw)).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg'])
  })

  it('wraps a plain URL string in a single-element array', () => {
    expect(resolveImageUrls('https://cdn/plain.jpg')).toEqual(['https://cdn/plain.jpg'])
  })

  it('returns an empty array for null/empty input', () => {
    expect(resolveImageUrls(null)).toEqual([])
    expect(resolveImageUrls('')).toEqual([])
  })

  it('treats malformed JSON as a single plain URL', () => {
    expect(resolveImageUrls('{oops')).toEqual(['{oops'])
  })
})
