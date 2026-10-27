import { randomUUID } from 'crypto'
import type { FogoDb } from '../db.js'
import {
  getSimulationSettings,
  insertActivity,
  listAlerts,
  listAssets,
  listIncidents,
  listTeams,
  nextCounter,
  raiseCounterAtLeast,
  patchSimulationSettings,
  upsertAlert,
  upsertAsset,
  upsertIncident,
  escalateOverdueAlerts,
  MONITORING_ALERT_SOURCE,
} from '../repository.js'
import { insertTelemetryEvent } from '../telemetry.js'
import { alertProtocolFromCounter, counterFloorFromProtocols } from './alertIds.js'
import { generatorMayCreateWorkOrders } from './policy.js'
import type {
  ActivityEvent,
  Incident,
  OperationalAlert,
  SimulationIntensity,
  SimulationSettings,
  UrbanAsset,
} from '../types.js'
import { upsertMapMarkerForIncident } from '../mapMarkers.js'
import {
  ALERT_TEMPLATES,
  INCIDENT_TEMPLATES,
  buildCtx,
  rushMultiplier,
  weightedPick,
} from './templates.js'
import {
  CAPABILITY_LABELS,
  capabilityForIncidentType,
  teamCanHandle,
} from '../teamCapabilities.js'
import type { OperationalTeam } from '../types.js'
import { clampTickIntervalMs } from './limits.js'
import {
  assetHasGeneratorFault,
  firstApplicableFault,
  pickGeneratorAsset,
  recoverGeneratorFault,
  faultKindForRule,
  type GeneratorAssetFault,
} from './assetFaults.js'
import { HttpError } from '../httpError.js'
import { listDemoActiveOrgs } from '../tenant/orgs.js'
import { dbForTenant } from '../supabase.js'
import { simulationAllowed } from '../../../src/lib/tenant.js'
import { isMaintenanceOsType } from '../../../src/lib/workOrders.js'
import { executeScheduledWorkOrders } from './executeScheduledOs.js'
import { refreshTenantSettings } from '../orgSla.js'

const timers = new Map<string, ReturnType<typeof setInterval>>()
const tickingOrgs = new Set<string>()

function tenantIsReal(db: FogoDb): boolean {
  return db.tenant ? !simulationAllowed(db.tenant.operationMode) : false
}

async function maybeMaintenanceDueAlerts(db: FogoDb) {
  const [incidents, alerts] = await Promise.all([listIncidents(db), listAlerts(db)])
  const openRules = new Set(alerts.filter((a) => a.state !== 'resolvido').map((a) => a.rule))
  const now = Date.now()
  for (const order of incidents) {
    if (!isMaintenanceOsType(order.type)) continue
    if (order.status === 'resolvida' || order.status === 'cancelada' || !order.dueAt) continue
    const dueMs = Date.parse(order.dueAt)
    if (!Number.isFinite(dueMs)) continue
    const days = (dueMs - now) / 86_400_000
    if (days > 3 || days < -30) continue
    if (openRules.has(`maintenance.due:${order.id}`)) continue
    if (Math.random() > 0.25) continue

    const severity = days < 0 ? ('alta' as const) : days <= 1 ? ('média' as const) : ('informativa' as const)
    const n = await nextCounter(db, 'alert')
    const alertId = `ALT-${2800 + n}`
    const alert = {
      id: alertId,
      category: 'Manutenção',
      severity,
      title: days < 0 ? 'OS de manutenção atrasada' : 'OS de manutenção próxima do vencimento',
      description: `${order.location} (${order.id}) — vencimento ${order.dueAt.slice(0, 10)}`,
      source: MONITORING_ALERT_SOURCE,
      dataOrigin: 'simulado' as const,
      relatedAssetId: order.relatedAssetId || undefined,
      detectedAt: new Date().toISOString(),
      state: 'novo' as const,
      rule: `maintenance.due:${order.id}`,
    }
    await upsertAlert(db, alert)
    await logActivity(db, `Alerta de OS de manutenção: ${order.location}`, 'incident')
    break
  }
}

