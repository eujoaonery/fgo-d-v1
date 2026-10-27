import { Router } from 'express'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { requirePermission } from '../middleware/requirePermission.js'
import { writeAudit } from '../audit.js'
import { HttpError } from '../httpError.js'
import { listTeams } from '../repository.js'
import { validateCoordinates } from '../../../src/lib/mariliaGeo.js'
import { parseMapMunicipality } from '../../../src/lib/mapMunicipality.js'
import { routeAlongStreets, tripOptimize, type LatLng } from './osrm.js'
import { applyWaypointOrder, assertSameAgent, detectScheduleConflicts, nearestNeighborOrder } from './planner.js'
import { geocodeAddress, loadRoutableOrders, originFromTeam } from './resolve.js'
import { duplicateRoute, getSavedRoute, insertRoute, listRouteHistory, listSavedRoutes, updateRoute } from './store.js'

function dbOf(req: FogoRequest) {
  if (!req.fogoDb) throw new HttpError(500, 'Contexto da cidade ausente.')
  return req.fogoDb
}

function asHttp(e: unknown): never {
  if (e instanceof HttpError) throw e
  const msg = e instanceof Error ? e.message : 'Falha na operação de rotas.'
  if (/não encontrad/i.test(msg)) throw new HttpError(404, msg)
  if (/alterada por outra/i.test(msg)) throw new HttpError(409, msg)
  if (/em execução ou concluída/i.test(msg)) throw new HttpError(409, msg)
  if (/roteamento|trajeto|otimizar|OSRM|indispon/i.test(msg)) throw new HttpError(502, msg)
  throw new HttpError(400, msg)
}

export function createRoutingRouter() {
  const router = Router()

  router.get('/routes/orders', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store')
      res.json(await loadRoutableOrders(dbOf(req)))
    } catch (e) {
      next(e)
    }
  })

  router.post('/routes/geocode', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const q = String((req.body as { q?: string }).q ?? '').trim()
      if (q.length < 3) {
        res.status(400).json({ error: 'Informe um endereço com pelo menos 3 caracteres.' })
        return
      }
      const hit = await geocodeAddress(q)
      if (!hit) {
        res.status(404).json({ error: 'Endereço não localizado.' })
        return
      }
      res.json(hit)
    } catch (e) {
      next(e)
    }
  })

  router.post('/routes/plan', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json(await planRoute(dbOf(req), req.body as PlanBody).catch(asHttp))
    } catch (e) {
      next(e)
    }
  })

  router.get('/routes', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json(await listSavedRoutes(dbOf(req)))
    } catch (e) {
      next(e)
    }
  })

  router.get('/routes/mine', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const all = await listSavedRoutes(dbOf(req))
      const email = req.fogoDb?.actor?.email?.toLowerCase()
      const name = req.fogoDb?.actor?.displayName?.toLowerCase()
      const mine = all.filter((r) => {
        const agent = r.agentName.toLowerCase()
        return (email && agent.includes(email.split('@')[0] ?? '')) || (name && agent.includes(name))
      })
      res.json(mine)
    } catch (e) {
      next(e)
    }
  })

  router.get('/routes/:id/history', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json(await listRouteHistory(dbOf(req), String(req.params.id)))
    } catch (e) {
      next(e)
    }
  })

  router.get('/routes/:id', requirePermission('routes', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const row = await getSavedRoute(dbOf(req), String(req.params.id))
      if (!row) {
        res.status(404).json({ error: 'Rota não encontrada.' })
        return
      }
      res.json(row)
    } catch (e) {
      next(e)
    }
  })

  router.post('/routes', requirePermission('routes', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const planned = await planRoute(dbOf(req), req.body as PlanBody).catch(asHttp)
      const body = req.body as PlanBody
      const saved = await insertRoute(dbOf(req), {
        name: body.name?.trim() || `Rota ${planned.agentName}`,
        plannedDate: body.plannedDate ?? null,
        notes: body.notes ?? null,
        status: body.status === 'draft' ? 'draft' : 'planned',
        agentId: planned.agentId,
        agentName: planned.agentName,
        origin: planned.origin,
        street: planned.street,
        stops: planned.stops,
        conflicts: planned.conflicts,
        scheduleValidated: planned.scheduleValidated,
      }).catch(asHttp)
      await writeAudit(dbOf(req), 'route.create', 'operational_route', { id: saved.id, name: saved.name })
      res.status(201).json(saved)
    } catch (e) {
      next(e)
    }
  })

  router.patch('/routes/:id', requirePermission('routes', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const body = req.body as PlanBody & { expectedUpdatedAt?: string; status?: 'planned' | 'draft' | 'cancelled' | 'available' }
      let patch: Parameters<typeof updateRoute>[2] = {
        name: body.name,
        plannedDate: body.plannedDate,
        notes: body.notes,
        status: body.status,
        expectedUpdatedAt: body.expectedUpdatedAt,
      }
      if (body.incidentIds?.length || body.stopOrder?.length) {
        const planned = await planRoute(dbOf(req), body).catch(asHttp)
        patch = {
          ...patch,
          origin: planned.origin,
          street: planned.street,
          stops: planned.stops,
          conflicts: planned.conflicts,
          scheduleValidated: planned.scheduleValidated,
        }
      }
      const saved = await updateRoute(dbOf(req), String(req.params.id), patch).catch(asHttp)
      await writeAudit(dbOf(req), body.status === 'cancelled' ? 'route.cancel' : 'route.update', 'operational_route', {
        id: saved.id,
      })
      res.json(saved)
    } catch (e) {
      next(e)
    }
  })

  router.post('/routes/:id/duplicate', requirePermission('routes', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const copy = await duplicateRoute(dbOf(req), String(req.params.id)).catch(asHttp)
      await writeAudit(dbOf(req), 'route.duplicate', 'operational_route', { from: req.params.id, id: copy.id })
      res.status(201).json(copy)
    } catch (e) {
      next(e)
    }
  })

  return router
}

