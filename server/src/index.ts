import './loadEnv.js'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { createFogoDb, type FogoDb } from './db.js'
import { bootstrapForActor } from './bootstrapAccess.js'
import { getSimulationSettings, resetOperationalMonitoringData, resolveOpenOccurrences } from './repository.js'
import { actorDisplayLabel } from './actorLabel.js'
import { createAttachOrgMiddleware, type FogoRequest } from './middleware/attachOrg.js'
import { createOpsRouter } from './routes/ops.js'
import { createRoutingRouter } from './routing/http.js'
import { createStrategyRouter } from './strategy/routes.js'
import { createAlphaRouter } from './alpha/routes.js'
import { createAcaoRouter } from './acao/routes.js'
import { createIntegrationsRouter } from './routes/integrations.js'
import { createIngestPublicRouter } from './routes/ingestPublic.js'
import { createConnectorsRouter } from './routes/connectors.js'
import { createMonitoringRouter } from './routes/monitoring.js'
import { startMonitoringScheduler } from './monitoring/scheduler.js'
import { startPredictiveScheduler } from './predictive/scheduler.js'
import { runSeedIfNeeded } from './seed.js'
import { createPlatformAdminMiddleware } from './middleware/platformAdmin.js'
import { ensurePlatformSuperAdmin } from './platform/seedSuperAdmin.js'
import { createMngRouter } from './routes/mng.js'
import { createPlatformInfraRouter } from './routes/platformInfra.js'
import { createPlatformFirewallRouter } from './routes/platformFirewall.js'
import { createPlatformSessionRouter } from './routes/platformSession.js'
import { startHostMetricsSampler } from './platform/hostMetrics.js'
import { createInboundTrafficMiddleware, installOutboundFetchHook } from './platform/trafficLog.js'
import { createOrgMembersRouter } from './routes/orgMembers.js'
import { createCcoFloorRouter } from './routes/ccoFloor.js'
import { connectCcoPresence, disconnectCcoPresence, touchCcoPresence } from './ccoPresence.js'
import { ensureDefaultOrgGroupsForAll } from './members/groupOps.js'
import { writeAudit } from './audit.js'
import { requirePermission } from './middleware/requirePermission.js'
import { actorCanManageSla } from './permissions.js'
import { getCategorySlaConfig, saveCategorySlaConfig } from './orgSla.js'
import { requireStepUp } from './security/stepUp.js'
import { applySimulationPatch, syncAllDemoSimulationTimers, syncSimulationTimer } from './simulation/engine.js'
import type { SimulationIntensity } from './types.js'
import { createAuthEventsRouter } from './routes/authEvents.js'
import { createRequestLogMiddleware } from './middleware/requestLog.js'
import { writeSystemLog } from './systemLog.js'
import { createProfileRouter } from './routes/profile.js'
import { getActorProfile } from './members/profileOps.js'
import { createCorsMiddleware } from './middleware/corsConfig.js'
import { apiAuthedLimiter, authEventsLimiter, ingestLimiter } from './middleware/rateLimits.js'
import { JSON_BODY_LIMIT } from './security/constants.js'
import { issueSseTicket, purgeExpiredSseTickets } from './security/sseTickets.js'
import { readAccessTokenFromRequest } from './auth/sessionCookies.js'
import { createAuthBffRouter } from './routes/authBff.js'
import { createPublicAssetsRouter } from './routes/publicAssets.js'
import { createPublicTenantsRouter } from './routes/publicTenants.js'
import { createPlatformTenantsRouter } from './routes/platformTenants.js'
import { createPlatformCityAdminsRouter } from './routes/platformCityAdmins.js'
import { isHttpError } from './httpError.js'

const PORT = Number(process.env.FOGO_API_PORT ?? 8787)
const isProd = process.env.NODE_ENV === 'production'
const LISTEN_HOST = process.env.FOGO_API_HOST ?? (isProd ? '127.0.0.1' : '0.0.0.0')

const app = express()
installOutboundFetchHook()
startHostMetricsSampler()
app.set('trust proxy', 1)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
)
app.use(createCorsMiddleware())
app.use(cookieParser())
app.use(
  express.json({
    limit: JSON_BODY_LIMIT,
    verify: (req, _res, buf) => {
      ;(req as FogoRequest).rawBody = buf.toString('utf8')
    },
  }),
)

let defaultDb: FogoDb

app.get('/api/health', (_req, res) => {
  if (isProd) {
    res.json({ ok: true })
    return
  }
  res.json({
    ok: true,
    time: new Date().toISOString(),
    org: defaultDb?.orgSlug,
    auth: 'supabase_jwt',
  })
})

