import type { RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from 'core/stores/auth'

/**
 * Navigation guard protecting `requiresAuth` / `requiresAdmin` routes.
 *
 * Every route in this app requires both `requiresAuth` and `requiresAdmin`
 * (only `/signin` is exempt), so unlike `ecom-web`'s guard there is no other
 * in-app page to send an authenticated-but-non-admin user to — `/signin` is
 * the only route that doesn't itself require admin, so it's used as the
 * fallback for that case too (as opposed to `ecom-web`, which sends
 * authenticated non-admins to its `/` storefront home).
 *
 * - Any route flagged `requiresAuth` or `requiresAdmin` requires an authenticated
 *   user; anonymous visitors are redirected to `/signin` with a `redirect` query so
 *   they can return after logging in.
 * - `requiresAdmin` routes additionally require an admin role; authenticated
 *   non-admins are sent to `/signin`.
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
    return { path: '/signin' }
  }

  return true
}