type PlanBody = {
  incidentIds?: string[]
  stopOrder?: string[]
  optimize?: boolean
  origin?: { lat: number; lng: number; description?: string }
  name?: string
  plannedDate?: string | null
  notes?: string | null
  status?: string
}

async function planRoute(db: ReturnType<typeof dbOf>, body: PlanBody) {
  const ids = body.stopOrder?.length ? body.stopOrder : body.incidentIds ?? []
  if (!ids.length) throw new HttpError(400, 'Selecione ao menos uma ordem de serviço.')
  const { orders, agents } = await loadRoutableOrders(db)
  const selected = ids.map((id) => {
    const row = orders.find((o) => o.incidentId === id)
    if (!row) throw new HttpError(400, `Ordem ${id} não está agendada ou não existe.`)
    if (!row.eligible) throw new HttpError(400, `${id}: ${row.blockReason}`)
    return row
  })
  const { agentId, agentName } = assertSameAgent(selected)
  const teams = await listTeams(db)
  const team = teams.find((t) => t.id === agentId)
  let origin = agents.find((a) => a.agentId === agentId) ?? (team ? originFromTeam(team) : null)
  if (body.origin) {
    const area = parseMapMunicipality(db.tenant?.settings)
    const check = validateCoordinates(body.origin.lat, body.origin.lng, area?.bbox, area ? `${area.name}/${area.uf}` : undefined)
    if (!check.ok) throw new HttpError(400, check.error)
    origin = {
      agentId,
      agentName,
      lat: body.origin.lat,
      lng: body.origin.lng,
      description: body.origin.description || 'Ponto informado no mapa',
      source: 'manual',
    }
  }
  if (!origin) throw new HttpError(400, 'Informe o ponto de partida no mapa. O agente não tem localização cadastrada.')

  let ordered = selected
  if (!body.stopOrder?.length && body.optimize !== false && selected.length > 1) {
    ordered = nearestNeighborOrder({ lat: origin.lat, lng: origin.lng }, selected)
  }

  const points: LatLng[] = [{ lat: origin.lat, lng: origin.lng }, ...ordered.map((s) => ({ lat: s.lat, lng: s.lng }))]
  let street
  let usedAdvanced = false
  try {
    if (!body.stopOrder?.length && body.optimize !== false && ordered.length > 1) {
      street = await tripOptimize(points)
      usedAdvanced = street.optimized
      ordered = applyWaypointOrder(ordered, street.waypointOrder)
    } else {
      street = await routeAlongStreets(points)
    }
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : 'Falha no cálculo da rota.')
  }

  const { conflicts, scheduleValidated } = detectScheduleConflicts(
    ordered,
    street.legs.map((l) => l.durationSeconds),
  )

  return {
    agentId,
    agentName,
    origin,
    stops: ordered,
    street,
    conflicts,
    scheduleValidated,
    optimization: usedAdvanced
      ? 'osrm-trip'
      : ordered.length > 1
        ? 'nearest-neighbor'
        : 'single-stop',
    optimizationNote: usedAdvanced
      ? 'Sequência sugerida pelo roteador viário. Não é garantia de ótimo global.'
      : ordered.length > 1
        ? 'Sequência por menor deslocamento local. Sem otimização avançada do provedor.'
        : 'Uma única parada.',
  }
}
