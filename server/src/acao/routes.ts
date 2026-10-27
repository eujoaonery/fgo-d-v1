import { Router } from 'express'
import { requirePermission } from '../middleware/requirePermission.js'
import { writeAudit } from '../audit.js'
import { HttpError } from '../httpError.js'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { isAcaoStatus } from '../../../src/lib/acao.js'
import { applyAcaoTransition } from './transitions.js'
import { getAcao, listAcoes, updateAcaoStatus } from './store.js'
import { syncAcoesFromIntelligence } from './sync.js'

export function createAcaoRouter() {
  const router = Router()

  router.get('/acoes', requirePermission('acao', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      await syncAcoesFromIntelligence(db)
      const items = await listAcoes(db)
      res.json({ items })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/acoes/:id', requirePermission('acao', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const current = await getAcao(db, String(req.params.id))
      if (!current) {
        res.status(404).json({ error: 'Ação não encontrada.' })
        return
      }
      const body = (req.body ?? {}) as Record<string, unknown>
      if (!isAcaoStatus(body.status)) {
        throw new HttpError(400, 'Status inválido.')
      }
      const result = applyAcaoTransition({
        from: current.status,
        to: body.status,
        takenAction: typeof body.takenAction === 'string' ? body.takenAction : undefined,
        ignoredReason: typeof body.ignoredReason === 'string' ? body.ignoredReason : undefined,
        delegatedToName: typeof body.delegatedToName === 'string' ? body.delegatedToName : undefined,
        delegatedToUserId: typeof body.delegatedToUserId === 'string' ? body.delegatedToUserId : null,
      })
      if (!result.ok) {
        throw new HttpError(400, result.error)
      }
      const item = await updateAcaoStatus(db, current.id, result.fields)
      await writeAudit(db, 'acao.status', 'cco_action', {
        from: current.status,
        to: item.status,
        source: item.source,
        sourceId: item.sourceId,
      }, item.id)
      res.json({ item })
    } catch (e) {
      next(e)
    }
  })

  return router
}
