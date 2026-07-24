const ACCESS_TOKEN_KEY = 'ecom_access_token'
const REFRESH_TOKEN_KEY = 'ecom_refresh_token'

// Safe default so nothing breaks if a consumer forgets to call
// `configureTokenStorage` — but every app in this workspace is expected to call
// it once (in its own `main.ts`, before anything touches auth) so that
// multiple apps sharing a browser/origin never collide on the same keys.
const DEFAULT_NAMESPACE = 'default'

let namespace = DEFAULT_NAMESPACE

/**
 * Namespaces all token storage keys to the given app (e.g. `'ecom-web'`,
 * `'ecom-admin'`), so multiple apps in this workspace never read/write each
 * other's tokens even if ever deployed to the same origin. Call once, as
 * early as possible, before any other token storage function is used.
 */
export function configureTokenStorage(appNamespace: string): void {
  namespace = appNamespace
}

function namespacedKey(key: string): string {
  return `${namespace}:${key}`
}

export function getAccessToken(): string | null {
  return localStorage.getItem(namespacedKey(ACCESS_TOKEN_KEY))
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(namespacedKey(REFRESH_TOKEN_KEY))
}

export function setTokens(accessToken: string, refreshToken?: string | null): void {
  localStorage.setItem(namespacedKey(ACCESS_TOKEN_KEY), accessToken)
  if (refreshToken) {
    localStorage.setItem(namespacedKey(REFRESH_TOKEN_KEY), refreshToken)
  }
}

export function clearTokens(): void {
  localStorage.removeItem(namespacedKey(ACCESS_TOKEN_KEY))
  localStorage.removeItem(namespacedKey(REFRESH_TOKEN_KEY))
}
