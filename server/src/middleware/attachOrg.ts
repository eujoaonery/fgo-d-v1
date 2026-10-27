import type { NextFunction, Request, Response } from 'express'
import { AuthError, ForbiddenOrgError, resolveRequestContext, type RequestFogoDb } from '../orgContext.js'
import type { FogoDb } from '../supabase.js'
import { consumeSseTicket } from '../security/sseTickets.js'
import { readAccessTokenFromRequest } from '../auth/sessionCookies.js'
import { ensureSession } from '../auth/ensureSession.js'
import { HttpError, isHttpError } from '../httpError.js'
import { readTenantSlugFromRequest, throwIfCrossTenantBody } from '../tenant/access.js'
import { loadOrgBySlug } from '../tenant/orgs.js'

export type FogoRequest = Request & { fogoDb?: RequestFogoDb; rawBody?: string }

export function createAttachOrgMiddleware(defaultDb: FogoDb) {
  const fallbackSlug = defaultDb.orgSlug

  return async (req: FogoRequest, res: Response, next: NextFunction) => {
    try {
      let authHeader = req.headers.authorization
      if (!authHeader) {
        const fromCookie = await ensureSession(req, res, defaultDb.supabase)
        if (fromCookie) authHeader = `Bearer ${fromCookie}`
        else {
          const legacy = readAccessTokenFromRequest(req.headers.cookie)
          if (legacy) authHeader = `Bearer ${legacy}`
        }
      }
      if (!authHeader && typeof req.query.ticket === 'string') {
        const bearer = consumeSseTicket(req.query.ticket)
        if (bearer) authHeader = `Bearer ${bearer}`
      }

      const slug = readTenantSlugFromRequest(req, fallbackSlug)
      if (!slug) {
        throw new HttpError(400, 'Cidade não informada. Envie o cabeçalho X-Fogo-Tenant.', 'TENANT_REQUIRED')
      }

      const tenant = await loadOrgBySlug(defaultDb.supabase, slug)
      if (!tenant) {
        throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      }

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        throwIfCrossTenantBody(req.body)
      }

      req.fogoDb = await resolveRequestContext(defaultDb.supabase, tenant, authHeader)
      next()
    } catch (e) {
      if (e instanceof AuthError) {
        res.status(401).json({ error: e.message })
        return
      }
      if (e instanceof ForbiddenOrgError) {
        res.status(403).json({ error: e.message, code: 'CROSS_TENANT' })
        return
      }
      if (isHttpError(e)) {
        res.status(e.status).json({ error: e.message, code: e.code })
        return
      }
      next(e)
    }
  }
}
