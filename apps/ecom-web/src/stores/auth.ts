import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  genericSSOSignin,
  getAdminDiagnostics,
  getCurrentUser,
  getGoogleSSOAuthorizeUrl,
  googleSSOSignin,
  logout as logoutRequest,
  logoutAllSessions as logoutAllRequest,
  signIn,
  signUp,
} from '@/api/AuthApi'
import { onUnauthorized } from '@/config/axios'
import { clearTokens, getAccessToken, setTokens } from '@/utils/tokenStorage'
import { normalizeApiError } from '@/utils/apiError'
import type {
  AdminDiagnostics,
  AuthUser,
  SigninPayload,
  SignupPayload,
  SSOGenericLoginPayload,
} from '@/interfaces/auth'

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Payload = token.split('.')[1]
  if (!base64Payload) return {}

  const normalized = base64Payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')

  try {
    return JSON.parse(window.atob(padded)) as Record<string, unknown>
  } catch {
    return {}
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser>()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role?.toUpperCase() === 'ADMIN')

  async function withLoading<T>(action: () => Promise<T>): Promise<T> {
    loading.value = true
    error.value = null
    try {
      return await action()
    } catch (err) {
      error.value = normalizeApiError(err).message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function hydrateUser(): Promise<void> {
    try {
      user.value = await getCurrentUser()
    } catch {
      clearTokens()
      user.value = undefined
    }
  }

  async function signInUser(payload: SigninPayload): Promise<AuthUser> {
    return withLoading(async () => {
      const tokens = await signIn(payload)
      setTokens(tokens.access_token, tokens.refresh_token)
      await hydrateUser()
      return user.value as AuthUser
    })
  }

  async function signUpUser(payload: SignupPayload): Promise<AuthUser> {
    return withLoading(async () => {
      // signup only creates the account; sign in immediately to establish a session
      await signUp(payload)
      const tokens = await signIn({ username: payload.username, password: payload.password })
      setTokens(tokens.access_token, tokens.refresh_token)
      await hydrateUser()
      return user.value as AuthUser
    })
  }

  async function signInWithGoogle(credential: string): Promise<AuthUser> {
    return withLoading(async () => {
      const tokens = await googleSSOSignin({ token: credential })
      setTokens(tokens.access_token, tokens.refresh_token)
      await hydrateUser()
      return user.value as AuthUser
    })
  }

  async function signInWithSSO(payload: SSOGenericLoginPayload): Promise<AuthUser> {
    return withLoading(async () => {
      const tokens = await genericSSOSignin(payload)
      setTokens(tokens.access_token, tokens.refresh_token)
      await hydrateUser()
      return user.value as AuthUser
    })
  }

  function googleAuthorizeRedirectUrl(): string {
    return getGoogleSSOAuthorizeUrl()
  }

  function decodeGoogleCredential(credential: string) {
    return decodeJwtPayload(credential)
  }

  async function signOutUser(): Promise<void> {
    try {
      if (getAccessToken()) {
        await logoutRequest()
      }
    } finally {
      clearTokens()
      user.value = undefined
    }
  }

  async function signOutAllSessions(): Promise<void> {
    try {
      await logoutAllRequest()
    } finally {
      clearTokens()
      user.value = undefined
    }
  }

  async function fetchAdminDiagnostics(): Promise<AdminDiagnostics> {
    return withLoading(() => getAdminDiagnostics())
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return
    initialized.value = true

    onUnauthorized(() => {
      user.value = undefined
    })

    if (getAccessToken()) {
      await hydrateUser()
    }
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    initialize,
    signInUser,
    signUpUser,
    signInWithGoogle,
    signInWithSSO,
    googleAuthorizeRedirectUrl,
    decodeGoogleCredential,
    signOutUser,
    signOutAllSessions,
    fetchAdminDiagnostics,
  }
})
