import { describe, expect, it } from 'vitest'
import { assertAuthorized } from '../src/http/auth.ts'
import { ServiceUnavailableError, UnauthorizedError } from '../src/errors.ts'

describe('assertAuthorized', () => {
  it('fails closed (503) if BUILD_RUNNER_TOKEN is not configured, regardless of the header', () => {
    expect(() => assertAuthorized('Bearer anything', undefined)).toThrow(ServiceUnavailableError)
    expect(() => assertAuthorized(undefined, undefined)).toThrow(ServiceUnavailableError)
  })

  it('rejects a missing Authorization header (401)', () => {
    expect(() => assertAuthorized(undefined, 'the-real-token')).toThrow(UnauthorizedError)
  })

  it('rejects a malformed Authorization header (401)', () => {
    expect(() => assertAuthorized('Basic dXNlcjpwYXNz', 'the-real-token')).toThrow(UnauthorizedError)
    expect(() => assertAuthorized('Bearer', 'the-real-token')).toThrow(UnauthorizedError)
  })

  it('rejects a wrong token (401)', () => {
    expect(() => assertAuthorized('Bearer wrong-token', 'the-real-token')).toThrow(UnauthorizedError)
  })

  it('accepts a correctly presented token', () => {
    expect(() => assertAuthorized('Bearer the-real-token', 'the-real-token')).not.toThrow()
  })

  it('is case-insensitive on the "Bearer" scheme keyword', () => {
    expect(() => assertAuthorized('bearer the-real-token', 'the-real-token')).not.toThrow()
  })
})