function intensityScale(intensity: SimulationIntensity): number {
  switch (intensity) {
    case 'low':
      return 0.35
    case 'high':
      return 1.25
    default:
      return 0.75
  }
}

function isCameraLike(category: string): boolean {
  const c = category.toLowerCase()
  return c.includes('câmera') || c.includes('camera') || c.includes('radar')
}

async function maybeAssetTelemetry(db: FogoDb, before: UrbanAsset, after: UrbanAsset) {
  const tick = Date.now()
  const baseKey = `${after.id}-${Math.floor(tick / 60_000)}`
  if (isCameraLike(after.category)) {
    if (after.status === 'alerta' && before.status !== 'alerta') {
      await insertTelemetryEvent(db, {
        idempotencyKey: `${baseKey}-signal_loss`,
        eventType: 'signal_loss',
        assetExternalId: after.id,
        region: after.region,
        payload: { health: after.health },
        dataOrigin: 'simulado',
      })
    } else if (Math.random() < 0.35) {
      await insertTelemetryEvent(db, {
        idempotencyKey: `${baseKey}-frame`,
        eventType: after.category.toLowerCase().includes('radar') ? 'radar_reading' : 'frame_received',
        assetExternalId: after.id,
        region: after.region,
        payload: { status: after.status },
        dataOrigin: 'simulado',
      })
    }
    // Conectividade é derivada de lastSeen × cadastro — não sobrescreve situação cadastral.
  }
}

