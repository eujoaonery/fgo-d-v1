import { Router } from 'express'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { requirePermission } from '../middleware/requirePermission.js'
import { HttpError } from '../httpError.js'

function db(req: FogoRequest) {
  if (!req.fogoDb) throw new Error('fogoDb missing')
  return req.fogoDb
}

const STATE_LABEL: Record<string, string> = {
  operational: 'operacional',
  degraded: 'degradado',
  unavailable: 'indisponível',
  unknown: 'desconhecido',
  stale: 'sem dados recentes',
  maintenance: 'em manutenção',
}

export function createMonitoringRouter() {
  const router = Router()

  router.get('/monitoring/overview', requirePermission('techMonitor', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const [{ data: states }, { data: assets }, { data: checks }, { data: runs }, { data: samples }] = await Promise.all([
        d.supabase.from('asset_monitor_states').select('*').eq('organization_id', d.orgId),
        d.supabase
          .from('assets')
          .select('external_id, name, category, region, location, cadastral_status, last_seen, connectivity_status, data_origin, manufacturer, model')
          .eq('organization_id', d.orgId),
        d.supabase.from('monitoring_checks').select('id, enabled').eq('organization_id', d.orgId),
        d.supabase
          .from('monitoring_check_runs')
          .select('id, ok, started_at, result, error')
          .eq('organization_id', d.orgId)
          .order('started_at', { ascending: false })
          .limit(30),
        d.supabase
          .from('telemetry_samples')
          .select('asset_external_id, metric, value, unit, occurred_at, quality')
          .eq('organization_id', d.orgId)
          .order('occurred_at', { ascending: false })
          .limit(200),
      ])
      const byId = new Map((states ?? []).map((s) => [String(s.asset_external_id), s]))
      const counts: Record<string, number> = {
        operational: 0,
        degraded: 0,
        unavailable: 0,
        unknown: 0,
        stale: 0,
        maintenance: 0,
      }
      const items = (assets ?? []).map((a) => {
        const st = byId.get(String(a.external_id))
        const state = (st?.state as string | undefined) ?? 'unknown'
        counts[state] = (counts[state] ?? 0) + 1
        const loc = a.location as { lat?: number; lng?: number } | null
        const latestMetrics = (samples ?? [])
          .filter((s) => s.asset_external_id === a.external_id)
          .slice(0, 5)
        return {
          id: a.external_id,
          name: a.name,
          category: a.category,
          region: a.region,
          cadastralStatus: a.cadastral_status,
          connectivityStatus: a.connectivity_status,
          dataOrigin: a.data_origin,
          manufacturer: a.manufacturer,
          model: a.model,
          lastSeen: a.last_seen,
          state,
          stateLabel: STATE_LABEL[state] ?? state,
          reason: st?.reason ?? 'Nenhuma verificação técnica registrada para este ativo.',
          lastCheckAt: st?.last_check_at ?? null,
          lastOkAt: st?.last_ok_at ?? null,
          consecutiveFailures: st?.consecutive_failures ?? 0,
          lat: typeof loc?.lat === 'number' ? loc.lat : null,
          lng: typeof loc?.lng === 'number' ? loc.lng : null,
          locationConfigured: typeof loc?.lat === 'number' && typeof loc?.lng === 'number',
          metrics: latestMetrics,
        }
      })
      res.json({
        generatedAt: new Date().toISOString(),
        counts,
        checkCount: (checks ?? []).length,
        enabledChecks: (checks ?? []).filter((c) => c.enabled).length,
        recentFailures: (runs ?? []).filter((r) => !r.ok),
        items,
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/monitoring/assets/:id', requirePermission('techMonitor', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const d = db(req)
      const externalId = req.params.id
      const { data: asset } = await d.supabase
        .from('assets')
        .select('*')
        .eq('organization_id', d.orgId)
        .eq('external_id', externalId)
        .maybeSingle()
      if (!asset) throw new HttpError(404, 'Ativo não encontrado.')
      const [{ data: state }, { data: checks }, { data: samples }, { data: events }] = await Promise.all([
        d.supabase
          .from('asset_monitor_states')
          .select('*')
          .eq('organization_id', d.orgId)
          .eq('asset_external_id', externalId)
          .maybeSingle(),
        d.supabase.from('monitoring_checks').select('*').eq('organization_id', d.orgId).eq('asset_external_id', externalId),
        d.supabase
          .from('telemetry_samples')
          .select('metric, value, unit, occurred_at, quality, data_origin')
          .eq('organization_id', d.orgId)
          .eq('asset_external_id', externalId)
          .order('occurred_at', { ascending: false })
          .limit(80),
        d.supabase
          .from('normalized_events')
          .select('event_type, occurred_at, received_at, quality, source, payload')
          .eq('organization_id', d.orgId)
          .eq('asset_external_id', externalId)
          .order('occurred_at', { ascending: false })
          .limit(40),
      ])
      const checkIds = (checks ?? []).map((c) => c.id as string)
      let runs: unknown[] = []
      if (checkIds.length) {
        const { data } = await d.supabase
          .from('monitoring_check_runs')
          .select('check_id, started_at, finished_at, ok, result, latency_ms, packet_loss, http_status, tls_ok, error')
          .eq('organization_id', d.orgId)
          .in('check_id', checkIds)
          .order('started_at', { ascending: false })
          .limit(50)
        runs = data ?? []
      }
      const loc = asset.location as { lat?: number; lng?: number } | null
      res.json({
        asset: {
          id: asset.external_id,
          name: asset.name,
          category: asset.category,
          region: asset.region,
          manufacturer: asset.manufacturer,
          model: asset.model,
          cadastralStatus: asset.cadastral_status,
          dataOrigin: asset.data_origin,
          lastSeen: asset.last_seen,
          lat: typeof loc?.lat === 'number' ? loc.lat : null,
          lng: typeof loc?.lng === 'number' ? loc.lng : null,
          locationConfigured: typeof loc?.lat === 'number' && typeof loc?.lng === 'number',
        },
        state: state
          ? {
              state: state.state,
              stateLabel: STATE_LABEL[String(state.state)] ?? state.state,
              reason: state.reason,
              lastCheckAt: state.last_check_at,
              lastOkAt: state.last_ok_at,
              consecutiveFailures: state.consecutive_failures,
              evidence: state.evidence,
            }
          : {
              state: 'unknown',
              stateLabel: STATE_LABEL.unknown,
              reason: 'Nenhuma verificação técnica registrada.',
              lastCheckAt: null,
              lastOkAt: null,
              consecutiveFailures: 0,
              evidence: {},
            },
        checks: checks ?? [],
        runs,
        samples: samples ?? [],
        events: events ?? [],
      })
    } catch (e) {
      next(e)
    }
  })

  return router
}
