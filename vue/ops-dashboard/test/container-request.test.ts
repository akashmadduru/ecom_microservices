import { describe, expect, it } from 'vitest'
import { assertValidContainerId, translateDockerNotFound } from '../server/runtime/container-request'

describe('assertValidContainerId', () => {
  it('accepts a 64-char hex container id', () => {
    const id = 'a'.repeat(64)
    expect(assertValidContainerId(id)).toBe(id)
  })

  it('accepts a truncated hex prefix', () => {
    expect(assertValidContainerId('a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6')
  })

  it('accepts a compose-style container name', () => {
    expect(assertValidContainerId('ecom-web-api-gateway-1')).toBe('ecom-web-api-gateway-1')
  })

  it('400s on undefined', () => {
    expect(() => assertValidContainerId(undefined)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })

  it('400s on an empty string', () => {
    expect(() => assertValidContainerId('')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('400s on a value containing a path separator (path-injection attempt)', () => {
    expect(() => assertValidContainerId('abc/../../etc')).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })

  it('400s on a value containing a query-string delimiter', () => {
    expect(() => assertValidContainerId('abc?foo=bar')).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })

  it('400s on a value starting with a non-alphanumeric character', () => {
    expect(() => assertValidContainerId('-abc')).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => assertValidContainerId('.abc')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('400s on whitespace', () => {
    expect(() => assertValidContainerId('abc def')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('400s on a value exceeding the length allowlist', () => {
    expect(() => assertValidContainerId('a'.repeat(200))).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })
})

describe('translateDockerNotFound', () => {
  it('rewrites a 404 dockerode error into a friendlier 404', () => {
    const dockerErr = Object.assign(new Error('no such container'), { statusCode: 404 })
    expect(() => translateDockerNotFound(dockerErr, 'abc')).toThrowError(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('abc') }),
    )
  })

  it('rethrows non-404 errors unchanged', () => {
    const other = Object.assign(new Error('engine unreachable'), { statusCode: 502 })
    expect(() => translateDockerNotFound(other, 'abc')).toThrowError(other)
  })

  it('rethrows errors with no statusCode unchanged', () => {
    const plain = new Error('boom')
    expect(() => translateDockerNotFound(plain, 'abc')).toThrowError(plain)
  })
})
