import { describe, expect, it } from 'vitest'
import {
  assertValidContainerId,
  assertValidImageId,
  assertValidResourceId,
  translateDockerNotFound,
} from '../server/runtime/container-request'

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

describe('assertValidResourceId (networks/volumes)', () => {
  it('accepts a Docker network/volume name', () => {
    expect(assertValidResourceId('ecom_network')).toBe('ecom_network')
  })

  it('accepts a kubernetes-mode namespace_name id', () => {
    expect(assertValidResourceId('ecom_pg-data')).toBe('ecom_pg-data')
  })

  it('400s on a path-injection attempt', () => {
    expect(() => assertValidResourceId('../../etc')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('400s on undefined/empty', () => {
    expect(() => assertValidResourceId(undefined)).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => assertValidResourceId('')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('assertValidImageId', () => {
  it('accepts a real sha256 digest', () => {
    const id = `sha256:${'a'.repeat(64)}`
    expect(assertValidImageId(id)).toBe(id)
  })

  it('accepts a base64url-shaped synthetic kubernetes-mode id', () => {
    const id = Buffer.from('busybox:latest').toString('base64url')
    expect(assertValidImageId(id)).toBe(id)
  })

  it('400s on a malformed sha256 (wrong hex length)', () => {
    expect(() => assertValidImageId(`sha256:${'a'.repeat(10)}`)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })

  it('400s on a raw, un-encoded image reference containing "/" or ":" (would inject a path segment)', () => {
    expect(() => assertValidImageId('repo/name:tag')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('400s on undefined/empty', () => {
    expect(() => assertValidImageId(undefined)).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => assertValidImageId('')).toThrowError(expect.objectContaining({ statusCode: 400 }))
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

  it('labels the 404 message with the given resource kind (image/network/volume), not just "container"', () => {
    const dockerErr = Object.assign(new Error('no such image'), { statusCode: 404 })
    expect(() => translateDockerNotFound(dockerErr, 'sha256:abc', 'image')).toThrowError(
      expect.objectContaining({ statusCode: 404, message: 'No such image: sha256:abc' }),
    )
  })

  it('rethrows errors with no statusCode unchanged', () => {
    const plain = new Error('boom')
    expect(() => translateDockerNotFound(plain, 'abc')).toThrowError(plain)
  })

  it('rewrites a 404 from a Kubernetes ApiException-shaped error (uses `code`, not `statusCode`)', () => {
    const k8sErr = Object.assign(new Error('pods "x" not found'), { code: 404 })
    expect(() => translateDockerNotFound(k8sErr, 'ns_x')).toThrowError(
      expect.objectContaining({ statusCode: 404, message: expect.stringContaining('ns_x') }),
    )
  })

  it('rethrows a non-404 Kubernetes-shaped `code` unchanged', () => {
    const k8sErr = Object.assign(new Error('forbidden'), { code: 403 })
    expect(() => translateDockerNotFound(k8sErr, 'ns_x')).toThrowError(k8sErr)
  })
})
