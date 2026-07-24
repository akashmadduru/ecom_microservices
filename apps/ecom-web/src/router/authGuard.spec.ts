import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'
import { authGuard } from './authGuard'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/interfaces/auth'

function routeWith(
  meta: RouteLocationNormalized['meta'],
  fullPath = '/admin/products',
): RouteLocationNormalized {
  return { meta, fullPath } as RouteLocationNormalized
}

function signIn(user: Partial<AuthUser>) {
  const store = useAuthStore()
  store.user = { username: 'u', ...user } as AuthUser
}

describe('authGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('redirects an anonymous user off a requiresAuth route to /signin with a redirect query', () => {
    const to = routeWith({ requiresAuth: true }, '/orders')
    expect(authGuard(to)).toEqual({ path: '/signin', query: { redirect: '/orders' } })
  })

  it('redirects an anonymous user off a requiresAdmin route to /signin (not silently through)', () => {
    const to = routeWith({ requiresAdmin: true }, '/admin')
    expect(authGuard(to)).toEqual({ path: '/signin', query: { redirect: '/admin' } })
  })

  it('redirects an authenticated non-admin off a requiresAdmin route to /', () => {
    signIn({ role: 'CUSTOMER' })
    const to = routeWith({ requiresAuth: true, requiresAdmin: true })
    expect(authGuard(to)).toEqual({ path: '/' })
  })

  it('lets an authenticated admin through a requiresAdmin route', () => {
    signIn({ role: 'ADMIN' })
    const to = routeWith({ requiresAuth: true, requiresAdmin: true })
    expect(authGuard(to)).toBe(true)
  })

  it('treats a lowercase admin role as admin (case-insensitive)', () => {
    signIn({ role: 'admin' })
    const to = routeWith({ requiresAdmin: true })
    expect(authGuard(to)).toBe(true)
  })

  it('lets an authenticated user through a requiresAuth-only route', () => {
    signIn({ role: 'CUSTOMER' })
    const to = routeWith({ requiresAuth: true }, '/profile')
    expect(authGuard(to)).toBe(true)
  })

  it('leaves a route with no auth meta flags unaffected, even for anonymous users', () => {
    const to = routeWith({}, '/products')
    expect(authGuard(to)).toBe(true)
  })
})