async function main() {
  defaultDb = await createFogoDb()
  await runSeedIfNeeded(defaultDb)
  await syncAllDemoSimulationTimers(defaultDb.supabase)

  const superEmail = process.env.FOGO_SUPERADMIN_EMAIL
  const superPassword = process.env.FOGO_SUPERADMIN_PASSWORD
  if (superEmail && superPassword) {
    await ensurePlatformSuperAdmin(
      defaultDb.supabase,
      superEmail,
      superPassword,
      'Super Admin Plataforma',
      defaultDb.orgId,
    )
  }
  await ensureDefaultOrgGroupsForAll(defaultDb)

  setInterval(() => purgeExpiredSseTickets(), 120_000)

  const requirePlatformAdmin = createPlatformAdminMiddleware(defaultDb)
  app.use('/api', createInboundTrafficMiddleware())
  app.use('/api/mng', createPlatformTenantsRouter(defaultDb, requirePlatformAdmin))
  app.use('/api/mng', createPlatformCityAdminsRouter(defaultDb, requirePlatformAdmin))
  app.use('/api/mng', createMngRouter(defaultDb, requirePlatformAdmin))
  app.use('/api/mng', createPlatformInfraRouter(defaultDb, requirePlatformAdmin))
  app.use('/api/mng', createPlatformFirewallRouter(defaultDb, requirePlatformAdmin))
  app.use('/api/mng', createPlatformSessionRouter(defaultDb, requirePlatformAdmin))
  app.use('/api/tenants', createPublicTenantsRouter(defaultDb))

  app.use('/api/integrations', ingestLimiter, createIngestPublicRouter(defaultDb))
  app.use(
    '/api/integrations',
    ingestLimiter,
    (req: FogoRequest, _res, next) => {
      req.fogoDb = defaultDb
      next()
    },
    createIntegrationsRouter(process.env.FOGO_INGEST_KEY),
  )

  app.use('/api/public', createPublicAssetsRouter(defaultDb))
  app.use('/api/auth', createAuthBffRouter(defaultDb))
  app.use('/api/auth', authEventsLimiter, createAuthEventsRouter(defaultDb))

  const attachOrg = createAttachOrgMiddleware(defaultDb)
  app.use('/api', apiAuthedLimiter)
  app.use('/api', attachOrg)
  app.use('/api', createRequestLogMiddleware(() => defaultDb))

  app.get('/api/me', async (req: FogoRequest, res, next) => {
    try {
      const d = req.fogoDb!
      const actor = d.actor
      if (!actor) {
        res.status(401).json({ error: 'Sessão inválida' })
        return
      }
      const { data: org } = await d.supabase
        .from('organizations')
        .select('name, cities(name)')
        .eq('id', d.orgId)
        .single()
      const cities = org?.cities as { name: string }[] | null
      const userProfile = await getActorProfile(d)
      const tenant = d.tenant
      res.json({
        organizationId: d.orgId,
        organizationSlug: d.orgSlug,
        tenantName: org?.name ?? tenant?.name ?? d.orgSlug,
        cityName: cities?.[0]?.name ?? null,
        isPlatformSuperAdmin: actor.isPlatformSuperAdmin === true,
        tenant: tenant
          ? {
              id: tenant.id,
              slug: tenant.slug,
              name: tenant.name,
              status: tenant.status,
              operationMode: tenant.operationMode,
              timezone: tenant.timezone,
              locale: tenant.locale,
              description: tenant.description,
            }
          : null,
        actor: {
          userId: actor.userId,
          email: actor.email,
          role: actor.role,
          displayName: userProfile?.displayName ?? actor.displayName ?? actor.email?.split('@')[0] ?? null,
          avatarUrl: userProfile?.avatarUrl ?? null,
          scopeRegion: actor.scopeRegion ?? null,
          scopeOrg: actor.scopeOrg ?? null,
          locationShareUntil: actor.locationShareUntil ?? null,
        },
        mustChangePassword: userProfile?.mustChangePassword ?? false,
        permissions: actor.permissions,
      })
    } catch (e) {
      next(e)
    }
  })

  app.get('/api/bootstrap', async (req: FogoRequest, res, next) => {
    try {
      res.json(await bootstrapForActor(req.fogoDb!))
    } catch (e) {
      next(e)
    }
  })

  app.get('/api/settings/simulation', requirePermission('settings', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json(await getSimulationSettings(req.fogoDb!))
    } catch (e) {
      next(e)
    }
  })

  app.get('/api/settings/sla', async (req: FogoRequest, res, next) => {
    try {
      if (!actorCanManageSla(req.fogoDb?.actor)) {
        res.status(403).json({ error: 'SLA por categoria é visível só para administradores e gestores.' })
        return
      }
      res.json(await getCategorySlaConfig(req.fogoDb!))
    } catch (e) {
      next(e)
    }
  })

  app.patch('/api/settings/sla', async (req: FogoRequest, res, next) => {
    try {
      if (!actorCanManageSla(req.fogoDb?.actor)) {
        res.status(403).json({ error: 'Somente administradores e gestores configuram o SLA.' })
        return
      }
      const body = req.body as { minutesByCategory?: Record<string, number> }
      const nextSla = await saveCategorySlaConfig(req.fogoDb!, body.minutesByCategory ?? {})
      await writeAudit(req.fogoDb!, 'settings.sla', 'sla', body.minutesByCategory ?? {})
      res.json(nextSla)
    } catch (e) {
      next(e)
    }
  })

  app.patch('/api/settings/simulation', requirePermission('settings', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const body = req.body as {
        enabled?: boolean
        intensity?: SimulationIntensity
        tickIntervalMs?: number
      }
      const nextSettings = await applySimulationPatch(req.fogoDb!, {
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
        ...(body.intensity ? { intensity: body.intensity } : {}),
        ...(typeof body.tickIntervalMs === 'number' ? { tickIntervalMs: body.tickIntervalMs } : {}),
      })
      await writeAudit(req.fogoDb!, 'settings.simulation', 'simulation', body)
      res.json(nextSettings)
    } catch (e) {
      next(e)
    }
  })

  app.post('/api/settings/occurrences/resolve', requirePermission('settings', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const result = await resolveOpenOccurrences(req.fogoDb!, actorDisplayLabel(req.fogoDb?.actor))
      await writeAudit(req.fogoDb!, 'occurrences.resolve_open', 'alert', result)
      res.json(result)
    } catch (e) {
      next(e)
    }
  })

  app.post(
    '/api/settings/monitoring/reset',
    requirePermission('settings', 'manage'),
    requireStepUp,
    async (req: FogoRequest, res, next) => {
      try {
        const simulation = await resetOperationalMonitoringData(req.fogoDb!)
        await syncSimulationTimer(req.fogoDb!)
        await writeAudit(req.fogoDb!, 'monitoring.reset', 'simulation', { paused: true })
        res.json({ ok: true, simulation })
      } catch (e) {
        next(e)
      }
    },
  )

  app.post('/api/events/stream-ticket', async (req: FogoRequest, res, next) => {
    try {
      if (!req.fogoDb?.actor) {
        res.status(401).json({ error: 'Autenticação necessária' })
        return
      }
      const header = req.headers.authorization
      const token = header?.startsWith('Bearer ')
        ? header.slice(7)
        : (readAccessTokenFromRequest(req.headers.cookie) ?? null)
      if (!token) {
        res.status(401).json({ error: 'Token ausente' })
        return
      }
      const ticket = issueSseTicket(token)
      res.json({ ticket, expiresInSec: 60 })
    } catch (e) {
      next(e)
    }
  })

  app.use('/api/me/profile', createProfileRouter())
  app.use('/api/org', createOrgMembersRouter())
  app.use('/api/cco', createCcoFloorRouter())
  app.use('/api', createStrategyRouter())
  app.use('/api', createAlphaRouter())
  app.use('/api', createAcaoRouter())
  app.use('/api', createOpsRouter())
  app.use('/api', createRoutingRouter())
  app.use('/api', createConnectorsRouter())
  app.use('/api', createMonitoringRouter())
  startMonitoringScheduler(defaultDb.supabase)
  startPredictiveScheduler(defaultDb.supabase)

  app.get('/api/events/stream', async (req: FogoRequest, res, next) => {
    try {
      if (!req.fogoDb?.actor) {
        res.status(401).json({ error: 'Autenticação necessária' })
        return
      }
      const actor = req.fogoDb.actor
      const orgId = req.fogoDb.orgId
      const connectionId = connectCcoPresence(orgId, {
        userId: actor.userId,
        displayName: actor.displayName,
        email: actor.email,
        role: actor.role,
      })
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      let lastTick = ''
      const send = async () => {
        touchCcoPresence(orgId, actor.userId)
        const sim = await getSimulationSettings(req.fogoDb!)
        const tickKey = `${sim.lastTickAt ?? ''}-${sim.ticksTotal}`
        const dataChanged = tickKey !== lastTick && lastTick !== ''
        lastTick = tickKey
        res.write(
          `event: heartbeat\ndata: ${JSON.stringify({
            type: 'ops-heartbeat',
            serverTime: new Date().toISOString(),
            simulationEnabled: sim.enabled,
            lastTickAt: sim.lastTickAt ?? null,
            ticksTotal: sim.ticksTotal,
            dataChanged,
          })}\n\n`,
        )
      }

      await send()
      const interval = setInterval(() => void send().catch(() => clearInterval(interval)), 3000)
      req.on('close', () => {
        clearInterval(interval)
        disconnectCcoPresence(orgId, actor.userId, connectionId)
      })
    } catch (e) {
      if (!res.headersSent) next(e)
      else res.end()
    }
  })

  app.use((err: unknown, req: FogoRequest, res: express.Response, _next: express.NextFunction) => {
    console.error('[fogo] API error', err)
    const db = req.fogoDb ?? defaultDb
    const message = err instanceof Error ? err.message : 'Erro interno'
    void writeSystemLog(db, {
      level: 'error',
      category: 'system',
      message: message.slice(0, 500),
      metadata: {
        path: req.path,
        method: req.method,
      },
    })
    if (res.headersSent) return
    if (isHttpError(err)) {
      res.status(err.status).json({ error: err.message, code: err.code })
      return
    }
    res.status(500).json({ error: isProd ? 'Erro interno' : message })
  })

  app.listen(PORT, LISTEN_HOST, () => {
    console.log(
      `[fogo] API http://${LISTEN_HOST}:${PORT} org=${defaultDb.orgSlug} auth=supabase_jwt`,
    )
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
