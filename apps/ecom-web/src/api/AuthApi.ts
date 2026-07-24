import api from '@/config/axios'
import type {
  AdminDiagnostics,
  AuthUser,
  RefreshTokenPayload,
  SigninPayload,
  SignupPayload,
  SSOGenericLoginPayload,
  SSOGoogleTokenPayload,
  TokenResponse,
} from '@/interfaces/auth'

export async function signUp(payload: SignupPayload): Promise<AuthUser> {
  const response = await api.post('/auth/signup', payload)
  return response.data as AuthUser
}

export async function signIn(payload: SigninPayload): Promise<TokenResponse> {
  const form = new URLSearchParams()
  form.set('username', payload.username)
  form.set('password', payload.password)

  const response = await api.post('/auth/signin', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data as TokenResponse
}

export async function refreshToken(payload: RefreshTokenPayload): Promise<TokenResponse> {
  const response = await api.post('/auth/token/refresh', payload)
  return response.data as TokenResponse
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function logoutAllSessions(): Promise<void> {
  await api.post('/auth/logout/all')
}

export async function validateToken(): Promise<boolean> {
  try {
    await api.get('/auth/validate')
    return true
  } catch {
    return false
  }
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await api.get('/auth/users/me')
  return response.data as AuthUser
}

export async function getAdminDiagnostics(): Promise<AdminDiagnostics> {
  const response = await api.get('/auth/admin/diagnostics')
  return response.data as AdminDiagnostics
}

export async function googleSSOSignin(payload: SSOGoogleTokenPayload): Promise<TokenResponse> {
  const response = await api.post('/auth/sso/google', payload)
  return response.data as TokenResponse
}

export async function genericSSOSignin(payload: SSOGenericLoginPayload): Promise<TokenResponse> {
  const response = await api.post('/auth/sso/login', payload)
  return response.data as TokenResponse
}

export function getGoogleSSOAuthorizeUrl(): string {
  const baseURL = (api.defaults.baseURL ?? '').replace(/\/$/, '')
  return `${baseURL}/auth/sso/google/authorize`
}
