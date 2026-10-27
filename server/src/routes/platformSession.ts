import { Router } from 'express'
import type { RequestHandler } from 'express'
import type { FogoDb } from '../db.js'
import { HttpError } from '../httpError.js'
import { clampSessionTtlMinutes, readSessionPolicy, writeSessionPolicy } from '../platform/sessionPolicy.js'

export function createPlatformSessionRouter(_db: FogoDb, requirePlatformAdmin: RequestHandler) {
  const router = Router()
  router.use(requirePlatformAdmin)

  router.get('/session-policy', (_req, res) => {
    res.json(readSessionPolicy())
  })

  router.put('/session-policy', (req, res, next) => {
    try {
      const ttlMinutes = clampSessionTtlMinutes((req.body as { ttlMinutes?: unknown }).ttlMinutes)
      if ((req.body as { ttlMinutes?: unknown }).ttlMinutes == null) {
        throw new HttpError(400, 'Informe o tempo de sessão em minutos.', 'SESSION_TTL_REQUIRED')
      }
      res.json(writeSessionPolicy(ttlMinutes))
    } catch (e) {
      next(e)
    }
  })

  return router
}
