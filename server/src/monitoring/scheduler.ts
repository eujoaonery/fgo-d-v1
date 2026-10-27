import type { SupabaseClient } from '@supabase/supabase-js'
import { getConnector, listDueChecks, listEnabledConnectorsByKind, loadSecrets } from '../connectors/store.js'
import { allowPrivateTargets, runAdapter } from '../connectors/registry.js'
import { ingestCandidates } from '../ingest/pipeline.js'
import { claimJobs, completeJob, enqueueJob, retryJob } from '../ingest/queue.js'
import { deliverSignedWebhook } from '../connectors/adapters/webhooks.js'
import { executeCheck, recomputeAssetState } from './runner.js'
import { clampTimeout } from '../connectors/timeout.js'
import { loadOrgById } from '../tenant/orgs.js'

const MAX_IN_FLIGHT = 6
let inFlight = 0
let timer: ReturnType<typeof setInterval> | null = null

function due(lastRunAt: string | null, intervalSec: number): boolean {
  if (!lastRunAt) return true
  return Date.now() - Date.parse(lastRunAt) >= intervalSec * 1000
}

async function runDueChecks(supabase: SupabaseClient) {
  const checks = await listDueChecks(supabase, 30)
  for (const check of checks) {
    if (check.kind !== 'icmp') continue
    if (inFlight >= MAX_IN_FLIGHT) break
    const intervalSec = Number(check.config.intervalSec ?? 60)
    if (!due(check.lastRunAt, Number.isFinite(intervalSec) ? intervalSec : 60)) continue
    inFlight += 1
    void (async () => {
      try {
        const connector = check.connectorId ? await getConnector(supabase, check.organizationId, check.connectorId) : null
        const { data: org } = await supabase.from('organizations').select('slug').eq('id', check.organizationId).maybeSingle()
        await executeCheck(supabase, check.organizationId, String(org?.slug ?? ''), check, connector, false)
      } catch (e) {
        console.error('[fogo] check', e instanceof Error ? e.message : e)
      } finally {
        inFlight -= 1
      }
    })()
  }
}

