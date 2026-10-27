import { apiUrl } from '@/lib/apiBase'
import { authUsesCookies } from '@/lib/authMode'

export type AuthConfigResponse = {
  authMode: 'bff' | 'direct'
  turnstileSiteKey: string | null
  supabaseHidden: boolean
}

let cachedConfig: AuthConfigResponse | null = null

export async function fetchAuthConfig(): Promise<AuthConfigResponse> {
  if (cachedConfig) return cachedConfig
  const res = await fetch(apiUrl('/api/auth/config'), { credentials: authUsesCookies() ? 'include' : 'same-origin' })
  if (!res.ok) {
    return { authMode: 'direct', turnstileSiteKey: null, supabaseHidden: false }
  }
  cachedConfig = (await res.json()) as AuthConfigResponse
  return cachedConfig
}

export async function bffLogin(email: string, password: string, turnstileToken?: string): Promise<void> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, turnstileToken }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Falha no login')
  }
}

export async function bffLogout(): Promise<void> {
  await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' })
}

export async function bffSession(): Promise<{ user: { id: string; email?: string | null } } | null> {
  const res = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' })
  if (!res.ok) return null
  return res.json() as Promise<{ user: { id: string; email?: string | null } }>
}
