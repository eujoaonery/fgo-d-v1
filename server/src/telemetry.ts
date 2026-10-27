import { randomUUID } from 'crypto'
import type { FogoDb } from './db.js'
import type { DataOrigin } from './types.js'

export interface TelemetryEvent {
  id: string
  eventType: string
  source: string
  assetExternalId?: string
  alertProtocol?: string
  region?: string
  payload?: Record<string, unknown>
  occurredAt: string
  receivedAt?: string
  quality?: string
  dataOrigin?: DataOrigin
}

export async function insertTelemetryEvent(
  db: FogoDb,
  input: {
    eventType: string
    source?: string
    assetExternalId?: string
    alertProtocol?: string
    region?: string
    payload?: Record<string, unknown>
    occurredAt?: string
    idempotencyKey: string
    dataOrigin?: DataOrigin
  },
): Promise<TelemetryEvent | null> {
  const externalId = `TEL-${randomUUID().slice(0, 8).toUpperCase()}`
  const { error } = await db.supabase.from('telemetry_events').insert({
    organization_id: db.orgId,
    external_id: externalId,
    idempotency_key: input.idempotencyKey,
    event_type: input.eventType,
    source: input.source ?? 'monitoramento',
    asset_external_id: input.assetExternalId ?? null,
    alert_protocol: input.alertProtocol ?? null,
    region: input.region ?? null,
    payload: input.payload ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    received_at: new Date().toISOString(),
    quality: 'conhecida',
    data_origin: input.dataOrigin ?? 'simulado',
  })
  if (error) {
    if (error.code === '23505') return null
    throw error
  }
  return {
    id: externalId,
    eventType: input.eventType,
    source: input.source ?? 'monitoramento',
    assetExternalId: input.assetExternalId,
    alertProtocol: input.alertProtocol,
    region: input.region,
    payload: input.payload,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    quality: 'conhecida',
    dataOrigin: input.dataOrigin,
  }
}

export async function listTelemetryEvents(
  db: FogoDb,
  opts: { limit?: number; region?: string; assetExternalId?: string } = {},
): Promise<TelemetryEvent[]> {
  let q = db.supabase
    .from('telemetry_events')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.region) q = q.eq('region', opts.region)
  if (opts.assetExternalId) q = q.eq('asset_external_id', opts.assetExternalId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.external_id,
    eventType: row.event_type,
    source: row.source,
    assetExternalId: row.asset_external_id ?? undefined,
    alertProtocol: row.alert_protocol ?? undefined,
    region: row.region ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? undefined,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at ?? row.created_at,
    quality: row.quality ?? undefined,
    dataOrigin: (row.data_origin as DataOrigin | null) ?? 'simulado',
  }))
}

/** Telemetria persistida + eventos derivados de alertas e ocorrências reais. */
export async function listOperationalEvents(
  db: FogoDb,
  opts: { limit?: number; region?: string; assetExternalId?: string } = {},
): Promise<TelemetryEvent[]> {
  const { listAlerts, listIncidents } = await import('./repository.js')
  const [stored, alerts, incidents] = await Promise.all([
    listTelemetryEvents(db, { limit: opts.limit ?? 100, region: opts.region, assetExternalId: opts.assetExternalId }),
    listAlerts(db),
    listIncidents(db),
  ])

  const derived: TelemetryEvent[] = []
  for (const a of alerts) {
    if (opts.region && a.region !== opts.region) continue
    if (opts.assetExternalId && a.relatedAssetId !== opts.assetExternalId) continue
    derived.push({
      id: `OP-${a.id}`,
      eventType: `alerta · ${a.category}`,
      source: a.source || 'operacao',
      assetExternalId: a.relatedAssetId,
      alertProtocol: a.id,
      region: a.region,
      payload: { title: a.title, severity: a.severity, state: a.state },
      occurredAt: a.detectedAt,
      dataOrigin: a.dataOrigin,
    })
  }
  for (const i of incidents) {
    if (opts.region && i.region !== opts.region) continue
    if (opts.assetExternalId && i.relatedAssetId !== opts.assetExternalId) continue
    derived.push({
      id: `OP-${i.id}-aberta`,
      eventType: 'ocorrência registrada',
      source: 'operacao',
      assetExternalId: i.relatedAssetId,
      region: i.region,
      payload: { title: i.description, status: i.status, type: i.type },
      occurredAt: i.openedAt,
      dataOrigin: i.dataOrigin,
    })
    if (i.status === 'resolvida' && i.resolvedAt) {
      derived.push({
        id: `OP-${i.id}-resolvida`,
        eventType: 'ocorrência resolvida',
        source: 'operacao',
        assetExternalId: i.relatedAssetId,
        region: i.region,
        payload: { title: i.description, status: i.status, type: i.type },
        occurredAt: i.resolvedAt,
        dataOrigin: i.dataOrigin,
      })
    }
  }

  const merged = [...stored, ...derived].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )
  return merged.slice(0, opts.limit ?? 100)
}
