import { Router } from 'express'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { requirePermission } from '../middleware/requirePermission.js'
import { writeAudit } from '../audit.js'
import {
  createCheck,
  createConnector,
  deleteCheck,
  deleteConnector,
  getConnector,
  listChecks,
  listConnectors,
  loadSecrets,
  touchConnector,
  updateCheck,
  updateConnector,
} from '../connectors/store.js'
import { allowPrivateTargets, runAdapter } from '../connectors/registry.js'
import { ingestCandidates } from '../ingest/pipeline.js'
import { enqueueJob } from '../ingest/queue.js'
import { executeCheck } from '../monitoring/runner.js'
import { HttpError } from '../httpError.js'
import { sanitizeLogObject } from '../connectors/sanitize.js'
import { actorCan, actorCanManageSla } from '../permissions.js'
import {
  getPrometheusIntegrationStatus,
  loadPrometheusCredentials,
  savePrometheusIntegration,
  testOpenAiKey,
} from '../orgIntegrations.js'

function db(req: FogoRequest) {
  if (!req.fogoDb) throw new Error('fogoDb missing')
  return req.fogoDb
}

export function createConnectorsRouter() {
  const router = Router()

  router.get('/integrations/catalog', requirePermission('integrations', 'view'), (_req, res) => {
    res.json({ catalog: [] })
  })

  router.get('/integrations/icmp-monitors', requirePermission('integrations', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const checks = (await listChecks(d.supabase, d.orgId)).filter((c) => c.kind === 'icmp')
      const { data: assets } = await d.supabase
        .from('assets')
        .select('external_id, name, category, region, status')
        .eq('organization_id', d.orgId)
      const { data: states } = await d.supabase
        .from('asset_monitor_states')
        .select('asset_external_id, state, consecutive_failures, last_check_at, last_ok_at, reason')
        .eq('organization_id', d.orgId)
      const assetById = new Map((assets ?? []).map((a) => [String(a.external_id), a]))
      const stateById = new Map((states ?? []).map((s) => [String(s.asset_external_id), s]))
      res.json({
        operationMode: d.tenant?.operationMode ?? 'demo',
        monitors: checks.map((c) => {
          const asset = c.assetExternalId ? assetById.get(c.assetExternalId) : undefined
          const st = c.assetExternalId ? stateById.get(c.assetExternalId) : undefined
          return {
            id: c.id,
            assetId: c.assetExternalId,
            assetName: asset?.name ?? c.name,
            category: asset?.category ?? null,
            region: asset?.region ?? null,
            host: String(c.config.host ?? ''),
            enabled: c.enabled,
            lastRunAt: c.lastRunAt,
            lastCheckAt: st?.last_check_at ?? null,
            lastOkAt: st?.last_ok_at ?? null,
            consecutiveFailures: Number(st?.consecutive_failures ?? 0),
            state: st?.state ?? 'unknown',
            reason: st?.reason ?? null,
          }
        }),
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/integrations/prometheus', requirePermission('integrations', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json(await getPrometheusIntegrationStatus(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.patch('/integrations/prometheus', async (req: FogoRequest, res, next) => {
    try {
      const actor = req.fogoDb?.actor
      if (!actorCan(actor, 'integrations', 'manage') && !actorCanManageSla(actor)) {
        res.status(403).json({ error: 'Sem permissão para configurar o PROMETHEUS.' })
        return
      }
      const body = req.body as {
        apiKey?: string | null
        clearKey?: boolean
        model?: string
        channels?: Partial<Record<string, string | null>>
      }
      const next = await savePrometheusIntegration(db(req), body)
      await writeAudit(db(req), 'integrations.prometheus', 'integration', {
        model: next.openai.model,
        keyUpdated: Boolean(body.apiKey) || body.clearKey === true,
        channels: Object.keys(body.channels ?? {}),
      })
      res.json(next)
    } catch (e) {
      next(e)
    }
  })

  router.post('/integrations/prometheus/test', async (req: FogoRequest, res, next) => {
    try {
      const actor = req.fogoDb?.actor
      if (!actorCan(actor, 'integrations', 'manage') && !actorCanManageSla(actor)) {
        res.status(403).json({ error: 'Sem permissão para testar o PROMETHEUS.' })
        return
      }
      const body = req.body as { apiKey?: string; model?: string }
      const draft = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      const creds = await loadPrometheusCredentials(db(req))
      const key = draft || creds.apiKey || ''
      const result = await testOpenAiKey(key, body.model || creds.model)
      res.json(result)
    } catch (e) {
      next(e)
    }
  })

  router.get('/integrations/connectors', requirePermission('integrations', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json({ connectors: await listConnectors(db(req).supabase, db(req).orgId) })
    } catch (e) {
      next(e)
    }
  })

  router.post('/integrations/connectors', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const body = req.body as {
        kind?: string
        name?: string
        description?: string
        config?: Record<string, unknown>
        enabled?: boolean
        secrets?: Record<string, string>
      }
      if (!body.kind || !body.name?.trim()) {
        res.status(400).json({ error: 'Informe tipo e nome do conector.' })
        return
      }
      const created = await createConnector(db(req).supabase, db(req).orgId, {
        kind: body.kind,
        name: body.name,
        description: body.description,
        config: body.config,
        enabled: body.enabled,
        secrets: body.secrets,
        createdBy: db(req).actor?.userId,
      })
      await writeAudit(db(req), 'connector.create', 'connector', { kind: created.kind, name: created.name }, created.id)
      res.status(201).json({ connector: created })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/integrations/connectors/:id', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const updated = await updateConnector(db(req).supabase, db(req).orgId, req.params.id, req.body ?? {})
      await writeAudit(db(req), 'connector.update', 'connector', { name: updated.name }, updated.id)
      res.json({ connector: updated })
    } catch (e) {
      next(e)
    }
  })

  router.delete('/integrations/connectors/:id', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      await deleteConnector(db(req).supabase, db(req).orgId, req.params.id)
      await writeAudit(db(req), 'connector.delete', 'connector', {}, req.params.id)
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/integrations/connectors/:id/test', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const connector = await getConnector(d.supabase, d.orgId, req.params.id)
      if (!connector) throw new HttpError(404, 'Conector não encontrado.')
      const secrets = await loadSecrets(d.supabase, d.orgId, connector.secretId)
      const result = await runAdapter('test', connector, {
        organizationId: d.orgId,
        orgSlug: d.orgSlug,
        secrets,
        allowPrivate: allowPrivateTargets(d.actor?.isPlatformSuperAdmin, connector.config),
      })
      await touchConnector(d.supabase, d.orgId, connector.id, {
        ok: result.ok,
        error: result.error,
        metrics: { lastTestResult: result.result, latencyMs: result.latencyMs ?? null },
      })
      await writeAudit(d, 'connector.test', 'connector', { ok: result.ok, result: result.result }, connector.id)
      res.json({ result: { ...result, detail: sanitizeLogObject(result.detail) } })
    } catch (e) {
      next(e)
    }
  })

  router.post('/integrations/connectors/:id/execute', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const connector = await getConnector(d.supabase, d.orgId, req.params.id)
      if (!connector) throw new HttpError(404, 'Conector não encontrado.')
      const secrets = await loadSecrets(d.supabase, d.orgId, connector.secretId)
      const result = await runAdapter('execute', connector, {
        organizationId: d.orgId,
        orgSlug: d.orgSlug,
        secrets,
        allowPrivate: allowPrivateTargets(d.actor?.isPlatformSuperAdmin, connector.config),
        configOverride: req.body?.payload != null ? { payload: req.body.payload } : undefined,
      })
      let ingest = { accepted: 0, duplicate: 0, rejected: 0, ids: [] as string[] }
      if (result.ingest?.length) {
        ingest = await ingestCandidates(d.supabase, {
          organizationId: d.orgId,
          connectorId: connector.id,
          sourceKind: connector.kind,
        }, result.ingest)
      }
      await touchConnector(d.supabase, d.orgId, connector.id, { ok: result.ok, error: result.error })
      res.json({ result: { ...result, detail: sanitizeLogObject(result.detail), ingest: undefined }, ingest })
    } catch (e) {
      next(e)
    }
  })

  router.get('/integrations/events', requirePermission('integrations', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const { data, error } = await db(req).supabase
        .from('ingest_events')
        .select('id, connector_id, source_kind, received_at, status, error, data_origin, payload_hash')
        .eq('organization_id', db(req).orgId)
        .order('received_at', { ascending: false })
        .limit(100)
      if (error) throw new HttpError(500, error.message)
      res.json({ events: data ?? [] })
    } catch (e) {
      next(e)
    }
  })

  router.get('/integrations/deliveries', requirePermission('integrations', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const { data, error } = await db(req).supabase
        .from('outbound_webhook_deliveries')
        .select('*')
        .eq('organization_id', db(req).orgId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new HttpError(500, error.message)
      res.json({ deliveries: data ?? [] })
    } catch (e) {
      next(e)
    }
  })

  router.post('/integrations/events/:id/reprocess', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const { data: event, error } = await d.supabase
        .from('ingest_events')
        .select('*')
        .eq('organization_id', d.orgId)
        .eq('id', req.params.id)
        .maybeSingle()
      if (error) throw new HttpError(500, error.message)
      if (!event) throw new HttpError(404, 'Evento não encontrado.')
      if (event.status === 'rejected') {
        res.status(409).json({ error: 'Evento rejeitado não é reprocessado automaticamente.' })
        return
      }
      const job = await enqueueJob(d.supabase, {
        organizationId: d.orgId,
        kind: 'recompute_state',
        refId: String(event.id),
        payload: { ingestEventId: event.id, assetExternalId: null },
      })
      await writeAudit(d, 'ingest.reprocess', 'ingest_event', { jobId: job }, String(event.id))
      res.json({ queued: true, jobId: job })
    } catch (e) {
      next(e)
    }
  })

  router.post('/integrations/deliveries/:id/retry', requirePermission('integrations', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const { data: row } = await d.supabase
        .from('outbound_webhook_deliveries')
        .select('*')
        .eq('organization_id', d.orgId)
        .eq('id', req.params.id)
        .maybeSingle()
      if (!row) throw new HttpError(404, 'Entrega não encontrada.')
      const job = await enqueueJob(d.supabase, {
        organizationId: d.orgId,
        kind: 'webhook_out',
        refId: String(row.id),
        payload: { eventType: row.event_type, retryDeliveryId: row.id },
      })
      res.json({ queued: true, jobId: job })
    } catch (e) {
      next(e)
    }
  })

  router.get('/monitoring/checks', requirePermission('techMonitor', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json({ checks: await listChecks(db(req).supabase, db(req).orgId) })
    } catch (e) {
      next(e)
    }
  })

  router.post('/monitoring/checks', requirePermission('techMonitor', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const body = req.body as {
        name?: string
        kind?: string
        assetExternalId?: string
        connectorId?: string
        config?: Record<string, unknown>
        enabled?: boolean
      }
      if (!body.name?.trim() || !body.kind) {
        res.status(400).json({ error: 'Informe nome e tipo da verificação.' })
        return
      }
      const created = await createCheck(db(req).supabase, db(req).orgId, {
        name: body.name,
        kind: body.kind,
        assetExternalId: body.assetExternalId,
        connectorId: body.connectorId,
        config: body.config,
        enabled: body.enabled,
      })
      await writeAudit(db(req), 'monitoring.check.create', 'monitoring_check', { kind: created.kind }, created.id)
      res.status(201).json({ check: created })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/monitoring/checks/:id', requirePermission('techMonitor', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const updated = await updateCheck(db(req).supabase, db(req).orgId, req.params.id, req.body ?? {})
      res.json({ check: updated })
    } catch (e) {
      next(e)
    }
  })

  router.delete('/monitoring/checks/:id', requirePermission('techMonitor', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      await deleteCheck(db(req).supabase, db(req).orgId, req.params.id)
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/monitoring/checks/:id/run', requirePermission('techMonitor', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const checks = await listChecks(d.supabase, d.orgId)
      const check = checks.find((c) => c.id === req.params.id)
      if (!check) throw new HttpError(404, 'Verificação não encontrada.')
      const connector = check.connectorId ? await getConnector(d.supabase, d.orgId, check.connectorId) : null
      const result = await executeCheck(
        d.supabase,
        d.orgId,
        d.orgSlug,
        check,
        connector,
        d.actor?.isPlatformSuperAdmin === true,
      )
      res.json({ result: { ...result, detail: sanitizeLogObject(result.detail) } })
    } catch (e) {
      next(e)
    }
  })

  return router
}
