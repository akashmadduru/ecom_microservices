import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/tokenStorage'

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080/api/v1'

const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

let unauthorizedHandler: (() => void) | null = null

/** Registered once at app startup so the interceptor can clear store state without importing Pinia here. */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await axios.post<{ access_token?: string; refresh_token?: string }>(
      `${baseURL}/auth/token/refresh`,
      { refresh_token: refreshToken },
    )
    const accessToken = response.data.access_token
    if (!accessToken) return null

    setTokens(accessToken, response.data.refresh_token ?? refreshToken)
    return accessToken
  } catch {
    return null
  }
}

const AUTH_ENDPOINTS_WITHOUT_REFRESH = ['/auth/signin', '/auth/signup', '/auth/token/refresh']

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined
    const status = error.response?.status
    const isExemptEndpoint = AUTH_ENDPOINTS_WITHOUT_REFRESH.some((path) =>
      originalRequest?.url?.includes(path),
    )

    if (status === 401 && originalRequest && !originalRequest._retry && !isExemptEndpoint) {
      originalRequest._retry = true

      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null
      })
      const newAccessToken = await refreshPromise

      if (newAccessToken) {
        originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`)
        return api(originalRequest)
      }

      clearTokens()
      unauthorizedHandler?.()
    }

    return Promise.reject(error)
  },
)

export default api
