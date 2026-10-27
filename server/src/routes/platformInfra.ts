import { Router } from 'express'
import type { RequestHandler } from 'express'
import type { FogoDb } from '../db.js'
import { hostIdentity, readHostMetrics } from '../platform/hostMetrics.js'
import { readTrafficSnapshot, type AccessEntry } from '../platform/trafficLog.js'
import { listPlatformAuthLogs } from '../systemLog.js'

function mergeAccess(live: AccessEntry[], persisted: AccessEntry[]): AccessEntry[] {
  const seen = new Set(live.map((a) => `${a.at}|${a.event}|${a.email ?? ''}|${a.message}`))
  const extra = persisted.filter((a) => !seen.has(`${a.at}|${a.event}|${a.email ?? ''}|${a.message}`))
  return [...live, ...extra].slice(0, 250)
}

export function createPlatformInfraRouter(db: FogoDb, requirePlatformAdmin: RequestHandler) {
  const router = Router()
  router.use(requirePlatformAdmin)

  router.get('/infra', async (_req, res, next) => {
    try {
      const metrics = readHostMetrics()
      const traffic = readTrafficSnapshot()
      const persisted = await listPlatformAuthLogs(db, 150)
      res.json({
        host: hostIdentity(),
        current: metrics.current,
        series: metrics.series,
        historyHour: metrics.historyHour,
        historyDay: metrics.historyDay,
        historyWeek: metrics.historyWeek,
        inbound: traffic.inbound,
        outbound: traffic.outbound,
        access: mergeAccess(traffic.access, persisted),
      })
    } catch (e) {
      next(e)
    }
  })

  return router
}
