const STORAGE_KEY = 'ops_api_token'

/**
 * Operator token state, backed by sessionStorage (NOT localStorage — the token
 * must not survive the browser session, and must never be build-baked).
 */
export function useApiToken() {
  // useState gives a single shared reactive ref across the app.
  const token = useState<string>('ops-api-token', () => '')

  function load(): void {
    if (import.meta.client) {
      token.value = sessionStorage.getItem(STORAGE_KEY) ?? ''
    }
  }

  function set(value: string): void {
    const trimmed = value.trim()
    token.value = trimmed
    if (import.meta.client) {
      if (trimmed) sessionStorage.setItem(STORAGE_KEY, trimmed)
      else sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  function clear(): void {
    set('')
  }

  const hasToken = computed(() => token.value.length > 0)

  return { token, hasToken, load, set, clear }
}
