import { Router } from 'express'
import type { FogoDb } from '../db.js'
import { isHttpError } from '../httpError.js'
import type { AuthedRequest } from '../middleware/platformAdmin.js'
import { createCitySuperAdmin, listCitySuperAdmins } from '../platform/cityAdmins.js'
import {
  createPlatformAdmin,
  listPlatformAdmins,
  removePlatformAdmin,
  setPlatformAdminStatus,
} from '../platform/platformAdmins.js'

function handle(err: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (isHttpError(err)) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  next(err)
}

export function createPlatformCityAdminsRouter(
  db: FogoDb,
  requirePlatformAdmin: ReturnType<
    typeof import('../middleware/platformAdmin.js').createPlatformAdminMiddleware
  >,
) {
  const router = Router()
  router.use(requirePlatformAdmin)

  router.get('/city-admins', async (_req: AuthedRequest, res, next) => {
    try {
      const admins = await listCitySuperAdmins(db.supabase)
      res.json({ admins })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/city-admins', async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as {
        tenantId?: string
        email?: string
        displayName?: string
        password?: string
      }
      const created = await createCitySuperAdmin(db.supabase, {
        tenantId: body.tenantId?.trim() ?? '',
        email: body.email?.trim() ?? '',
        displayName: body.displayName?.trim() || undefined,
        password: body.password?.trim() || undefined,
        actor: { userId: req.authUser?.id, email: req.authUser?.email },
      })
      res.status(201).json(created)
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/platform-admins', async (_req: AuthedRequest, res, next) => {
    try {
      res.json({ admins: await listPlatformAdmins(db.supabase) })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/platform-admins', async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as { email?: string; displayName?: string; password?: string }
      const created = await createPlatformAdmin(db.supabase, {
        email: body.email?.trim() ?? '',
        displayName: body.displayName?.trim() || undefined,
        password: body.password?.trim() || undefined,
      })
      res.status(201).json(created)
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.patch('/platform-admins/:userId', async (req: AuthedRequest, res, next) => {
    try {
      const status = (req.body as { status?: string }).status
      if (status !== 'active' && status !== 'inactive') {
        res.status(400).json({ error: 'Informe status active ou inactive.', code: 'INVALID_STATUS' })
        return
      }
      const result = await setPlatformAdminStatus(db.supabase, String(req.params.userId), status, {
        userId: req.authUser!.id,
        email: req.authUser?.email,
      })
      res.json(result)
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.delete('/platform-admins/:userId', async (req: AuthedRequest, res, next) => {
    try {
      await removePlatformAdmin(db.supabase, String(req.params.userId), {
        userId: req.authUser!.id,
        email: req.authUser?.email,
      })
      res.status(204).send()
    } catch (e) {
      handle(e, res, next)
    }
  })

  return router
}
