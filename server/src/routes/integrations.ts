import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { insertActivity } from '../repository.js'
import { safeEqualString } from '../security/safeCompare.js'

/** Ingestão demonstrativa — substituir por conectores reais (MQTT/HTTPS) na produção. */
export function createIntegrationsRouter(ingestKey: string | undefined) {
  const router = Router()

  router.post('/ingest', async (req: FogoRequest, res, next) => {
    try {
      const key = req.headers['x-fogo-ingest-key']
      const keyStr = typeof key === 'string' ? key : Array.isArray(key) ? key[0] : undefined
      if (!ingestKey || !safeEqualString(keyStr, ingestKey)) {
        res.status(401).json({ error: 'Chave de ingestão inválida' })
        return
      }
      const db = req.fogoDb
      if (!db) {
        res.status(500).json({ error: 'Contexto da organização indisponível' })
        return
      }

      const body = req.body as {
        type?: 'alert' | 'activity'
        title?: string
        message?: string
        severity?: 'informativa' | 'baixa' | 'média' | 'alta' | 'crítica'
        region?: string
        source?: string
      }

      await insertActivity(db, {
        id: `EVT-${randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        message: body.message ?? body.title ?? 'Evento de integração',
        kind: 'system',
        dataOrigin: 'integracao',
      })

      res.status(202).json({ accepted: true, organization: db.orgSlug })
    } catch (e) {
      next(e)
    }
  })

  return router
}
