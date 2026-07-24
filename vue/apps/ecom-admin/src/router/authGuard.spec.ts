import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'
import { authGuard } from './authGuard'
import { useAuthStore } from 'core/stores/auth'
import type { AuthUser } from 'core/interfaces/auth'

function routeWith(
  meta: RouteLocationNormalized['meta'],
  fullPath = '/products',
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

  it('redirects an anonymous user off a requiresAdmin route to /signin with a redirect query', () => {
    const to = routeWith({ requiresAuth: true, requiresAdmin: true }, '/products')
    expect(authGuard(to)).toEqual({ path: '/signin', query: { redirect: '/products' } })
  })

  it('redirects an authenticated non-admin off a requiresAdmin route to /signin (no other page to land on)', () => {
    signIn({ role: 'CUSTOMER' })
    const to = routeWith({ requiresAuth: true, requiresAdmin: true })
    expect(authGuard(to)).toEqual({ path: '/signin' })
  })

  it('lets an authenticated admin through a requiresAdmin route', () => {
    signIn({ role: 'ADMIN' })
    const to = routeWith({ requiresAuth: true, requiresAdmin: true })
    expect(authGuard(to)).toBe(true)
  })

  it('treats a lowercase admin role as admin (case-insensitive)', () => {
    signIn({ role: 'admin' })
    const to = routeWith({ requiresAuth: true, requiresAdmin: true })
    expect(authGuard(to)).toBe(true)
  })

  it('leaves a route with no auth meta flags unaffected, even for anonymous users', () => {
    const to = routeWith({}, '/signin')
    expect(authGuard(to)).toBe(true)
  })
})
