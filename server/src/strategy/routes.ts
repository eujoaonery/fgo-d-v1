import { Router } from 'express'
import { requirePermission } from '../middleware/requirePermission.js'
import { writeAudit } from '../audit.js'
import type { FogoRequest } from '../middleware/attachOrg.js'
import type { StrategicActionType } from '../../../src/lib/strategy.js'
import { ACTION_CATALOG } from '../../../src/lib/strategy.js'
import { buildStrategySnapshot } from './snapshot.js'
import { getPrometheusState, runPrometheus, suggestActionPayload } from './prometheus.js'
import {
  ActionError,
  approveAndExecute,
  catalogWithChannels,
  createActionDraft,
  proposeTeamRedistribution,
  requestApproval,
} from './actions.js'
import { getStrategicAction, listStrategicActions } from './store.js'
import { listAssets, listTeams } from '../repository.js'

function handleActionError(res: { status: (n: number) => { json: (b: unknown) => void } }, e: unknown) {
  if (e instanceof ActionError) {
    const code = e.code === 'NOT_FOUND' ? 404 : e.code === 'VALIDATION' ? 400 : 409
    res.status(code).json({ error: e.message, code: e.code })
    return true
  }
  return false
}

export function createStrategyRouter() {
  const router = Router()

  router.get('/strategy/snapshot', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const snapshot = await buildStrategySnapshot(req.fogoDb!)
      const prometheus = await getPrometheusState(req.fogoDb!, snapshot)
      const actions = await listStrategicActions(req.fogoDb!)
      res.json({ snapshot, prometheus, actions, catalog: await catalogWithChannels(req.fogoDb!) })
    } catch (e) {
      next(e)
    }
  })

  router.post('/strategy/prometheus', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const snapshot = await buildStrategySnapshot(req.fogoDb!)
      const prometheus = await runPrometheus(req.fogoDb!, snapshot)
      await writeAudit(req.fogoDb!, 'strategy.prometheus', 'strategy', {
        stale: prometheus.stale,
        available: prometheus.available,
      })
      res.json(prometheus)
    } catch (e) {
      next(e)
    }
  })

  router.get('/strategy/actions', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json({ actions: await listStrategicActions(req.fogoDb!), catalog: await catalogWithChannels(req.fogoDb!) })
    } catch (e) {
      next(e)
    }
  })

  router.get('/strategy/actions/:protocol', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const action = await getStrategicAction(req.fogoDb!, req.params.protocol)
      if (!action) {
        res.status(404).json({ error: 'Ação não encontrada' })
        return
      }
      res.json(action)
    } catch (e) {
      next(e)
    }
  })

  router.post('/strategy/actions/suggest', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const actionType = req.body?.actionType as StrategicActionType
      if (!ACTION_CATALOG.some((a) => a.type === actionType)) {
        res.status(400).json({ error: 'Tipo de ação inválido' })
        return
      }
      const snapshot = await buildStrategySnapshot(req.fogoDb!)
      const prometheus = await getPrometheusState(req.fogoDb!, snapshot)
      const suggestion = await suggestActionPayload(req.fogoDb!, snapshot, actionType, prometheus)
      res.json(suggestion)
    } catch (e) {
      next(e)
    }
  })

  router.post('/strategy/actions/preview-mobilize', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const teams = await listTeams(req.fogoDb!)
      const region = typeof req.body?.region === 'string' ? req.body.region : ''
      const teamIds = Array.isArray(req.body?.teamIds) ? req.body.teamIds.map(String) : []
      res.json(proposeTeamRedistribution(teams, region, teamIds))
    } catch (e) {
      next(e)
    }
  })

  router.post('/strategy/actions', requirePermission('strategy', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const body = req.body ?? {}
      const action = await createActionDraft(req.fogoDb!, {
        actionType: body.actionType,
        payload: body.payload ?? {},
        justification: String(body.justification ?? body.payload?.reason ?? body.payload?.justification ?? ''),
        region: String(body.region ?? body.payload?.region ?? ''),
        title: body.title,
        requestApproval: body.requestApproval === true,
      })
      await writeAudit(req.fogoDb!, 'strategy.action.create', 'strategy', {
        protocol: action.protocol,
        type: action.actionType,
        status: action.status,
      })
      res.status(201).json(action)
    } catch (e) {
      if (!handleActionError(res, e)) next(e)
    }
  })

  router.post('/strategy/actions/:protocol/approve', requirePermission('strategy', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const mode = req.body?.mode === 'request' ? 'request' : 'execute'
      const action =
        mode === 'request'
          ? await requestApproval(req.fogoDb!, req.params.protocol)
          : await approveAndExecute(req.fogoDb!, req.params.protocol)
      await writeAudit(req.fogoDb!, `strategy.action.${mode}`, 'strategy', {
        protocol: action.protocol,
        status: action.status,
      })
      res.json(action)
    } catch (e) {
      if (!handleActionError(res, e)) next(e)
    }
  })

  router.get('/strategy/assets-lite', requirePermission('strategy', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const assets = await listAssets(req.fogoDb!)
      res.json(
        assets.map((a) => ({
          id: a.id,
          name: a.name,
          region: a.region,
          status: a.status,
          category: a.category,
        })),
      )
    } catch (e) {
      next(e)
    }
  })

  return router
}
