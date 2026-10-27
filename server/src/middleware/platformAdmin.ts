import type { NextFunction, Request, Response } from 'express'
import type { User } from '@supabase/supabase-js'
import type { FogoDb } from '../db.js'
import { readBearerFromRequest } from '../auth/requestUser.js'
import { ensureSession } from '../auth/ensureSession.js'

export type AuthedRequest = Request & {
  authUser?: User
  platformAdmin?: { isOriginal: boolean }
}

export function createPlatformAdminMiddleware(db: FogoDb) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = (await ensureSession(req, res, db.supabase)) ?? readBearerFromRequest(req)
    if (!token) {
      res.status(401).json({ error: 'Token ausente' })
      return
    }
    const { data, error } = await db.supabase.auth.getUser(token)
    if (error || !data.user) {
      res.status(401).json({ error: 'Sessão inválida' })
      return
    }
    const { data: row, error: paErr } = await db.supabase
      .from('platform_admins')
      .select('user_id, status, is_original')
      .eq('user_id', data.user.id)
      .maybeSingle()
    if (paErr) {
      res.status(500).json({ error: paErr.message })
      return
    }
    if (!row || row.status === 'inactive') {
      res.status(403).json({ error: 'Acesso restrito ao super administrador da plataforma' })
      return
    }
    req.authUser = data.user
    req.platformAdmin = { isOriginal: row.is_original === true }
    next()
  }
}