async function logActivity(db: FogoDb, message: string, kind: ActivityEvent['kind']) {
  const event: ActivityEvent = {
    id: `EVT-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    message,
    kind,
    dataOrigin: 'simulado',
  }
  await insertActivity(db, event)
}

async function continueAlertNumbering(db: FogoDb) {
  const protocols: string[] = []
  const pageSize = 1000
  for (let page = 0; page < 30; page++) {
    const from = page * pageSize
    const { data, error } = await db.supabase
      .from('alerts')
      .select('protocol')
      .eq('organization_id', db.orgId)
      .like('protocol', 'ALT-%')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const batch = data ?? []
    for (const row of batch) protocols.push(String(row.protocol ?? ''))
    if (batch.length < pageSize) break
  }
  const floor = counterFloorFromProtocols(protocols)
  await raiseCounterAtLeast(db, 'alert', floor)
}

async function newAlertId(db: FogoDb) {
  const n = await nextCounter(db, 'alert')
  const protocol = alertProtocolFromCounter(n)
  const { data: taken, error } = await db.supabase
    .from('alerts')
    .select('protocol')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (error) throw error
  if (!taken) return protocol
  await continueAlertNumbering(db)
  return alertProtocolFromCounter(await nextCounter(db, 'alert'))
}

async function newIncidentId(db: FogoDb) {
  const n = await nextCounter(db, 'incident')
  return `OCR-${2800 + n}`
}

const FAULT_LABEL: Record<GeneratorAssetFault, string> = {
  alerta: 'em alerta',
  mau_funcionamento: 'em mau funcionamento',
  sem_comunicacao: 'sem comunicação',
}

async function markAssetFault(db: FogoDb, asset: UrbanAsset, preferred: GeneratorAssetFault) {
  const applied = firstApplicableFault(asset, preferred)
  if (!applied) return false
  await upsertAsset(db, applied.asset)
  await maybeAssetTelemetry(db, asset, applied.asset)
  await logActivity(
    db,
    `Gerador: ${applied.asset.name} ficou ${FAULT_LABEL[applied.kind]} (${applied.asset.region}).`,
    'asset',
  )
  return true
}

async function logUnassignedBacklog(db: FogoDb, openIncidents: Incident[], teams: OperationalTeam[]) {
  const waiting = openIncidents.filter((i) => i.status === 'aberta')
  if (!waiting.length || Math.random() > 0.2) return

  const pick = waiting[Math.floor(Math.random() * waiting.length)]!
  const required = pick.requiredCapability ?? capabilityForIncidentType(pick.type)
  const qualifiedFree = teams.filter(
    (t) => t.status === 'disponível' && teamCanHandle(t.capabilities, required),
  )
  if (qualifiedFree.length === 0) {
    await logActivity(
      db,
      `Ocorrência ${pick.id} aguarda agente qualificado (${CAPABILITY_LABELS[required]}). Nenhum disponível.`,
      'incident',
    )
  }
}

export async function runSimulationTick(db: FogoDb) {
  if (tickingOrgs.has(db.orgId)) return
  if (tenantIsReal(db)) return
  tickingOrgs.add(db.orgId)
  try {
    await refreshTenantSettings(db)
    await executeScheduledWorkOrders(db)
    const settings = await getSimulationSettings(db)
    if (!settings.enabled) return

    const scale = intensityScale(settings.intensity) * rushMultiplier(new Date().getHours())
    const assets = await listAssets(db)
    const ctx = buildCtx(assets)

    if (Math.random() < 0.4 * scale && assets.length) {
      const kinds: GeneratorAssetFault[] = ['alerta', 'mau_funcionamento', 'sem_comunicacao']
      const asset = pickGeneratorAsset(assets)
      if (asset) await markAssetFault(db, asset, kinds[Math.floor(Math.random() * kinds.length)]!)
    }

    if (Math.random() < 0.18 * scale && assets.length) {
      const broken = assets.filter((item) => assetHasGeneratorFault(item))
      const asset = broken.length ? broken[Math.floor(Math.random() * broken.length)]! : null
      if (asset) {
        const recovered = recoverGeneratorFault(asset)
        if (recovered) {
          await upsertAsset(db, recovered)
          await logActivity(db, `Gerador: ${recovered.name} voltou à operação (${recovered.region}).`, 'asset')
        }
      }
    }

    if (Math.random() < 0.45 * scale) {
      const tpl = weightedPick(ALERT_TEMPLATES)
      if (tpl.bindsAsset) {
        const asset = pickGeneratorAsset(assets, ctx.asset)
        if (asset) await markAssetFault(db, asset, faultKindForRule(tpl.rule))
      } else {
      const relatedAssetId = undefined
      const alert: OperationalAlert = {
        id: await newAlertId(db),
        category: tpl.category,
        severity: tpl.severity,
        title: tpl.title,
        description: tpl.description(ctx),
        source: MONITORING_ALERT_SOURCE,
        dataOrigin: 'simulado',
        relatedAssetId,
        region: ctx.region,
        detectedAt: new Date().toISOString(),
        state: 'novo',
        rule: tpl.rule,
      }
      await upsertAlert(db, alert)
      await logActivity(
        db,
        `Ocorrência ${alert.id} em ${ctx.region}: ${alert.title}. Alerta de ocorrência acionado.`,
        'alert',
      )

      if (generatorMayCreateWorkOrders() && (alert.severity === 'crítica' || alert.severity === 'alta') && Math.random() < 0.55 * scale) {
        const incTpl = weightedPick(INCIDENT_TEMPLATES)
        const requiredCapability = capabilityForIncidentType(incTpl.type)
        const incident: Incident = {
          id: await newIncidentId(db),
          description: incTpl.description(ctx),
          type: incTpl.type,
          region: ctx.region,
          priority: incTpl.priority,
          status: 'aberta',
          openedAt: new Date().toISOString(),
          location: incTpl.location(ctx),
          relatedAssetId: relatedAssetId,
          dataOrigin: 'simulado',
          sourceAlertId: alert.id,
          requiredCapability,
        }
        await upsertIncident(db, incident)
        await upsertMapMarkerForIncident(db, incident, 35 + Math.random() * 30, 35 + Math.random() * 25)
        await upsertAlert(db, { ...alert, incidentId: incident.id, state: 'reconhecido' })
        await logActivity(db, `Ocorrência ${incident.id} aberta a partir do alerta ${alert.id}.`, 'incident')
      }
      }
    }

    if (generatorMayCreateWorkOrders() && Math.random() < 0.18 * scale) {
      const incTpl = weightedPick(INCIDENT_TEMPLATES)
      const requiredCapability = capabilityForIncidentType(incTpl.type)
      const incident: Incident = {
        id: await newIncidentId(db),
        description: incTpl.description(ctx),
        type: incTpl.type,
        region: ctx.region,
        priority: incTpl.priority,
        status: 'aberta',
        openedAt: new Date().toISOString(),
        location: incTpl.location(ctx),
        relatedAssetId: ['Semáforos', 'Câmeras', 'Sensores', 'Conectividade', 'Painéis'].includes(incTpl.type)
          ? ctx.asset?.id
          : undefined,
        dataOrigin: 'simulado',
        requiredCapability,
      }
      await upsertIncident(db, incident)
      await upsertMapMarkerForIncident(db, incident, 35 + Math.random() * 30, 35 + Math.random() * 25)
      await logActivity(db, `Nova ocorrência ${incident.id} — ${incident.description}`, 'incident')
    }

    await maybeMaintenanceDueAlerts(db)
    const { scanMaintenancePlanAlerts } = await import('../maintenance/planAlerts.js')
    await scanMaintenancePlanAlerts(db).catch((err) => console.error('[fogo] plan alerts', err))
    await escalateOverdueAlerts(db)

    const teams = await listTeams(db)
    const openIncidents = (await listIncidents(db)).filter(
      (i) => i.status !== 'resolvida' && i.status !== 'cancelada',
    )
    await logUnassignedBacklog(db, openIncidents, teams)

    await patchSimulationSettings(db, {
      lastTickAt: new Date().toISOString(),
      ticksTotal: settings.ticksTotal + 1,
    })
  } finally {
    tickingOrgs.delete(db.orgId)
  }
}

export function stopSimulationTimer(orgId: string) {
  const timer = timers.get(orgId)
  if (timer) {
    clearInterval(timer)
    timers.delete(orgId)
  }
}

export async function syncSimulationTimer(db: FogoDb) {
  stopSimulationTimer(db.orgId)
  if (tenantIsReal(db)) return
  const settings = await getSimulationSettings(db)
  const interval = settings.enabled ? clampTickIntervalMs(settings.tickIntervalMs) : 15_000
  const timer = setInterval(() => {
    void runSimulationTick(db).catch((err) => console.error('[fogo] simulation tick', err))
  }, interval)
  timers.set(db.orgId, timer)
}

export async function syncAllDemoSimulationTimers(supabase: FogoDb['supabase']) {
  const orgs = await listDemoActiveOrgs(supabase)
  for (const tenant of orgs) {
    await syncSimulationTimer(dbForTenant(supabase, tenant))
  }
}

export async function applySimulationPatch(
  db: FogoDb,
  patch: Partial<SimulationSettings>,
): Promise<SimulationSettings> {
  if (tenantIsReal(db) && (patch.enabled === true || patch.intensity || patch.tickIntervalMs)) {
    throw new HttpError(
      409,
      'Ambiente real não executa simulação nem dados sintéticos. Configure fontes operacionais desta cidade.',
      'REAL_MODE_NO_SIMULATION',
    )
  }
  const prev = await getSimulationSettings(db)
  const enabling = patch.enabled === true && !prev.enabled
  const disabling = patch.enabled === false && prev.enabled
  const tickIntervalMs =
    typeof patch.tickIntervalMs === 'number' ? clampTickIntervalMs(patch.tickIntervalMs) : undefined
  const next = await patchSimulationSettings(db, {
    ...patch,
    ...(tickIntervalMs !== undefined ? { tickIntervalMs } : {}),
    startedAt: enabling ? new Date().toISOString() : prev.startedAt,
  })
  await syncSimulationTimer(db)
  if (enabling) {
    try {
      await continueAlertNumbering(db)
    } catch (err) {
      console.error('[fogo] numeração de alertas', err)
    }
    await logActivity(db, 'Monitoramento da cidade iniciado. O histórico de alertas foi mantido.', 'system')
  }
  if (disabling) {
    await logActivity(db, 'Monitoramento da cidade pausado.', 'system')
  }
  return next
}
