import { describe, expect, it } from 'vitest'
import {
  epochSecondsToIso,
  isoOrNull,
  normalizeHealthStatus,
  parseHealthFromStatus,
  stripLeadingSlash,
} from '../server/runtime/parse'

describe('parseHealthFromStatus', () => {
  it('parses healthy from the status text (happy path)', () => {
    expect(parseHealthFromStatus('Up 3 hours (healthy)')).toBe('healthy')
  })

  it('parses unhealthy', () => {
    expect(parseHealthFromStatus('Up 2 minutes (unhealthy)')).toBe('unhealthy')
  })

  it('parses the starting state in both textual forms', () => {
    expect(parseHealthFromStatus('Up 1 second (health: starting)')).toBe('starting')
    expect(parseHealthFromStatus('Up 1 second (starting)')).toBe('starting')
  })

  it('returns none when there is no health suffix (edge case)', () => {
    expect(parseHealthFromStatus('Up 5 hours')).toBe('none')
    expect(parseHealthFromStatus('Exited (0) 2 days ago')).toBe('none')
  })

  it('returns none for undefined/empty status (edge case)', () => {
    expect(parseHealthFromStatus(undefined)).toBe('none')
    expect(parseHealthFromStatus('')).toBe('none')
  })

  it('returns none for a whitespace-only status (edge case)', () => {
    expect(parseHealthFromStatus('   ')).toBe('none')
  })

  it('is case-insensitive on the health suffix', () => {
    expect(parseHealthFromStatus('Up 3 hours (HEALTHY)')).toBe('healthy')
    expect(parseHealthFromStatus('Up 3 hours (UnHealthy)')).toBe('unhealthy')
  })

  it('does not false-positive-match "healthy" as a substring of "unhealthy" (regression)', () => {
    // "(unhealthy)" contains the characters "healthy" but NOT the exact
    // substring "(healthy)" — the healthy check must not fire first.
    expect(parseHealthFromStatus('Up 2 minutes (unhealthy)')).toBe('unhealthy')
    expect(parseHealthFromStatus('Up 2 minutes (unhealthy)')).not.toBe('healthy')
  })

  it('returns none for a completely malformed/unexpected status format (edge case)', () => {
    expect(parseHealthFromStatus('???')).toBe('none')
    expect(parseHealthFromStatus('healthy')).toBe('none') // no parens -> not the expected shape
    expect(parseHealthFromStatus('(healthy')).toBe('none') // missing closing paren
  })
})

describe('normalizeHealthStatus', () => {
  it('passes through known states', () => {
    expect(normalizeHealthStatus('healthy')).toBe('healthy')
    expect(normalizeHealthStatus('unhealthy')).toBe('unhealthy')
    expect(normalizeHealthStatus('starting')).toBe('starting')
  })

  it('maps unknown/null to none (edge case)', () => {
    expect(normalizeHealthStatus(null)).toBe('none')
    expect(normalizeHealthStatus(undefined)).toBe('none')
    expect(normalizeHealthStatus('weird')).toBe('none')
  })
})

describe('stripLeadingSlash', () => {
  it('strips a single leading slash', () => {
    expect(stripLeadingSlash('/api-gateway')).toBe('api-gateway')
  })

  it('leaves un-prefixed names alone and handles undefined', () => {
    expect(stripLeadingSlash('redis')).toBe('redis')
    expect(stripLeadingSlash(undefined)).toBe('')
  })
})

describe('timestamp coercion', () => {
  it('converts epoch seconds to ISO', () => {
    expect(epochSecondsToIso(0)).toBe(new Date(0).toISOString())
    expect(epochSecondsToIso(1_700_000_000)).toBe(
      new Date(1_700_000_000_000).toISOString(),
    )
  })

  it('isoOrNull returns null for junk (edge case)', () => {
    expect(isoOrNull(undefined)).toBeNull()
    expect(isoOrNull('not-a-date')).toBeNull()
    expect(isoOrNull('2024-01-02T03:04:05Z')).toBe(
      new Date('2024-01-02T03:04:05Z').toISOString(),
    )
  })
})
