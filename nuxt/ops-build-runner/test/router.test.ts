import { describe, expect, it } from 'vitest'
import { Router } from '../src/http/router.ts'

describe('Router', () => {
  it('matches an exact path with no params', () => {
    const router = new Router()
    router.get('/audit', async () => ({ status: 200 }))

    const matched = router.match('GET', '/audit')
    expect(matched).toBeDefined()
    expect(matched?.params).toEqual({})
  })

  it('extracts a single :param segment', () => {
    const router = new Router()
    router.get('/build-requests/:id', async () => ({ status: 200 }))

    const matched = router.match('GET', '/build-requests/abc-123')
    expect(matched?.params).toEqual({ id: 'abc-123' })
  })

  it('extracts a :param in the middle of a longer path', () => {
    const router = new Router()
    router.post('/build-requests/:id/approve', async () => ({ status: 200 }))

    const matched = router.match('POST', '/build-requests/xyz/approve')
    expect(matched?.params).toEqual({ id: 'xyz' })
  })

  it('is method-sensitive', () => {
    const router = new Router()
    router.get('/build-requests/:id', async () => ({ status: 200 }))

    expect(router.match('POST', '/build-requests/abc')).toBeUndefined()
  })

  it('does not match a path with a different segment count', () => {
    const router = new Router()
    router.get('/build-requests/:id', async () => ({ status: 200 }))

    expect(router.match('GET', '/build-requests')).toBeUndefined()
    expect(router.match('GET', '/build-requests/abc/extra')).toBeUndefined()
  })

  it('returns undefined for a completely unregistered path', () => {
    const router = new Router()
    expect(router.match('GET', '/nope')).toBeUndefined()
  })
})
