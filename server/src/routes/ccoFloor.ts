import { Router } from 'express'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { requireAnyPermission } from '../middleware/requireAnyPermission.js'
import { actorCan } from '../permissions.js'
import { listOrgOperators } from '../members/operatorOps.js'
import { listCcoPresence } from '../ccoPresence.js'
import { listAlertSla } from '../ccoSla.js'
import { listAlerts, listIncidents } from '../repository.js'
import { memberRoleLabel } from '../../../src/lib/userDisplay.js'
import { actorCanManageSla } from '../permissions.js'
import { operatorAlertKpis } from '../../../src/lib/operatorAlertStats.js'

const OPEN = new Set(['novo', 'reconhecido', 'em atendimento', 'em observação'])
const CCO_ROLES = new Set(['admin', 'manager', 'operator'])

function db(req: FogoRequest) {
  if (!req.fogoDb) throw new Error('fogoDb missing')
  return req.fogoDb
}

export function createCcoFloorRouter() {
  const router = Router()

  router.get(
    '/floor',
    requireAnyPermission(['operators', 'alerts', 'incidents'], 'view'),
    async (req: FogoRequest, res, next) => {
      try {
        const fogo = db(req)
        const maskPii = !actorCan(fogo.actor, 'operators', 'manage')
        const [members, sla, alerts, incidents] = await Promise.all([
          listOrgOperators(fogo, { maskPii }),
          listAlertSla(fogo),
          listAlerts(fogo),
          listIncidents(fogo),
        ])
        const meId = fogo.actor?.userId
        const viewerKpis = operatorAlertKpis(alerts, incidents, meId)
        const showSla = actorCanManageSla(fogo.actor)
        const presence = listCcoPresence(fogo.orgId)
        const presenceByUser = new Map(presence.map((p) => [p.userId, p]))

        const openByClaim = new Map<string, typeof alerts>()
        for (const a of alerts) {
          if (!a.claimedBy || !OPEN.has(a.state)) continue
          const list = openByClaim.get(a.claimedBy) ?? []
          list.push(a)
          openByClaim.set(a.claimedBy, list)
        }

        const operators = members
          .filter((m) => CCO_ROLES.has(m.role) || presenceByUser.has(m.userId) || openByClaim.has(m.userId))
          .map((m) => {
            const live = presenceByUser.get(m.userId)
            const claimed = openByClaim.get(m.userId) ?? []
            const kpis = operatorAlertKpis(alerts, incidents, m.userId)
            return {
              userId: m.userId,
              displayName: m.displayName,
              email: m.email,
              role: m.role,
              roleLabel: memberRoleLabel(m.role),
              monitoring: !!live,
              occupancy: claimed.length > 0 ? ('ocupado' as const) : ('livre' as const),
              lastSeenAt: live?.lastSeenAt ?? null,
              assumedCount: kpis.assumed,
              solvedCount: kpis.solved,
              claimedAlerts: claimed.map((a) => ({
                protocol: a.id,
                title: a.title,
                severity: a.severity,
                state: a.state,
              })),
            }
          })

        const known = new Set(operators.map((o) => o.userId))
        for (const live of presence) {
          if (known.has(live.userId)) continue
          const claimed = openByClaim.get(live.userId) ?? []
          const kpis = operatorAlertKpis(alerts, incidents, live.userId)
          operators.push({
            userId: live.userId,
            displayName: live.displayName,
            email: live.email,
            role: live.role,
            roleLabel: memberRoleLabel(live.role),
            monitoring: true,
            occupancy: claimed.length > 0 ? ('ocupado' as const) : ('livre' as const),
            lastSeenAt: live.lastSeenAt,
            assumedCount: kpis.assumed,
            solvedCount: kpis.solved,
            claimedAlerts: claimed.map((a) => ({
              protocol: a.id,
              title: a.title,
              severity: a.severity,
              state: a.state,
            })),
          })
        }

        operators.sort((a, b) => {
          if (a.monitoring !== b.monitoring) return a.monitoring ? -1 : 1
          if (a.occupancy !== b.occupancy) return a.occupancy === 'ocupado' ? -1 : 1
          return a.displayName.localeCompare(b.displayName, 'pt-BR')
        })

        const monitoring = operators.filter((o) => o.monitoring).length
        res.json({
          generatedAt: new Date().toISOString(),
          counts: {
            operators: operators.length,
            monitoring,
            offline: operators.length - monitoring,
            occupied: operators.filter((o) => o.occupancy === 'ocupado').length,
            free: operators.filter((o) => o.occupancy === 'livre').length,
            totalAlerts: viewerKpis.total,
            pending: viewerKpis.pending,
            resolved: viewerKpis.resolved,
            assumed: viewerKpis.assumed,
            solved: viewerKpis.solved,
          },
          operators,
          showSla,
          sla: showSla ? sla : { summary: sla.summary, alerts: [] },
        })
      } catch (e) {
        next(e)
      }
    },
  )

  return router
}
