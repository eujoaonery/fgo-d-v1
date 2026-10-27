import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { goTrueRefresh } from './goTrueClient.js'
import {
  accessReplacingStaleRefresh,
  authCookieIssue,
  noteRefreshRotation,
  readAccessTokenFromRequest,
  readRefreshTokenFromRequest,
  readSessionEndsAt,
  setAuthCookies,
} from './sessionCookies.js'

const refreshInflight = new Map<string, Promise<Awaited<ReturnType<typeof goTrueRefresh>>>>()

function refreshOnce(refreshToken: string) {
  const existing = refreshInflight.get(refreshToken)
  if (existing) return existing
  const pending = goTrueRefresh(refreshToken).finally(() => {
    if (refreshInflight.get(refreshToken) === pending) refreshInflight.delete(refreshToken)
  })
  refreshInflight.set(refreshToken, pending)
  return pending
}

export async function ensureSession(
  req: Request,
  res: Response,
  supabase: SupabaseClient,
): Promise<string | null> {
  const seenIssue = authCookieIssue()
  const endsAt = readSessionEndsAt(req)
  if (endsAt != null && endsAt <= Date.now()) {
    return null
  }

  const header = req.headers.authorization
  const headerToken = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined
  const access = headerToken ?? readAccessTokenFromRequest(req.headers.cookie)
  if (access) {
    const { data } = await supabase.auth.getUser(access)
    if (data.user) return access
  }

  const refresh = readRefreshTokenFromRequest(req.headers.cookie)
  if (!refresh) return null
  const alreadyRotated = accessReplacingStaleRefresh(refresh)
  if (alreadyRotated) return alreadyRotated
  try {
    const session = await refreshOnce(refresh)
    noteRefreshRotation(refresh, session.access_token)
    if (authCookieIssue() !== seenIssue) return accessReplacingStaleRefresh(refresh)
    setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in, endsAt ?? undefined)
    return session.access_token
  } catch {
    if (authCookieIssue() !== seenIssue) return accessReplacingStaleRefresh(refresh)
    return null
  }
}
