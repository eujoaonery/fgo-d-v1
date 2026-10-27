import { Router } from 'express'
import type { FogoDb } from '../supabase.js'
import { ensureSession } from '../auth/ensureSession.js'
import { readAccessTokenFromRequest } from '../auth/sessionCookies.js'
import { writeSystemLog } from '../systemLog.js'
import { resolveRequestContext } from '../orgContext.js'
import { recordAccess } from '../platform/trafficLog.js'

const ALLOWED_TYPES = new Set(['login', 'logout', 'login_failed', 'session_restored'])

export function createAuthEventsRouter(defaultDb: FogoDb) {
  const router = Router()

  /** Eventos de sessão reportados pelo cliente (login, logout, falha). */
  router.post('/events', async (req, res, next) => {
    try {
      const body = req.body as {
        type?: 'login' | 'logout' | 'login_failed' | 'session_restored'
        email?: string
        error?: string
      }
      const type = body.type ?? 'login'
      if (!ALLOWED_TYPES.has(type)) {
        res.status(400).json({ error: 'Tipo de evento inválido' })
        return
      }

      let bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization : undefined
      if (!bearer) {
        const fromCookie = await ensureSession(req, res, defaultDb.supabase)
        const token = fromCookie ?? readAccessTokenFromRequest(req.headers.cookie)
        if (token) bearer = `Bearer ${token}`
      }
      if (type !== 'login_failed' && !bearer) {
        res.status(401).json({ error: 'Autenticação necessária para este evento' })
        return
      }

      let db: FogoDb = defaultDb
      try {
        db = defaultDb.tenant
          ? await resolveRequestContext(defaultDb.supabase, defaultDb.tenant, bearer)
          : defaultDb
      } catch {
        if (type !== 'login_failed') {
          res.status(401).json({ error: 'Sessão inválida' })
          return
        }
      }

      const level = type === 'login_failed' ? 'warn' : 'info'
      const message =
        type === 'login'
          ? 'Login realizado com sucesso'
          : type === 'logout'
            ? 'Logout do CCO'
            : type === 'login_failed'
              ? 'Tentativa de login falhou'
              : 'Sessão restaurada no cliente'

      const emailRaw = body.email?.trim().slice(0, 320) || db.actor?.email || null
      const xf = req.headers['x-forwarded-for']
      const ip = typeof xf === 'string' && xf.trim() ? xf.split(',')[0]?.trim() ?? null : (req.ip ?? null)

      recordAccess({
        event: type,
        email: emailRaw,
        ip,
        message: body.error ? `${message}: ${body.error.slice(0, 200)}` : message,
      })

      await writeSystemLog(db, {
        level,
        category: 'auth',
        message,
        metadata: {
          event: type,
          email: type === 'login_failed' ? emailRaw : db.actor?.email ?? emailRaw,
          error: body.error?.slice(0, 500) || null,
          ip,
        },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  return router
}
