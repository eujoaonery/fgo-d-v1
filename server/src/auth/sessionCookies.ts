import type { CookieOptions, Request, Response } from 'express'
import { sessionTtlMs } from '../platform/sessionPolicy.js'

export const ACCESS_COOKIE = 'fogo_at'
export const REFRESH_COOKIE = 'fogo_rt'
export const SESSION_EXPIRES_COOKIE = 'fogo_sx'

const isProd = process.env.NODE_ENV === 'production'
const ROTATION_TTL_MS = 2 * 60 * 1000

let cookieIssue = 0
const rotatedAccess = new Map<string, { access: string; expiresAt: number }>()

export function authCookieIssue(): number {
  return cookieIssue
}

function bumpCookieIssue() {
  cookieIssue += 1
}

function pruneRotations(now = Date.now()) {
  for (const [key, entry] of rotatedAccess) {
    if (entry.expiresAt <= now) rotatedAccess.delete(key)
  }
}

/** Liga o refresh que acabou de ser trocado ao access novo dessa mesma sessão. */
export function noteRefreshRotation(previousRefresh: string, accessToken: string) {
  if (!previousRefresh || !accessToken) return
  pruneRotations()
  rotatedAccess.set(previousRefresh, { access: accessToken, expiresAt: Date.now() + ROTATION_TTL_MS })
}

/**
 * Pedido paralelo ainda carrega o refresh anterior desta sessão.
 * Não chama o GoTrue de novo — isso revoga a sessão nova.
 * Refresh desconhecido não recebe token de ninguém.
 */
export function accessReplacingStaleRefresh(refreshToken: string): string | null {
  if (!refreshToken) return null
  const hit = rotatedAccess.get(refreshToken)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    rotatedAccess.delete(refreshToken)
    return null
  }
  return hit.access
}

function baseCookieOpts(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  }
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  expiresInSec: number,
  sessionEndsAtMs?: number,
) {
  const endsAt = sessionEndsAtMs ?? Date.now() + sessionTtlMs()
  const remainingMs = Math.max(0, endsAt - Date.now())
  if (remainingMs <= 0) {
    clearAuthCookies(res)
    return
  }
  bumpCookieIssue()
  const accessMs = Math.min(Math.max(60, expiresInSec) * 1000, remainingMs)
  res.cookie(ACCESS_COOKIE, accessToken, baseCookieOpts(accessMs))
  res.cookie(REFRESH_COOKIE, refreshToken, baseCookieOpts(remainingMs))
  res.cookie(SESSION_EXPIRES_COOKIE, String(endsAt), baseCookieOpts(remainingMs))
}

export function clearAuthCookies(res: Response) {
  bumpCookieIssue()
  const base = { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'strict' : 'lax' } as const
  res.clearCookie(ACCESS_COOKIE, base)
  res.clearCookie(REFRESH_COOKIE, base)
  res.clearCookie(SESSION_EXPIRES_COOKIE, base)
  res.clearCookie('fogo_su', base)
}

export function forgetRequestAuthCookies(req: Pick<Request, 'cookies' | 'headers'> | { cookies?: Record<string, unknown>; headers?: { cookie?: string } }) {
  if (req.cookies) {
    delete req.cookies[ACCESS_COOKIE]
    delete req.cookies[REFRESH_COOKIE]
    delete req.cookies[SESSION_EXPIRES_COOKIE]
    delete req.cookies.fogo_su
  }
  const header = req.headers?.cookie
  if (typeof header === 'string') {
    const kept = header
      .split(';')
      .map((part) => part.trim())
      .filter((part) => {
        const name = part.split('=')[0]
        return name !== ACCESS_COOKIE && name !== REFRESH_COOKIE && name !== SESSION_EXPIRES_COOKIE && name !== 'fogo_su'
      })
    if (req.headers) req.headers.cookie = kept.join('; ')
  }
}

export function readSessionEndsAt(
  req: Pick<Request, 'cookies' | 'headers'> | { cookies?: Record<string, unknown>; headers?: { cookie?: string } },
): number | null {
  const raw = req.cookies?.[SESSION_EXPIRES_COOKIE]
  const fromCookie = typeof raw === 'string' ? raw : undefined
  const fromHeader = readNamedCookie(typeof req.headers?.cookie === 'string' ? req.headers.cookie : undefined, SESSION_EXPIRES_COOKIE)
  const n = Number(fromCookie ?? fromHeader)
  return Number.isFinite(n) && n > 0 ? n : null
}

function readNamedCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function readAccessTokenFromRequest(cookieHeader: string | undefined): string | undefined {
  return readNamedCookie(cookieHeader, ACCESS_COOKIE)
}

export function readRefreshTokenFromRequest(cookieHeader: string | undefined): string | undefined {
  return readNamedCookie(cookieHeader, REFRESH_COOKIE)
}
