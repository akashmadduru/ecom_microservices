import type { RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Navigation guard protecting `requiresAuth` / `requiresAdmin` routes.
 *
 * - Any route flagged `requiresAuth` or `requiresAdmin` requires an authenticated
 *   user; anonymous visitors are redirected to `/signin` with a `redirect` query so
 *   they can return after logging in.
 * - `requiresAdmin` routes additionally require an admin role; authenticated
 *   non-admins are sent to `/`.
 * - Routes with neither flag are always allowed.
 *
 * Extracted from the router definition so it can be unit-tested in isolation.
 */
export function authGuard(to: RouteLocationNormalized) {
  const authStore = useAuthStore()
  const requiresAuth = to.meta.requiresAuth === true
  const requiresAdmin = to.meta.requiresAdmin === true

  if ((requiresAuth || requiresAdmin) && !authStore.isAuthenticated) {
    return { path: '/signin', query: { redirect: to.fullPath } }
  }
  if (requiresAdmin && !authStore.isAdmin) {
    return { path: '/' }
  }

  return true
}
