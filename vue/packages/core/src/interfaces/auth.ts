export interface SignupPayload {
  username: string
  email: string
  password: string
}

export interface SigninPayload {
  username: string
  password: string
}

export interface RefreshTokenPayload {
  refresh_token: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
}

export interface AuthUser {
  id?: number | string
  username: string
  email?: string
  role?: string
}

export interface SSOGoogleTokenPayload {
  token: string
}

export interface SSOGenericLoginPayload {
  provider: string
  subject: string
  email: string
  display_name?: string
}

export type AdminDiagnostics = Record<string, unknown>
