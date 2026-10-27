import { Router } from 'express'
import { loginLimiter } from '../middleware/rateLimits.js'
import type { FogoDb } from '../db.js'
import { goTrueLogout, goTruePasswordGrant } from '../auth/goTrueClient.js'
import { assertTurnstile, turnstileSiteKeyPublic } from '../auth/turnstile.js'
import { clearAuthCookies, readAccessTokenFromRequest, setAuthCookies } from '../auth/sessionCookies.js'
import { ensureSession } from '../auth/ensureSession.js'
import { readSessionPolicy } from '../platform/sessionPolicy.js'
import { confirmPasswordForActor, markStepUp } from '../security/stepUp.js'
import { serverAuthBffEnabled } from '../auth/bffMode.js'
import { resolveRequestContext } from '../orgContext.js'
import { writeSystemLog } from '../systemLog.js'
import { recordAccess } from '../platform/trafficLog.js'
import { isHttpError } from '../httpError.js'
import type { Request } from 'express'

function clientIp(req: Request): string | null {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]?.trim() ?? null
  return req.ip ?? null
}

export function createAuthBffRouter(defaultDb: FogoDb) {
  const router = Router()

  router.get('/config', (_req, res) => {
    res.json({
      authMode: serverAuthBffEnabled() ? 'bff' : 'direct',
      turnstileSiteKey: serverAuthBffEnabled() ? turnstileSiteKeyPublic() : null,
      /** Front em produção não deve expor host Supabase — só domínio da API. */
      supabaseHidden: serverAuthBffEnabled(),
    })
  })

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      if (!serverAuthBffEnabled()) {
        res.status(404).json({ error: 'Login BFF desabilitado neste ambiente' })
        return
      }
      const body = req.body as { email?: string; password?: string; turnstileToken?: string }
      await assertTurnstile(body.turnstileToken, req.ip)

      const email = body.email?.trim()
      const password = body.password
      const ip = clientIp(req)
      if (!email || !password) {
        recordAccess({ event: 'login_failed', email: email ?? null, ip, message: 'E-mail e senha são obrigatórios', status: 400 })
        res.status(400).json({ error: 'E-mail e senha são obrigatórios' })
        return
      }

      const session = await goTruePasswordGrant(email, password)
      setAuthCookies(res, session.access_token, session.refresh_token, session.expires_in)

      recordAccess({ event: 'login', email: session.user.email ?? email, ip, message: 'Login realizado com sucesso', status: 200 })
      try {
        if (defaultDb.tenant) {
          const ctx = await resolveRequestContext(
            defaultDb.supabase,
            defaultDb.tenant,
            `Bearer ${session.access_token}`,
          )
          await writeSystemLog(ctx, {
            level: 'info',
            category: 'auth',
            message: 'Login realizado com sucesso',
            metadata: { event: 'login', email: ctx.actor?.email ?? email, ip },
          })
        }
      } catch {
        /* membership check happens on /api/me */
      }

      res.json({
        ok: true,
        user: { id: session.user.id, email: session.user.email ?? email },
        expiresIn: session.expires_in,
        sessionTtlMinutes: readSessionPolicy().ttlMinutes,
      })
    } catch (e) {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : null
      const ip = clientIp(req)
      const message = isHttpError(e) ? e.message : e instanceof Error ? e.message : 'Falha no login'
      const status = isHttpError(e) ? e.status : 401
      recordAccess({ event: 'login_failed', email, ip, message, status })
      void writeSystemLog(defaultDb, {
        level: 'warn',
        category: 'auth',
        message: 'Tentativa de login falhou',
        metadata: { event: 'login_failed', email, ip, error: message, status },
      })
      if (isHttpError(e)) {
        next(e)
        return
      }
      res.status(401).json({ error: message })
    }
  })

  router.post('/logout', async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization
      const cookieToken = readAccessTokenFromRequest(req.headers.cookie)
      const bearer =
        authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken ? cookieToken : undefined
      await goTrueLogout(bearer)
      recordAccess({
        event: 'logout',
        email: null,
        ip: clientIp(req),
        message: 'Logout',
        status: 200,
      })
      clearAuthCookies(res)
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/reauth', loginLimiter, async (req, res, next) => {
    try {
      if (!serverAuthBffEnabled()) {
        res.status(404).json({ error: 'Reautenticação BFF desabilitada neste ambiente' })
        return
      }
      const authHeader = req.headers.authorization
      const cookieToken = readAccessTokenFromRequest(req.headers.cookie)
      const bearer =
        authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken ? cookieToken : null
      if (!bearer) {
        res.status(401).json({ error: 'Sem sessão' })
        return
      }
      if (!defaultDb.tenant) {
        res.status(500).json({ error: 'Tenant padrão indisponível' })
        return
      }
      const ctx = await resolveRequestContext(
        defaultDb.supabase,
        defaultDb.tenant,
        `Bearer ${bearer}`,
      )
      if (!ctx.actor) {
        res.status(401).json({ error: 'Sessão inválida' })
        return
      }
      const body = req.body as { password?: string }
      await confirmPasswordForActor(ctx.actor.email, body.password)
      markStepUp(ctx.actor.userId, res)
      res.json({ ok: true, expiresInSec: 15 * 60 })
    } catch (e) {
      if (e instanceof Error && /credencial|senha|invalid/i.test(e.message)) {
        res.status(401).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.get('/session', async (req, res, next) => {
    try {
      if (!serverAuthBffEnabled()) {
        res.status(404).json({ error: 'Sessão BFF indisponível' })
        return
      }
      const bearer = await ensureSession(req, res, defaultDb.supabase)
      if (!bearer) {
        res.status(401).json({ error: 'Sem sessão' })
        return
      }
      const { data, error } = await defaultDb.supabase.auth.getUser(bearer)
      if (error || !data.user) {
        res.status(401).json({ error: 'Sessão inválida' })
        return
      }
      res.json({
        user: { id: data.user.id, email: data.user.email },
        expiresIn: null,
        sessionTtlMinutes: readSessionPolicy().ttlMinutes,
      })
    } catch (e) {
      res.status(401).json({ error: 'Sessão inválida ou expirada' })
    }
  })

  return router
}
