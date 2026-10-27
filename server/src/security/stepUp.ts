import type { CookieOptions, NextFunction, Request, Response } from 'express'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { goTruePasswordGrant } from '../auth/goTrueClient.js'

export const STEPUP_COOKIE = 'fogo_su'
const STEPUP_MS = 15 * 60_000
const isProd = process.env.NODE_ENV === 'production'

const recent = new Map<string, number>()

function cookieOpts(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  }
}

export function markStepUp(userId: string, res: Response) {
  const exp = Date.now() + STEPUP_MS
  recent.set(userId, exp)
  res.cookie(STEPUP_COOKIE, String(exp), cookieOpts(STEPUP_MS))
}

export function hasFreshStepUp(req: Request, userId: string): boolean {
  const mem = recent.get(userId)
  if (mem && mem > Date.now()) return true
  const raw = req.cookies?.[STEPUP_COOKIE]
  const exp = raw ? Number(raw) : 0
  return Number.isFinite(exp) && exp > Date.now()
}

export async function confirmPasswordForActor(email: string | undefined, password: string | undefined) {
  if (!email || !password) throw new Error('Confirme a senha para esta operação administrativa')
  await goTruePasswordGrant(email, password)
}

export function requireStepUp(req: FogoRequest, res: Response, next: NextFunction) {
  const actor = req.fogoDb?.actor
  if (!actor) {
    res.status(401).json({ error: 'Autenticação necessária' })
    return
  }
  if (hasFreshStepUp(req, actor.userId)) {
    next()
    return
  }
  res.status(403).json({
    error: 'reauth_required',
    message: 'Confirme a senha para operações administrativas sensíveis (§5.7).',
  })
}
