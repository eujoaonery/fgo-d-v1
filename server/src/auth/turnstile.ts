import { HttpError } from '../httpError.js'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileEnforced(): boolean {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return false
  if (process.env.FOGO_TURNSTILE_ENFORCE === 'true') return true
  return process.env.NODE_ENV === 'production'
}

export function turnstileSiteKeyPublic(): string | null {
  const key = (process.env.TURNSTILE_SITE_KEY ?? process.env.VITE_TURNSTILE_SITE_KEY)?.trim()
  return key || null
}

export async function verifyTurnstileToken(token: string | undefined, remoteIp?: string): Promise<boolean> {
  if (!turnstileEnforced()) return true
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return false
  if (!token?.trim()) return false

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token.trim())
  if (remoteIp) body.set('remoteip', remoteIp)

  const res = await fetch(VERIFY_URL, { method: 'POST', body })
  const json = (await res.json()) as { success?: boolean }
  return json.success === true
}

export async function assertTurnstile(
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<void> {
  if (!turnstileEnforced()) return
  const ok = await verifyTurnstileToken(token, remoteIp)
  if (!ok) {
    throw new HttpError(400, 'Verificação de segurança (Turnstile) falhou ou expirou', 'TURNSTILE_FAILED')
  }
}