async function runDueRest(supabase: SupabaseClient) {
  const connectors = await listEnabledConnectorsByKind(supabase, 'rest')
  for (const c of connectors) {
    const intervalSec = Number(c.config.intervalSec ?? 120)
    if (!due(c.lastSuccessAt ?? c.lastAttemptAt, Number.isFinite(intervalSec) ? intervalSec : 120)) continue
    if (inFlight >= MAX_IN_FLIGHT) break
    inFlight += 1
    void (async () => {
      try {
        const secrets = await loadSecrets(supabase, c.organizationId, c.secretId)
        const { data: org } = await supabase.from('organizations').select('slug').eq('id', c.organizationId).maybeSingle()
        const result = await runAdapter('execute', c, {
          organizationId: c.organizationId,
          orgSlug: String(org?.slug ?? ''),
          secrets,
          allowPrivate: allowPrivateTargets(false, c.config),
        })
        if (result.ingest?.length) {
          await ingestCandidates(supabase, {
            organizationId: c.organizationId,
            connectorId: c.id,
            sourceKind: 'rest',
          }, result.ingest)
        }
        await supabase
          .from('connectors')
          .update({
            last_attempt_at: new Date().toISOString(),
            last_success_at: result.ok ? new Date().toISOString() : c.lastSuccessAt,
            last_error: result.ok ? null : result.error,
            health: result.ok ? 'healthy' : 'down',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
      } catch (e) {
        console.error('[fogo] rest poll', e instanceof Error ? e.message : e)
      } finally {
        inFlight -= 1
      }
    })()
  }
}

async function runDueMqtt(supabase: SupabaseClient) {
  const connectors = await listEnabledConnectorsByKind(supabase, 'mqtt')
  for (const c of connectors) {
    const intervalSec = Number(c.config.intervalSec ?? 30)
    if (!due(c.lastAttemptAt, Number.isFinite(intervalSec) ? intervalSec : 30)) continue
    if (inFlight >= MAX_IN_FLIGHT) break
    inFlight += 1
    void (async () => {
      try {
        const secrets = await loadSecrets(supabase, c.organizationId, c.secretId)
        const { data: org } = await supabase.from('organizations').select('slug').eq('id', c.organizationId).maybeSingle()
        const result = await runAdapter('execute', c, {
          organizationId: c.organizationId,
          orgSlug: String(org?.slug ?? ''),
          secrets,
          allowPrivate: Boolean(c.config.assetExternalId) || allowPrivateTargets(false, c.config),
        })
        const assetExternalId = typeof c.config.assetExternalId === 'string' ? c.config.assetExternalId : ''
        if (assetExternalId && result.ingest?.length) {
          for (const item of result.ingest) {
            if (!item.assetExternalId) item.assetExternalId = assetExternalId
          }
        }
        if (result.ingest?.length) {
          await ingestCandidates(supabase, {
            organizationId: c.organizationId,
            connectorId: c.id,
            sourceKind: 'mqtt',
          }, result.ingest)
        }
        await supabase
          .from('connectors')
          .update({
            last_attempt_at: new Date().toISOString(),
            last_success_at: result.ok ? new Date().toISOString() : c.lastSuccessAt,
            last_error: result.ok ? null : result.error,
            health: result.ok ? 'healthy' : result.result === 'mqtt_desconectado' ? 'down' : 'degraded',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
      } catch (e) {
        console.error('[fogo] mqtt', e instanceof Error ? e.message : e)
      } finally {
        inFlight -= 1
      }
    })()
  }
}

async function runDueProbe(supabase: SupabaseClient, kind: 'rtsp' | 'onvif') {
  const connectors = await listEnabledConnectorsByKind(supabase, kind)
  for (const c of connectors) {
    const intervalSec = Number(c.config.intervalSec ?? 60)
    if (!due(c.lastAttemptAt, Number.isFinite(intervalSec) ? intervalSec : 60)) continue
    if (inFlight >= MAX_IN_FLIGHT) break
    inFlight += 1
    void (async () => {
      try {
        const secrets = await loadSecrets(supabase, c.organizationId, c.secretId)
        const { data: org } = await supabase.from('organizations').select('slug').eq('id', c.organizationId).maybeSingle()
        const result = await runAdapter('execute', c, {
          organizationId: c.organizationId,
          orgSlug: String(org?.slug ?? ''),
          secrets,
          allowPrivate: Boolean(c.config.assetExternalId) || allowPrivateTargets(false, c.config),
        })
        await supabase
          .from('connectors')
          .update({
            last_attempt_at: new Date().toISOString(),
            last_success_at: result.ok ? new Date().toISOString() : c.lastSuccessAt,
            last_error: result.ok ? null : result.error,
            health: result.ok ? 'healthy' : 'down',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
      } catch (e) {
        console.error(`[fogo] ${kind}`, e instanceof Error ? e.message : e)
      } finally {
        inFlight -= 1
      }
    })()
  }
}

async function runDueSnmp(supabase: SupabaseClient) {
  const connectors = await listEnabledConnectorsByKind(supabase, 'snmp')
  for (const c of connectors) {
    const intervalSec = Number(c.config.intervalSec ?? 60)
    if (!due(c.lastAttemptAt, Number.isFinite(intervalSec) ? intervalSec : 60)) continue
    if (inFlight >= MAX_IN_FLIGHT) break
    inFlight += 1
    void (async () => {
      try {
        const secrets = await loadSecrets(supabase, c.organizationId, c.secretId)
        const { data: org } = await supabase.from('organizations').select('slug').eq('id', c.organizationId).maybeSingle()
        const result = await runAdapter('execute', c, {
          organizationId: c.organizationId,
          orgSlug: String(org?.slug ?? ''),
          secrets,
          allowPrivate: Boolean(c.config.assetExternalId) || allowPrivateTargets(false, c.config),
        })
        await supabase
          .from('connectors')
          .update({
            last_attempt_at: new Date().toISOString(),
            last_success_at: result.ok ? new Date().toISOString() : c.lastSuccessAt,
            last_error: result.ok ? null : result.error,
            health: result.ok ? 'healthy' : 'down',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
      } catch (e) {
        console.error('[fogo] snmp', e instanceof Error ? e.message : e)
      } finally {
        inFlight -= 1
      }
    })()
  }
}

async function processJobs(supabase: SupabaseClient) {
  const jobs = await claimJobs(supabase, 6)
  for (const job of jobs) {
    try {
      if (job.kind === 'recompute_state') {
        const assetId = String(job.payload.assetExternalId ?? '')
        if (assetId) await recomputeAssetState(supabase, job.organizationId, assetId)
        await completeJob(supabase, job.id)
        continue
      }
      if (job.kind === 'webhook_fanout' || job.kind === 'webhook_out') {
        const connectors = await listEnabledConnectorsByKind(supabase, 'webhook_out')
        const mine = connectors.filter((c) => c.organizationId === job.organizationId)
        const eventType = String(job.payload.eventType ?? 'state.changed')
        for (const c of mine) {
          const events = Array.isArray(c.config.events) ? (c.config.events as unknown[]).map(String) : []
          if (events.length && !events.includes(eventType) && !events.includes('*')) continue
          const secrets = await loadSecrets(supabase, c.organizationId, c.secretId)
          const eventId = `${job.refId ?? job.id}:${c.id}`
          const { data: existing } = await supabase
            .from('outbound_webhook_deliveries')
            .select('id, status')
            .eq('organization_id', job.organizationId)
            .eq('connector_id', c.id)
            .eq('event_id', eventId)
            .maybeSingle()
          if (existing?.status === 'delivered') continue
          const delivery = await deliverSignedWebhook({
            url: String(c.config.url ?? ''),
            allowPrivate: allowPrivateTargets(false, c.config),
            timeoutMs: clampTimeout(c.config.timeoutMs, 5000),
            secret: secrets.hmacSecret || secrets.token,
            eventType,
            eventId,
            payload: { assetExternalId: job.payload.assetExternalId ?? null, jobId: job.id },
          })
          await supabase.from('outbound_webhook_deliveries').upsert({
            organization_id: job.organizationId,
            connector_id: c.id,
            event_type: eventType,
            event_id: eventId,
            status: delivery.ok ? 'delivered' : 'failed',
            attempts: (existing ? 1 : 0) + 1,
            last_error: delivery.error,
            response_status: delivery.status,
            next_retry_at: delivery.ok ? null : new Date(Date.now() + 15_000).toISOString(),
          })
          if (!delivery.ok) {
            await enqueueJob(supabase, {
              organizationId: job.organizationId,
              kind: 'webhook_out',
              refId: job.refId,
              payload: job.payload,
              runAfter: new Date(Date.now() + 15_000).toISOString(),
            })
          }
        }
        await completeJob(supabase, job.id)
        continue
      }
      if (job.kind === 'retention') {
        const days = Number(process.env.FOGO_MONITOR_RETENTION_DAYS ?? 30)
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
        await supabase.from('monitoring_check_runs').delete().lt('started_at', cutoff)
        await supabase.from('telemetry_samples').delete().lt('received_at', cutoff)
        await supabase.from('ingest_jobs').delete().eq('status', 'done').lt('processed_at', cutoff)
        await completeJob(supabase, job.id)
        continue
      }
      await completeJob(supabase, job.id)
    } catch (e) {
      await retryJob(supabase, job, e instanceof Error ? e.message : 'falha')
    }
  }
}

let lastRetention = 0
let lastPlanScan = 0

export function startMonitoringScheduler(supabase: SupabaseClient) {
  if (timer) return
  timer = setInterval(() => {
    void (async () => {
      try {
        await runDueChecks(supabase)
        await runDueRest(supabase)
        await runDueMqtt(supabase)
        await runDueSnmp(supabase)
        await runDueProbe(supabase, 'rtsp')
        await runDueProbe(supabase, 'onvif')
        await processJobs(supabase)
        if (Date.now() - lastPlanScan > 120_000) {
          lastPlanScan = Date.now()
          const { data: orgs } = await supabase.from('organizations').select('id').limit(50)
          const { dbForTenant } = await import('../supabase.js')
          const { scanMaintenancePlanAlerts } = await import('../maintenance/planAlerts.js')
          for (const org of orgs ?? []) {
            const tenant = await loadOrgById(supabase, String(org.id))
            if (!tenant) continue
            await scanMaintenancePlanAlerts(dbForTenant(supabase, tenant)).catch((e) =>
              console.error('[fogo] plan alerts', e instanceof Error ? e.message : e),
            )
          }
        }
        if (Date.now() - lastRetention > 6 * 3600_000) {
          lastRetention = Date.now()
          const { data: orgs } = await supabase.from('organizations').select('id').limit(50)
          for (const org of orgs ?? []) {
            await enqueueJob(supabase, { organizationId: String(org.id), kind: 'retention' })
          }
        }
      } catch (e) {
        console.error('[fogo] scheduler', e instanceof Error ? e.message : e)
      }
    })()
  }, 12_000)
  timer.unref?.()
}

export function stopMonitoringScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
