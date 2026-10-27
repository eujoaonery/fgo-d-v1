import {
  parseSimulation,
  rowToActivity,
  rowToAlert,
  rowToAsset,
  rowToIncident,
  rowToMaintenance,
  rowToMapMarker,
  rowToTeam,
} from './mappers.js'
import { isSystemOccurrence } from '../../src/lib/cityOccurrence.js'
import {
  capabilityForAlertCategory,
  capabilityForIncidentType,
  teamCanHandle,
} from './teamCapabilities.js'
import { writeAudit } from './audit.js'
import { generatedSignalOrigin } from './dataOrigin.js'
import { sanitizeAssetSpecs } from '../../src/lib/assetSpecs.js'
import { getWorkOrderSubject, listWorkOrderSubjects } from './workOrderSubjects.js'
import { maintenanceToIncident } from '../../src/lib/workOrders.js'
import { isOccurrenceFinal, isOccurrencePending, isOccurrenceSlaClosed } from '../../src/lib/occurrenceState.js'
import { computeAvailability } from '../../src/lib/assetAvailability.js'
import { DEFAULT_ASSET_CATEGORIES } from './data/assetCategories.js'
import { responseDueAtForAlert, responseDueAtForSeverity, isAlertOverdue } from './alertSla.js'
import type { AlertHistoryEntry, RegionSummary, SearchHit } from './types.js'
import { removeMapMarkersForAsset, syncMapMarkerStatusForAsset, upsertMapMarkerForAsset } from './mapMarkers.js'
import type { FogoDb } from './supabase.js'
import type {
  ActivityEvent,
  AssetCategory,
  Incident,
  IncidentHistoryEntry,
  IncidentStatus,
  MaintenanceHistoryEntry,
  MaintenanceOrder,
  MaintenanceStatus,
  MapMarkerDto,
  OperationalAlert,
  OperationalTeam,
  SimulationSettings,
  UrbanAsset,
  AlertState,
} from './types.js'

const MAINT_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  pendente: ['em execução', 'atrasada'],
  atrasada: ['em execução', 'concluída'],
  'em execução': ['concluída'],
  concluída: [],
}

const DEFAULT_SIM: SimulationSettings = {
  enabled: false,
  intensity: 'medium',
  tickIntervalMs: 60000,
  ticksTotal: 0,
}

export async function getSimulationSettings(db: FogoDb): Promise<SimulationSettings> {
  const { data, error } = await db.supabase
    .from('system_settings')
    .select('simulation')
    .eq('organization_id', db.orgId)
    .maybeSingle()
  if (error) throw error
  return data ? parseSimulation(data.simulation) : DEFAULT_SIM
}

export async function setSimulationSettings(db: FogoDb, next: SimulationSettings): Promise<SimulationSettings> {
  const { error } = await db.supabase.from('system_settings').upsert({
    organization_id: db.orgId,
    simulation: next as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  return next
}

export async function patchSimulationSettings(
  db: FogoDb,
  patch: Partial<SimulationSettings>,
): Promise<SimulationSettings> {
  const prev = await getSimulationSettings(db)
  return setSimulationSettings(db, { ...prev, ...patch })
}

export async function isSeeded(db: FogoDb): Promise<boolean> {
  const { count, error } = await db.supabase
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', db.orgId)
  if (error) throw error
  return (count ?? 0) > 0
}

export async function nextCounter(db: FogoDb, name: string): Promise<number> {
  const { data, error } = await db.supabase.rpc('increment_counter', {
    p_org_id: db.orgId,
    p_name: name,
  })
  if (error) throw error
  return data as number
}

/** Sobe o contador sem apagar linhas. O próximo incremento fica acima dos protocolos já usados. */
export async function raiseCounterAtLeast(db: FogoDb, name: string, floor: number): Promise<void> {
  if (!Number.isFinite(floor) || floor <= 0) return
  const { data, error } = await db.supabase
    .from('counters')
    .select('value')
    .eq('organization_id', db.orgId)
    .eq('name', name)
    .maybeSingle()
  if (error) throw error
  const current = typeof data?.value === 'number' ? data.value : 0
  if (current >= floor) return
  const { error: upErr } = await db.supabase.from('counters').upsert(
    { organization_id: db.orgId, name, value: Math.floor(floor) },
    { onConflict: 'organization_id,name' },
  )
  if (upErr) throw upErr
}

export async function listIncidents(db: FogoDb): Promise<Incident[]> {
  const { data, error } = await db.supabase
    .from('incidents')
    .select('*, assets:related_asset_id(external_id)')
    .eq('organization_id', db.orgId)
    .order('opened_at', { ascending: false })
  if (error) throw error
  const incidents = (data ?? []).map((row) => rowToIncident(row))
  const known = new Set(incidents.map((i) => i.id))
  const legacy = await listMaintenance(db)
  const extra = legacy
    .filter((m) => !known.has(m.id))
    .map((m) => maintenanceToIncident(m))
  return [...incidents, ...extra].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))
}

export async function getIncident(db: FogoDb, protocol: string): Promise<Incident | null> {
  const { data, error } = await db.supabase
    .from('incidents')
    .select('*, assets:related_asset_id(external_id)')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (error) throw error
  if (data) return rowToIncident(data)
  const legacy = (await listMaintenance(db)).find((m) => m.id === protocol)
  return legacy ? maintenanceToIncident(legacy) : null
}

export async function createWorkOrder(
  db: FogoDb,
  body: {
    description: string
    type: string
    region?: string
    priority?: Incident['priority']
    relatedAssetId?: string
    location?: string
    assignee?: string
    dueAt?: string
    workOrderDescription?: string
    sourceAlertId?: string
    sourcePredictionId?: string
    predictionDuplicateNote?: string
    dataOrigin?: Incident['dataOrigin']
    subjectId?: string
    subjectLabel?: string
  },
): Promise<Incident> {
  if (!body.subjectId?.trim()) {
    throw new Error('Informe o assunto da ordem de serviço.')
  }
  const id = `OS-${(await nextCounter(db, 'incident')).toString().padStart(4, '0')}`
  let region = body.region
  let location = body.location
  if (body.relatedAssetId && (!region || !location)) {
    const { data: asset } = await db.supabase
      .from('assets')
      .select('external_id, region, address, name')
      .eq('organization_id', db.orgId)
      .eq('external_id', body.relatedAssetId)
      .maybeSingle()
    region = region || (asset?.region as string | undefined)
    location = location || (asset?.address as string | undefined) || (asset?.name as string | undefined)
  }
  const description = body.description.trim()
  const incident: Incident = {
    id,
    description,
    workOrderDescription: body.workOrderDescription?.trim() || description,
    type: body.type,
    region: region || 'Centro',
    priority: body.priority ?? 'média',
    status: 'aberta',
    openedAt: new Date().toISOString(),
    dueAt: body.dueAt,
    assignee: body.assignee,
    relatedAssetId: body.relatedAssetId,
    location: location || region || '—',
    requiredCapability: capabilityForIncidentType(body.type),
    sourceAlertId: body.sourceAlertId,
    sourcePredictionId: body.sourcePredictionId,
    dataOrigin: body.dataOrigin ?? 'manual',
    subjectId: body.subjectId,
    subjectLabel: body.subjectLabel,
  }
  await upsertIncident(db, incident)
  await insertIncidentHistory(db, id, null, 'aberta', 'Ordem de serviço aberta')
  await writeAudit(db, 'incident.create', 'incident', { protocol: id, type: incident.type })
  if (body.sourceAlertId) {
    await finalizeOccurrenceWithOs(db, body.sourceAlertId, id)
  }
  return incident
}

export async function upsertIncident(db: FogoDb, incident: Incident) {
  const relatedAssetId = incident.relatedAssetId
    ? await resolveAssetUuid(db, incident.relatedAssetId)
    : null

  const { error } = await db.supabase.from('incidents').upsert(
    {
      organization_id: db.orgId,
      protocol: incident.id,
      description: incident.description,
      type: incident.type,
      region: incident.region,
      priority: incident.priority,
      status: incident.status,
      opened_at: incident.openedAt,
      assignee: incident.assignee ?? null,
      related_asset_id: relatedAssetId,
      location: incident.location,
      notes: incident.notes ?? null,
      data_origin: incident.dataOrigin ?? generatedSignalOrigin(db),
      source_alert_protocol: incident.sourceAlertId ?? null,
      source_prediction_id: incident.sourcePredictionId ?? null,
      subject_id: incident.subjectId ?? null,
      subject_label: incident.subjectLabel ?? null,
      required_capability: incident.requiredCapability ?? null,
      assigned_team_external_id: incident.assignedTeamId ?? null,
      due_at: incident.dueAt ?? null,
      work_order_description: incident.workOrderDescription ?? null,
      scheduled_start: incident.scheduledStart ?? null,
      scheduled_end: incident.scheduledEnd ?? null,
      diagnosis: incident.diagnosis ?? null,
      materials: incident.materials ?? null,
      close_problem: incident.closeProblem ?? null,
      close_solution: incident.closeSolution ?? null,
      close_signature: incident.closeSignature ?? null,
      close_images: incident.closeImages ?? [],
      resolved_at:
        incident.resolvedAt ??
        (incident.status === 'resolvida' ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,protocol' },
  )
  if (error) throw error

  if (incident.status === 'resolvida' || incident.status === 'cancelada') {
    await releaseTeamFromIncident(db, incident.id)
    await db.supabase
      .from('map_markers')
      .update({ status: 'resolvida', updated_at: new Date().toISOString() })
      .eq('organization_id', db.orgId)
      .eq('incident_protocol', incident.id)
  }
}

const ALERT_PAGE = 1000
const ALERT_PAGE_CAP = 30

/** O PostgREST devolve no máximo 1000 linhas por consulta. Sem páginas, o total de ocorrências trava em 1000. */
export async function listAlerts(db: FogoDb): Promise<OperationalAlert[]> {
  const rows: Parameters<typeof rowToAlert>[0][] = []
  for (let page = 0; page < ALERT_PAGE_CAP; page++) {
    const from = page * ALERT_PAGE
    const { data, error } = await db.supabase
      .from('alerts')
      .select('*, assets:related_asset_id(external_id), incidents:incident_id(protocol)')
      .eq('organization_id', db.orgId)
      .order('id', { ascending: true })
      .range(from, from + ALERT_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as Parameters<typeof rowToAlert>[0][]
    rows.push(...batch)
    if (batch.length < ALERT_PAGE) break
  }
  return rows
    .map((row) => rowToAlert(row))
    .filter((alert) => !isSystemOccurrence(alert))
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
}

export type AlertForecastSample = {
  detectedAt: string
  state: string
  category: string
  region: string
  dataOrigin: 'real' | 'simulado'
}

const ALERT_FORECAST_PAGE = 1000
const ALERT_FORECAST_CAP = 30

/** Histórico para o motor. A lista operacional também pagina; a previsão usa só as colunas do modelo. */
export async function listAlertForecastSamples(db: FogoDb): Promise<AlertForecastSample[]> {
  const rows: AlertForecastSample[] = []
  for (let page = 0; page < ALERT_FORECAST_CAP; page++) {
    const from = page * ALERT_FORECAST_PAGE
    const { data, error } = await db.supabase
      .from('alerts')
      .select('detected_at,state,category,region,data_origin')
      .eq('organization_id', db.orgId)
      .order('detected_at', { ascending: true })
      .range(from, from + ALERT_FORECAST_PAGE - 1)
    if (error) throw error
    const batch = data ?? []
    for (const row of batch) {
      const category = String(row.category ?? '')
      if (isSystemOccurrence({ category })) continue
      rows.push({
        detectedAt: String(row.detected_at ?? ''),
        state: String(row.state ?? ''),
        category,
        region: String(row.region ?? ''),
        dataOrigin: row.data_origin === 'simulado' ? 'simulado' : 'real',
      })
    }
    if (batch.length < ALERT_FORECAST_PAGE) return rows
  }
  return rows
}

export async function upsertAlert(db: FogoDb, alert: OperationalAlert) {
  const relatedAssetId = alert.relatedAssetId ? await resolveAssetUuid(db, alert.relatedAssetId) : null
  const incidentId = alert.incidentId ? await resolveIncidentUuid(db, alert.incidentId) : null

  const { data: existing } = await db.supabase
    .from('alerts')
    .select('id, state')
    .eq('organization_id', db.orgId)
    .eq('protocol', alert.id)
    .maybeSingle()

  const alertRow: Record<string, unknown> = {
    organization_id: db.orgId,
    protocol: alert.id,
    category: alert.category,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    source: alert.source,
    data_origin: alert.dataOrigin,
    related_asset_id: relatedAssetId,
    region: alert.region ?? null,
    incident_id: incidentId,
    detected_at: alert.detectedAt,
    state: alert.state,
    rule: alert.rule ?? null,
    updated_at: new Date().toISOString(),
  }
  if (!existing) {
    alertRow.response_due_at =
      alert.responseDueAt ??
      responseDueAtForAlert(
        alert.category,
        alert.severity,
        new Date(alert.detectedAt),
        db.tenant?.settings,
      )
  } else if (alert.responseDueAt) {
    alertRow.response_due_at = alert.responseDueAt
  }
  if (alert.claimedBy) {
    alertRow.claimed_by = alert.claimedBy
    alertRow.claimed_by_label = alert.claimedByLabel ?? null
  }
  if (alert.claimedAt) alertRow.claimed_at = alert.claimedAt
  if (alert.dispatchedAt) alertRow.dispatched_at = alert.dispatchedAt
  if (alert.completedAt) alertRow.completed_at = alert.completedAt
  const { error } = await db.supabase.from('alerts').upsert(alertRow, { onConflict: 'organization_id,protocol' })
  if (error) throw error

  if (existing && existing.state !== alert.state) {
    await db.supabase.from('alert_history').insert({
      organization_id: db.orgId,
      alert_id: existing.id,
      from_state: existing.state,
      to_state: alert.state,
      note: 'Atualização operacional',
      actor_label: 'sistema',
    })
  }
}

export async function listActivity(db: FogoDb, limit = 80): Promise<ActivityEvent[]> {
  const { data, error } = await db.supabase
    .from('activity_events')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(rowToActivity).reverse()
}

export async function insertActivity(db: FogoDb, event: ActivityEvent) {
  const { error } = await db.supabase.from('activity_events').upsert(
    {
      organization_id: db.orgId,
      external_id: event.id,
      occurred_at: event.timestamp,
      message: event.message,
      kind: event.kind,
      data_origin: event.dataOrigin ?? null,
    },
    { onConflict: 'organization_id,external_id' },
  )
  if (error) throw error
}

export async function ensureAssetCategories(db: FogoDb) {
  for (const cat of DEFAULT_ASSET_CATEGORIES) {
    const { error } = await db.supabase.from('asset_categories').upsert(
      {
        organization_id: db.orgId,
        slug: cat.slug,
        label: cat.label,
        marker_kind: cat.markerKind,
        sort_order: cat.sortOrder,
      },
      { onConflict: 'organization_id,slug' },
    )
    if (error) throw error
  }
}

export async function listAssetCategories(db: FogoDb): Promise<AssetCategory[]> {
  const { data, error } = await db.supabase
    .from('asset_categories')
    .select('slug, label, marker_kind, sort_order')
    .eq('organization_id', db.orgId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((r) => ({
    slug: r.slug,
    label: r.label,
    markerKind: r.marker_kind,
    sortOrder: r.sort_order,
  }))
}

export async function getAssetByExternalId(db: FogoDb, externalId: string): Promise<UrbanAsset | null> {
  const { data, error } = await db.supabase
    .from('assets')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) throw error
  return data ? rowToAsset(data) : null
}

const ASSET_PAGE = 1000
const ASSET_PAGE_CAP = 200

/** O PostgREST devolve no máximo 1000 linhas por consulta. Sem páginas, o total da tela trava em 1000. */
async function listAssetRows(db: FogoDb): Promise<Parameters<typeof rowToAsset>[0][]> {
  type Row = Parameters<typeof rowToAsset>[0]
  const rows: Row[] = []
  for (let page = 0; page < ASSET_PAGE_CAP; page++) {
    const from = page * ASSET_PAGE
    const { data, error } = await db.supabase
      .from('assets')
      .select('*')
      .eq('organization_id', db.orgId)
      .order('id', { ascending: true })
      .range(from, from + ASSET_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < ASSET_PAGE) return rows
  }
  throw new Error('A lista de ativos passou do limite de páginas.')
}

export async function listAssets(db: FogoDb): Promise<UrbanAsset[]> {
  const data = await listAssetRows(db)
  const { listLatestLiveLocations } = await import('./assets/locations.js')
  const live = await listLatestLiveLocations(db)
  let assets = (data ?? []).map((row) => {
    const asset = rowToAsset(row)
    const liveLoc = live[asset.id]
    return liveLoc ? { ...asset, liveLocation: liveLoc } : asset
  })
  try {
    const { attachIcmpToAssets } = await import('./monitoring/icmpAvailability.js')
    assets = await attachIcmpToAssets(db, assets)
  } catch {
    /* o cadastro segue sem o estado do ping */
  }
  try {
    const { attachAssetProtocols } = await import('./monitoring/assetProtocols.js')
    assets = await attachAssetProtocols(db, assets)
  } catch {
    /* o cadastro segue sem MQTT/SNMP */
  }
  return assets
}

export async function upsertAsset(
  db: FogoDb,
  asset: UrbanAsset,
  auditAction: 'asset.create' | 'asset.update' = 'asset.update',
  opts?: { cadastralJustification?: string },
) {
  const { cadastralFieldDiff, deriveConnectivity, normalizeCadastral, snapshotAsset } = await import('./assets/truth.js')
  const cadastralStatus = normalizeCadastral(asset.cadastralStatus)
  const connectivityStatus = deriveConnectivity({ ...asset, cadastralStatus })
  const { locationForUpsert, percentsFromLocation } = await import('./assets/locations.js')
  const { formatAssetAddress } = await import('./data/mariliaAddresses.js')
  const { parseMapMunicipality } = await import('../../src/lib/mapMunicipality.js')
  const mapArea = parseMapMunicipality(db.tenant?.settings)
  const location = locationForUpsert({ ...asset, cadastralStatus }, mapArea)
  const perc = percentsFromLocation(location, mapArea?.bbox)
  const next: UrbanAsset = {
    ...asset,
    cadastralStatus,
    connectivityStatus,
    location,
    address: location.street ? formatAssetAddress(location) : (asset.address ?? ''),
    mapX: perc?.x ?? asset.mapX,
    mapY: perc?.y ?? asset.mapY,
  }

  const { data: prevRow } = await db.supabase
    .from('assets')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('external_id', asset.id)
    .maybeSingle()
  const existing = prevRow ? rowToAsset(prevRow) : undefined
  const changed = existing ? cadastralFieldDiff(existing, next) : ['created']

  const { data, error } = await db.supabase
    .from('assets')
    .upsert(
      {
        organization_id: db.orgId,
        external_id: next.id,
        name: next.name,
        category: next.category,
        region: next.region,
        status: next.status,
        health: next.health,
        last_seen: next.lastSeen,
        map_x: next.mapX ?? null,
        map_y: next.mapY ?? null,
        patrimony_code: next.patrimonyCode ?? null,
        serial_number: next.serialNumber ?? null,
        manufacturer: next.manufacturer ?? null,
        model: next.model ?? null,
        address: next.address ?? null,
        location: next.location ?? null,
        connectivity_status: connectivityStatus,
        cadastral_status: cadastralStatus,
        criticality: next.criticality ?? 'média',
        responsible_org: next.responsibleOrg ?? null,
        responsible_team: next.responsibleTeam ?? null,
        notes: next.notes ?? null,
        installed_at: next.installedAt ? next.installedAt.slice(0, 10) : null,
        subtype: next.subtype ?? null,
        acquired_at: next.acquiredAt ? next.acquiredAt.slice(0, 10) : null,
        last_verified_at: next.lastVerifiedAt ? next.lastVerifiedAt.slice(0, 10) : null,
        created_by: existing?.createdBy ?? next.createdBy ?? db.actor?.email ?? db.actor?.displayName ?? null,
        updated_by: next.updatedBy ?? db.actor?.email ?? db.actor?.displayName ?? null,
        data_origin: next.dataOrigin ?? existing?.dataOrigin ?? 'manual',
        maintenance_interval_days: next.maintenanceIntervalDays ?? null,
        maintenance_next_due: next.maintenanceNextDue ? next.maintenanceNextDue.slice(0, 10) : null,
        maintenance_last_done: next.maintenanceLastDone ? next.maintenanceLastDone.slice(0, 10) : null,
        maintenance_plan_notes: next.maintenancePlanNotes ?? null,
        useful_life_months: next.usefulLifeMonths ?? null,
        degradation_level: next.degradationLevel ?? null,
        specs:
          (next.specs === null ? null : sanitizeAssetSpecs(next.category, next.specs ?? existing?.specs)) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,external_id' },
    )
    .select('id')
    .single()
  if (error) {
    const msg = error.message ?? ''
    if (/permission denied for function assets_sync_geom/i.test(msg)) {
      throw new Error('Não foi possível gravar o ativo: falta permissão no gatilho de coordenadas.')
    }
    throw error
  }
  if (data?.id) {
    await syncMapMarkerStatusForAsset(db, data.id, next.status)
    if (next.mapX != null && next.mapY != null) {
      await upsertMapMarkerForAsset(db, next, data.id, next.mapX, next.mapY)
    }
    await writeAudit(
      db,
      auditAction,
      'asset',
      { externalId: next.id, name: next.name, changedFields: changed },
      data.id,
    )
    if (changed.length > 0 && (auditAction === 'asset.create' || changed[0] !== 'created' || !existing)) {
      const cadastroChanged = existing ? changed.filter((f) => f !== 'created') : ['created']
      if (!existing || cadastroChanged.length > 0) {
        await db.supabase.from('asset_history').insert({
          organization_id: db.orgId,
          asset_external_id: next.id,
          actor_label: db.actor?.email ?? 'sistema',
          action: auditAction === 'asset.create' || !existing ? 'created' : 'updated',
          before_state: existing ? snapshotAsset(existing) : null,
          after_state: {
            ...snapshotAsset(next),
            ...(opts?.cadastralJustification ? { cadastralJustification: opts.cadastralJustification } : {}),
          },
          changed_fields: existing ? cadastroChanged : ['created'],
        })
      }
    }
  }
  const { assetProblemTransition, openAssetProblemOccurrence } = await import('./assets/problemOccurrence.js')
  const kind = assetProblemTransition(existing, next)
  if (kind) {
    await openAssetProblemOccurrence(db, next, kind).catch((err) =>
      console.error('[fogo] ocorrência do ativo', err instanceof Error ? err.message : err),
    )
  }
}

export async function listAssetHistory(db: FogoDb, externalId: string) {
  const { data, error } = await db.supabase
    .from('asset_history')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('asset_external_id', externalId)
    .order('changed_at', { ascending: false })
    .limit(80)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    assetId: row.asset_external_id as string,
    actorLabel: (row.actor_label as string) ?? 'sistema',
    action: row.action as string,
    before: (row.before_state as Record<string, unknown> | null) ?? null,
    after: (row.after_state as Record<string, unknown> | null) ?? null,
    changedFields: (row.changed_fields as string[]) ?? [],
    changedAt: row.changed_at as string,
  }))
}

export async function createAsset(db: FogoDb, asset: UrbanAsset) {
  await upsertAsset(db, asset, 'asset.create')
}

export async function deleteAssetByExternalId(db: FogoDb, externalId: string) {
  const uuid = await resolveAssetUuid(db, externalId)
  if (!uuid) return false
  await removeMapMarkersForAsset(db, uuid)
  const { error } = await db.supabase.from('assets').delete().eq('organization_id', db.orgId).eq('id', uuid)
  if (error) throw error
  await writeAudit(db, 'asset.delete', 'asset', { externalId }, uuid)
  return true
}

export async function getAssetRowUuid(db: FogoDb, externalId: string) {
  return resolveAssetUuid(db, externalId)
}

export async function listTeams(db: FogoDb): Promise<OperationalTeam[]> {
  const { data, error } = await db.supabase
    .from('teams')
    .select('*, team_members(display_name, sort_order)')
    .eq('organization_id', db.orgId)
    .order('name')
  if (error) throw error
  return (data ?? []).map((row) => rowToTeam(row))
}

export async function getTeam(db: FogoDb, externalId: string): Promise<OperationalTeam | null> {
  const { data, error } = await db.supabase
    .from('teams')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) throw error
  return data ? rowToTeam(data) : null
}

export async function upsertTeam(db: FogoDb, team: OperationalTeam, auditAction?: 'team.create' | 'team.update') {
  const { data, error } = await db.supabase
    .from('teams')
    .upsert(
      {
        organization_id: db.orgId,
        external_id: team.id,
        name: team.name,
        specialty_label: team.specialty,
        capabilities: team.capabilities,
        region: team.region,
        status: team.status,
        assigned_incident_protocol: team.assignedIncidentId ?? null,
        member_names: team.members,
        map_x: team.mapX ?? null,
        map_y: team.mapY ?? null,
        registration_number: team.registrationNumber ?? null,
        responsible_org: team.responsibleOrg ?? null,
        unit: team.unit ?? null,
        job_title: team.jobTitle ?? null,
        qualifications: team.qualifications ?? [],
        functional_status: team.functionalStatus ?? 'ativo',
        shifts: team.shifts ?? [],
        location_share_until: team.locationShareUntil ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,external_id' },
    )
    .select('id')
    .single()
  if (error) throw error
  if (data?.id) {
    await syncTeamMembers(db, data.id, team.members)
    await syncTeamMapMarker(db, team)
    if (auditAction) {
      await writeAudit(db, auditAction, 'team', { externalId: team.id, name: team.name }, data.id)
    }
  }
}

async function syncTeamMembers(db: FogoDb, teamUuid: string, members: string[]) {
  await db.supabase.from('team_members').delete().eq('team_id', teamUuid)
  for (let i = 0; i < members.length; i++) {
    const name = members[i]?.trim()
    if (!name) continue
    await db.supabase.from('team_members').insert({
      organization_id: db.orgId,
      team_id: teamUuid,
      display_name: name,
      sort_order: i,
    })
  }
}

async function syncTeamMapMarker(db: FogoDb, team: OperationalTeam) {
  const status =
    team.status === 'em campo' || team.status === 'em atividade'
      ? 'campo'
      : team.status === 'disponível'
        ? 'operacional'
        : 'inativo'
  const externalId = `team-${team.id}`
  if (team.mapX != null && team.mapY != null) {
    await db.supabase.from('map_markers').upsert(
      {
        organization_id: db.orgId,
        external_id: externalId,
        kind: 'equipe',
        name: team.name,
        map_x: team.mapX,
        map_y: team.mapY,
        status,
        region: team.region,
        updated_at: new Date().toISOString(),
        incident_protocol: team.assignedIncidentId ?? null,
      },
      { onConflict: 'organization_id,external_id' },
    )
    return
  }
  await db.supabase
    .from('map_markers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('organization_id', db.orgId)
    .eq('kind', 'equipe')
    .eq('name', team.name)
}

export async function deleteTeamByExternalId(db: FogoDb, externalId: string) {
  const { data: row } = await db.supabase
    .from('teams')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (!row) return false
  await db.supabase.from('team_members').delete().eq('team_id', row.id)
  await db.supabase.from('map_markers').delete().eq('organization_id', db.orgId).eq('external_id', `team-${externalId}`)
  const { error } = await db.supabase.from('teams').delete().eq('id', row.id)
  if (error) throw error
  await writeAudit(db, 'team.delete', 'team', { externalId }, row.id)
  return true
}

export async function releaseTeamFromIncident(db: FogoDb, incidentProtocol: string) {
  const { data: teams } = await db.supabase
    .from('teams')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('assigned_incident_protocol', incidentProtocol)
  for (const row of teams ?? []) {
    const team = rowToTeam(row)
    await upsertTeam(db, {
      ...team,
      status: 'disponível',
      assignedIncidentId: undefined,
    })
  }
}

export class DispatchError extends Error {
  constructor(
    message: string,
    public code:
      | 'TEAM_NOT_FOUND'
      | 'TEAM_BUSY'
      | 'TEAM_UNAVAILABLE'
      | 'NOT_QUALIFIED'
      | 'INCIDENT_NOT_FOUND'
      | 'INCIDENT_CLOSED'
      | 'MONITORING_OFF'
      | 'INVALID_SCHEDULE',
  ) {
    super(message)
    this.name = 'DispatchError'
  }
}

export async function dispatchTeamToIncident(
  db: FogoDb,
  incidentProtocol: string,
  teamExternalId: string,
  opts?: { ignoreMonitoring?: boolean; actorLabel?: string },
): Promise<{ incident: Incident; team: OperationalTeam }> {
  const settings = await getSimulationSettings(db)
  if (!settings.enabled && !opts?.ignoreMonitoring) {
    throw new DispatchError('Ative o monitoramento da cidade para acionar agentes.', 'MONITORING_OFF')
  }

  const incident = await getIncident(db, incidentProtocol)
  if (!incident) throw new DispatchError('Ordem de serviço não encontrada.', 'INCIDENT_NOT_FOUND')
  if (incident.status === 'resolvida' || incident.status === 'cancelada') {
    throw new DispatchError('Ordem de serviço já encerrada.', 'INCIDENT_CLOSED')
  }

  const team = await getTeam(db, teamExternalId)
  if (!team) throw new DispatchError('Agente não encontrado.', 'TEAM_NOT_FOUND')
  if (team.functionalStatus && team.functionalStatus !== 'ativo') {
    throw new DispatchError('Agente sem situação funcional ativa.', 'TEAM_UNAVAILABLE')
  }
  if (team.status === 'indisponível' || team.status === 'fora de escala' || team.status === 'pausa' || team.status === 'encerrado o turno') {
    throw new DispatchError('Agente indisponível no momento.', 'TEAM_UNAVAILABLE')
  }
  if ((team.status === 'em campo' || team.status === 'em atividade') && team.assignedIncidentId !== incidentProtocol) {
    throw new DispatchError('Agente já está em outro atendimento.', 'TEAM_BUSY')
  }

  const required =
    incident.requiredCapability ?? capabilityForIncidentType(incident.type)
  if (!teamCanHandle(team.capabilities, required)) {
    throw new DispatchError(
      `Agente sem qualificação para ${required}. Necessário acionar profissional habilitado.`,
      'NOT_QUALIFIED',
    )
  }

  if (team.assignedIncidentId && team.assignedIncidentId !== incidentProtocol) {
    throw new DispatchError('Agente já está em outro atendimento.', 'TEAM_BUSY')
  }

  const updatedTeam: OperationalTeam = {
    ...team,
    status: 'em campo',
    assignedIncidentId: incidentProtocol,
  }
  await upsertTeam(db, updatedTeam)

  const nextStatus: Incident['status'] =
    incident.status === 'em atendimento' || incident.status === 'aguardando material'
      ? incident.status
      : 'em deslocamento'
  const updatedIncident: Incident = {
    ...incident,
    requiredCapability: required,
    status: nextStatus,
    assignee: team.name,
    assignedTeamId: team.id,
  }
  const actorLabel = opts?.actorLabel ?? 'operador CCO'
  await insertIncidentHistory(
    db,
    incidentProtocol,
    incident.status,
    nextStatus,
    `Agente ${team.name} acionado`,
    actorLabel,
  )
  await upsertIncident(db, updatedIncident)

  const dispatchedAt = new Date().toISOString()
  const alerts = await listAlerts(db)
  for (const a of alerts.filter((al) => al.incidentId === incidentProtocol)) {
    if (!isOccurrenceFinal(a.state)) {
      await upsertAlert(db, {
        ...a,
        state: 'em atendimento',
        dispatchedAt: a.dispatchedAt ?? dispatchedAt,
      })
    }
  }

  await insertActivity(
    db,
    {
      id: `EVT-${Date.now()}-dsp`,
      timestamp: new Date().toISOString(),
      message: `Agente ${team.name} acionado para ${incidentProtocol} (${required}).`,
      kind: 'team',
      dataOrigin: generatedSignalOrigin(db),
    },
  )
  await writeAudit(db, 'incident.dispatch', 'incident', {
    incidentProtocol,
    teamId: team.id,
    requiredCapability: required,
  })

  return { incident: updatedIncident, team: updatedTeam }
}

export async function scheduleWorkOrder(
  db: FogoDb,
  incidentProtocol: string,
  opts: { teamId: string; start: string; end?: string; actorLabel?: string },
): Promise<{ incident: Incident; team: OperationalTeam }> {
  const incident = await getIncident(db, incidentProtocol)
  if (!incident) throw new DispatchError('Ordem de serviço não encontrada.', 'INCIDENT_NOT_FOUND')
  if (incident.status === 'resolvida' || incident.status === 'cancelada') {
    throw new DispatchError('Ordem de serviço já encerrada.', 'INCIDENT_CLOSED')
  }

  const start = new Date(opts.start)
  if (Number.isNaN(start.getTime())) {
    throw new DispatchError('Horário de início inválido.', 'INVALID_SCHEDULE')
  }
  const end = opts.end ? new Date(opts.end) : new Date(start.getTime() + 3600_000)
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    throw new DispatchError('Horário de término deve ser posterior ao início.', 'INVALID_SCHEDULE')
  }

  const team = await getTeam(db, opts.teamId)
  if (!team) throw new DispatchError('Agente não encontrado.', 'TEAM_NOT_FOUND')
  if (team.functionalStatus && team.functionalStatus !== 'ativo') {
    throw new DispatchError('Agente sem situação funcional ativa.', 'TEAM_UNAVAILABLE')
  }
  if (team.status === 'indisponível' || team.status === 'fora de escala' || team.status === 'pausa' || team.status === 'encerrado o turno') {
    throw new DispatchError('Agente indisponível no momento.', 'TEAM_UNAVAILABLE')
  }

  const required = incident.requiredCapability ?? capabilityForIncidentType(incident.type)

  const updatedIncident: Incident = {
    ...incident,
    requiredCapability: required,
    status: 'agendada',
    assignee: team.name,
    assignedTeamId: team.id,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    dueAt: incident.dueAt ?? end.toISOString(),
  }
  const actorLabel = opts.actorLabel ?? 'operador CCO'
  await insertIncidentHistory(
    db,
    incidentProtocol,
    incident.status,
    'agendada',
    `OS agendada para o agente ${team.name} em ${start.toLocaleString('pt-BR')}`,
    actorLabel,
  )
  await upsertIncident(db, updatedIncident)

  const dispatchedAt = new Date().toISOString()
  const alerts = await listAlerts(db)
  for (const a of alerts.filter((al) => al.incidentId === incidentProtocol)) {
    if (a.state !== 'resolvido' && a.state !== 'falso positivo') {
      await upsertAlert(db, {
        ...a,
        dispatchedAt: a.dispatchedAt ?? dispatchedAt,
      })
    }
  }

  await insertActivity(db, {
    id: `EVT-${Date.now()}-agd`,
    timestamp: new Date().toISOString(),
    message: `OS ${incidentProtocol} agendada com ${team.name}.`,
    kind: 'incident',
    dataOrigin: generatedSignalOrigin(db),
  })
  await writeAudit(db, 'incident.schedule', 'incident', {
    incidentProtocol,
    teamId: team.id,
    start: start.toISOString(),
    end: end.toISOString(),
  })

  return { incident: updatedIncident, team }
}

export async function resetTeamsOperationalState(db: FogoDb) {
  const teams = await listTeams(db)
  for (const t of teams) {
    await upsertTeam(db, { ...t, status: 'disponível', assignedIncidentId: undefined })
  }
}

export async function listMaintenance(db: FogoDb): Promise<MaintenanceOrder[]> {
  const { data, error } = await db.supabase
    .from('maintenance_orders')
    .select('*, assets:asset_id(external_id)')
    .eq('organization_id', db.orgId)
  if (error) throw error
  return (data ?? []).map((row) => rowToMaintenance(row))
}

export async function upsertMaintenance(db: FogoDb, order: MaintenanceOrder, auditAction?: 'maintenance.create' | 'maintenance.update') {
  const assetId = order.assetId ? await resolveAssetUuid(db, order.assetId) : null
  const { data, error } = await db.supabase
    .from('maintenance_orders')
    .upsert(
      {
        organization_id: db.orgId,
        external_id: order.id,
        asset_id: assetId,
        asset_name: order.assetName,
        type: order.type,
        priority: order.priority,
        assignee: order.assignee,
        due_date: order.dueDate,
        status: order.status,
        description: order.description ?? null,
        origin: order.origin ?? 'manual',
        source_alert_protocol: order.sourceAlertId ?? null,
        opened_at: order.openedAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,external_id' },
    )
    .select('id')
    .single()
  if (error) throw error
  if (auditAction && data?.id) {
    await writeAudit(db, auditAction, 'maintenance', { externalId: order.id, assetId: order.assetId }, data.id)
  }
}

export async function createMaintenanceOrder(
  db: FogoDb,
  body: Omit<MaintenanceOrder, 'id'> & { id?: string },
): Promise<MaintenanceOrder> {
  const dueAt = body.dueDate
    ? body.dueDate.length <= 10
      ? `${body.dueDate}T12:00:00.000Z`
      : body.dueDate
    : undefined
  const subjects = await listWorkOrderSubjects(db)
  const hint = (body.type ?? '').toLowerCase()
  const subject =
    subjects.find((s) => s.name.toLowerCase().includes(hint)) ??
    subjects.find((s) => s.name.toLowerCase().includes('inspeção')) ??
    subjects[0]
  if (!subject) throw new Error('Cadastre um assunto de ordem de serviço.')
  const incident = await createWorkOrder(db, {
    description: body.description?.trim() || `${body.type} — ${body.assetName}`,
    type: body.type,
    priority: body.priority,
    relatedAssetId: body.assetId || undefined,
    location: body.assetName,
    assignee: body.assignee,
    dueAt,
    sourceAlertId: body.sourceAlertId,
    dataOrigin: 'manual',
    subjectId: subject.id,
    subjectLabel: subject.name,
  })
  return {
    id: incident.id,
    assetId: incident.relatedAssetId ?? body.assetId ?? '',
    assetName: body.assetName || incident.location,
    type: body.type,
    priority: incident.priority,
    assignee: incident.assignee ?? body.assignee,
    dueDate: (incident.dueAt ?? body.dueDate).slice(0, 10),
    status: incident.status === 'em atendimento' ? 'em execução' : 'pendente',
    description: incident.description,
    origin: body.origin ?? 'os',
    sourceAlertId: incident.sourceAlertId,
    openedAt: incident.openedAt,
  }
}

export async function patchMaintenanceStatus(
  db: FogoDb,
  externalId: string,
  status: MaintenanceStatus,
  note?: string,
  actorLabel = 'operador CCO',
): Promise<MaintenanceOrder | null> {
  const orders = await listMaintenance(db)
  const existing = orders.find((o) => o.id === externalId)
  if (!existing) return null
  const allowed = MAINT_TRANSITIONS[existing.status]
  if (!allowed.includes(status)) {
    throw new Error(`Transição inválida: ${existing.status} → ${status}`)
  }
  const updated = { ...existing, status }
  await upsertMaintenance(db, updated, 'maintenance.update')
  await insertMaintenanceHistory(db, externalId, existing.status, status, note, actorLabel)
  return updated
}

async function insertMaintenanceHistory(
  db: FogoDb,
  maintenanceId: string,
  fromStatus: MaintenanceStatus | null,
  toStatus: MaintenanceStatus,
  note?: string,
  actorLabel = 'operador',
) {
  await db.supabase.from('maintenance_history').insert({
    organization_id: db.orgId,
    maintenance_external_id: maintenanceId,
    from_status: fromStatus,
    to_status: toStatus,
    note: note ?? null,
    actor_label: actorLabel,
  })
}

export async function listMaintenanceHistory(db: FogoDb, externalId: string): Promise<MaintenanceHistoryEntry[]> {
  const { data, error } = await db.supabase
    .from('maintenance_history')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('maintenance_external_id', externalId)
    .order('changed_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    maintenanceId: row.maintenance_external_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    actorLabel: row.actor_label,
    changedAt: row.changed_at,
  }))
}

export async function createMaintenanceFromAlert(_db: FogoDb, _alertProtocol: string): Promise<MaintenanceOrder> {
  throw new Error('A ordem de serviço só pode ser aberta manualmente, com assunto, a partir da ocorrência.')
}

export async function listMapMarkers(db: FogoDb): Promise<MapMarkerDto[]> {
  const { data, error } = await db.supabase
    .from('map_markers')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => rowToMapMarker(row) as MapMarkerDto)
}

export async function getCityMapImage(db: FogoDb): Promise<string> {
  const { data, error } = await db.supabase
    .from('cities')
    .select('map_image_path')
    .eq('organization_id', db.orgId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const path = data?.map_image_path ?? ''
  if (!path || path.includes('city-aerial')) return ''
  return path
}

export async function insertIncidentHistory(
  db: FogoDb,
  protocol: string,
  fromStatus: IncidentStatus | null,
  toStatus: IncidentStatus,
  note?: string,
  actorLabel = 'operador',
) {
  const { error } = await db.supabase.from('incident_history').insert({
    organization_id: db.orgId,
    incident_protocol: protocol,
    from_status: fromStatus,
    to_status: toStatus,
    note: note ?? null,
    actor_label: actorLabel,
  })
  if (error) throw error
}

export async function listIncidentHistory(db: FogoDb, protocol: string): Promise<IncidentHistoryEntry[]> {
  const { data, error } = await db.supabase
    .from('incident_history')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('incident_protocol', protocol)
    .order('changed_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []).map((row) => ({
    id: row.id,
    incidentProtocol: row.incident_protocol,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    actorLabel: row.actor_label,
    changedAt: row.changed_at,
  }))
  if (rows.length) return rows
  const legacy = await listMaintenanceHistory(db, protocol)
  return legacy.map((h) => ({
    id: h.id,
    incidentProtocol: protocol,
    fromStatus: h.fromStatus === 'em execução' ? 'em atendimento' : h.fromStatus === 'concluída' ? 'resolvida' : h.fromStatus ? 'aberta' : null,
    toStatus: h.toStatus === 'em execução' ? 'em atendimento' : h.toStatus === 'concluída' ? 'resolvida' : 'aberta',
    note: h.note,
    actorLabel: h.actorLabel,
    changedAt: h.changedAt,
  }))
}

export async function getAlert(db: FogoDb, protocol: string) {
  const { data, error } = await db.supabase
    .from('alerts')
    .select('*, assets:related_asset_id(external_id), incidents:incident_id(protocol)')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (error) throw error
  return data ? rowToAlert(data) : null
}

export type AlertActor = { userId: string; label: string }

export class ClaimError extends Error {
  constructor(
    message: string,
    public code: 'ALREADY_CLAIMED' | 'ALERT_CLOSED' | 'NOT_FOUND',
  ) {
    super(message)
    this.name = 'ClaimError'
  }
}

async function stampLastAlertHistory(
  db: FogoDb,
  protocol: string,
  note: string | undefined,
  actorLabel: string,
) {
  const { data: row } = await db.supabase
    .from('alerts')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (!row) return
  const { data: hist } = await db.supabase
    .from('alert_history')
    .select('id')
    .eq('alert_id', row.id)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (hist) {
    await db.supabase
      .from('alert_history')
      .update({ note: note ?? null, actor_label: actorLabel })
      .eq('id', hist.id)
  }
}

export async function appendAlertHistory(
  db: FogoDb,
  protocol: string,
  fromState: AlertState | null,
  toState: AlertState,
  note: string,
  actorLabel: string,
) {
  const { data: row } = await db.supabase
    .from('alerts')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (!row) return
  await db.supabase.from('alert_history').insert({
    organization_id: db.orgId,
    alert_id: row.id,
    from_state: fromState,
    to_state: toState,
    note,
    actor_label: actorLabel,
  })
}

export async function patchAlertState(
  db: FogoDb,
  protocol: string,
  state: AlertState,
  note?: string,
  actor?: AlertActor | string,
) {
  const existing = await getAlert(db, protocol)
  if (!existing) return null
  if (isOccurrenceFinal(existing.state) && existing.state !== state) {
    throw new Error('Ocorrência já finalizada.')
  }
  if (state === 'os_aberta') {
    throw new Error('Abra uma ordem de serviço para vincular a ocorrência.')
  }
  if (isOccurrenceSlaClosed(state) && !note?.trim()) {
    throw new Error('Informe o relato da atuação no CCO.')
  }
  const actorLabel = typeof actor === 'string' ? actor : actor?.label ?? 'operador CCO'
  const actorId = typeof actor === 'object' && actor ? actor.userId : undefined
  const now = new Date().toISOString()
  const updated: OperationalAlert = { ...existing, state }
  if (actorId && !existing.claimedBy && state !== 'falso positivo') {
    updated.claimedBy = actorId
    updated.claimedByLabel = actorLabel
    updated.claimedAt = existing.claimedAt ?? now
  }
  if (isOccurrenceSlaClosed(state)) {
    updated.completedAt = existing.completedAt ?? now
  }
  await upsertAlert(db, updated)
  await stampLastAlertHistory(db, protocol, note, actorLabel)
  await writeAudit(db, 'alert.transition', 'alert', { protocol, state })
  return updated
}

const OPEN_OCCURRENCE_STATES = ['novo', 'reconhecido', 'em atendimento', 'em observação'] as const

/** Encerra a fila em aberto. As linhas permanecem para o histórico do Prevision Engine. */
export async function resolveOpenOccurrences(db: FogoDb, actorLabel: string): Promise<{ resolved: number }> {
  const note =
    'Solucionada nas configurações para organizar a fila do CCO. O registro permanece no histórico do Prevision Engine.'
  const now = new Date().toISOString()
  let resolved = 0
  for (let page = 0; page < 100; page++) {
    const { data, error } = await db.supabase
      .from('alerts')
      .select('id, state')
      .eq('organization_id', db.orgId)
      .in('state', [...OPEN_OCCURRENCE_STATES])
      .order('id', { ascending: true })
      .limit(200)
    if (error) throw error
    const batch = data ?? []
    if (!batch.length) break
    const ids = batch.map((row) => row.id as string)
    const { error: updateError } = await db.supabase
      .from('alerts')
      .update({ state: 'resolvido', completed_at: now, updated_at: now })
      .eq('organization_id', db.orgId)
      .in('id', ids)
    if (updateError) throw updateError
    const { error: historyError } = await db.supabase.from('alert_history').insert(
      batch.map((row) => ({
        organization_id: db.orgId,
        alert_id: row.id,
        from_state: row.state,
        to_state: 'resolvido',
        note,
        actor_label: actorLabel,
      })),
    )
    if (historyError) throw historyError
    resolved += batch.length
    if (batch.length < 200) break
  }
  if (resolved > 0) {
    await insertActivity(db, {
      id: `EVT-fila-${Date.now()}`,
      timestamp: now,
      message: `${resolved} ocorrência(s) em aberto solucionada(s). O histórico permanece para o Prevision Engine.`,
      kind: 'alert',
      dataOrigin: 'manual',
    })
  }
  return { resolved }
}

export async function assumeAlert(db: FogoDb, protocol: string, actor: AlertActor) {
  const existing = await getAlert(db, protocol)
  if (!existing) throw new ClaimError('Alerta não encontrado', 'NOT_FOUND')
  if (isOccurrenceFinal(existing.state)) {
    throw new ClaimError('Ocorrência já encerrada', 'ALERT_CLOSED')
  }
  if (existing.claimedBy && existing.claimedBy !== actor.userId) {
    throw new ClaimError(`Alerta já assumido por ${existing.claimedByLabel ?? 'outro operador'}`, 'ALREADY_CLAIMED')
  }
  const now = new Date().toISOString()
  const nextState: AlertState = existing.state === 'novo' ? 'reconhecido' : existing.state
  const updated: OperationalAlert = {
    ...existing,
    state: nextState,
    claimedBy: actor.userId,
    claimedByLabel: actor.label,
    claimedAt: existing.claimedAt ?? now,
  }
  await upsertAlert(db, updated)
  if (nextState !== existing.state) {
    await stampLastAlertHistory(db, protocol, `${actor.label} assumiu o alerta`, actor.label)
  } else if (!existing.claimedAt) {
    await appendAlertHistory(db, protocol, existing.state, existing.state, `${actor.label} assumiu o alerta`, actor.label)
  }
  await writeAudit(db, 'alert.assume', 'alert', { protocol, claimedBy: actor.userId })
  return updated
}

export async function listAlertHistory(db: FogoDb, protocol: string): Promise<AlertHistoryEntry[]> {
  const { data: alertRow } = await db.supabase
    .from('alerts')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (!alertRow) return []
  const { data, error } = await db.supabase
    .from('alert_history')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('alert_id', alertRow.id)
    .order('changed_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    alertProtocol: protocol,
    fromState: row.from_state,
    toState: row.to_state,
    note: row.note,
    actorLabel: row.actor_label ?? 'sistema',
    changedAt: row.changed_at,
  }))
}

export async function listAlertsForIncident(db: FogoDb, incidentProtocol: string): Promise<OperationalAlert[]> {
  const incidentUuid = await resolveIncidentUuid(db, incidentProtocol)
  if (!incidentUuid) return []
  const { data, error } = await db.supabase
    .from('alerts')
    .select('*, assets:related_asset_id(external_id), incidents:incident_id(protocol)')
    .eq('organization_id', db.orgId)
    .eq('incident_id', incidentUuid)
  if (error) throw error
  return (data ?? []).map((row) => rowToAlert(row))
}

export async function finalizeOccurrenceWithOs(db: FogoDb, alertProtocol: string, incidentProtocol: string) {
  const alert = await getAlert(db, alertProtocol)
  if (!alert) return
  if (isOccurrenceSlaClosed(alert.state)) return
  const updated: OperationalAlert = { ...alert, incidentId: incidentProtocol, state: 'os_aberta' }
  await upsertAlert(db, updated)
  await appendAlertHistory(
    db,
    alertProtocol,
    alert.state,
    'os_aberta',
    `OS ${incidentProtocol} aberta e vinculada à ocorrência.`,
    'operador CCO',
  )
}

export async function linkAlertsToIncident(db: FogoDb, incidentProtocol: string, alertProtocols: string[]) {
  const incidentUuid = await resolveIncidentUuid(db, incidentProtocol)
  if (!incidentUuid) throw new Error('Ordem de serviço não encontrada')
  for (const protocol of alertProtocols) {
    await finalizeOccurrenceWithOs(db, protocol, incidentProtocol)
    const { data: row } = await db.supabase
      .from('alerts')
      .select('id')
      .eq('organization_id', db.orgId)
      .eq('protocol', protocol)
      .maybeSingle()
    if (row) {
      await db.supabase.from('alerts').update({ incident_id: incidentUuid }).eq('id', row.id)
    }
  }
  await writeAudit(db, 'incident.link_alerts', 'incident', { incidentProtocol, alertProtocols })
}

export async function createIncidentFromAlert(
  db: FogoDb,
  alertProtocol: string,
  opts: {
    priority?: Incident['priority']
    dueAt?: string
    notes?: string
    description?: string
    subjectId?: string
  } = {},
): Promise<Incident> {
  const alert = await getAlert(db, alertProtocol)
  if (!alert) throw new Error('Ocorrência não encontrada')
  if (isOccurrenceSlaClosed(alert.state)) {
    throw new Error('Ocorrência já finalizada no CCO.')
  }
  if (alert.incidentId) {
    const existing = await getIncident(db, alert.incidentId)
    if (existing) return existing
  }
  if (!opts.subjectId?.trim()) {
    throw new Error('Informe o assunto da ordem de serviço.')
  }
  const subject = await getWorkOrderSubject(db, opts.subjectId.trim())
  if (!subject?.active) {
    throw new Error('Assunto da ordem de serviço inválido.')
  }
  const id = `OS-${(await nextCounter(db, 'incident')).toString().padStart(4, '0')}`
  const type = alert.category
  const occurrenceText = [alert.title, alert.description].filter(Boolean).join(' — ')
  const incident: Incident = {
    id,
    description: occurrenceText,
    workOrderDescription: opts.description?.trim() || subject.name,
    type,
    region: alert.region ?? 'Centro',
    priority:
      opts.priority ??
      (alert.severity === 'informativa'
        ? 'média'
        : alert.severity === 'crítica' || alert.severity === 'alta'
          ? alert.severity
          : 'média'),
    status: 'aberta',
    openedAt: new Date().toISOString(),
    location: alert.region ?? '—',
    relatedAssetId: alert.relatedAssetId,
    dataOrigin: alert.dataOrigin,
    sourceAlertId: alert.id,
    subjectId: subject.id,
    subjectLabel: subject.name,
    requiredCapability: capabilityForAlertCategory(alert.category),
    dueAt: opts.dueAt,
    notes:
      opts.notes?.trim() ||
      [
        `Ocorrência ${alert.id}`,
        `Categoria: ${alert.category}`,
        alert.relatedAssetId ? `Ativo: ${alert.relatedAssetId}` : null,
        alert.region ? `Região: ${alert.region}` : null,
        `Severidade: ${alert.severity}`,
      ]
        .filter(Boolean)
        .join('\n'),
  }
  await upsertIncident(db, incident)
  await linkAlertsToIncident(db, id, [alertProtocol])
  await writeAudit(db, 'incident.from_alert', 'incident', { alertProtocol, incidentId: id })
  return incident
}

export async function escalateOverdueAlerts(db: FogoDb) {
  const alerts = await listAlerts(db)
  const open = alerts.filter((a) => isOccurrencePending(a.state))
  for (const alert of open) {
    if (!isAlertOverdue(alert.responseDueAt, alert.state)) continue
    const level = (alert.escalationLevel ?? 0) + 1
    if (level > 3) continue
    await db.supabase
      .from('alerts')
      .update({
        escalation_level: level,
        escalated_at: new Date().toISOString(),
        severity: level >= 2 && alert.severity !== 'crítica' ? 'alta' : alert.severity,
      })
      .eq('organization_id', db.orgId)
      .eq('protocol', alert.id)
    await insertActivity(db, {
      id: `EVT-esc-${alert.id}-${level}`,
      timestamp: new Date().toISOString(),
      message: `Alerta ${alert.id} escalonado (nível ${level}) — prazo de resposta excedido.`,
      kind: 'alert',
      dataOrigin: generatedSignalOrigin(db),
    })
  }
}

export async function searchOperational(db: FogoDb, query: string, limit = 20): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const [assets, teams, alerts, incidents] = await Promise.all([
    listAssets(db),
    listTeams(db),
    listAlerts(db),
    listIncidents(db),
  ])
  const hits: SearchHit[] = []
  for (const a of assets) {
    if (
      a.id.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.address?.toLowerCase().includes(q) ?? false) ||
      (a.patrimonyCode?.toLowerCase().includes(q) ?? false)
    ) {
      hits.push({
        kind: 'asset',
        id: a.id,
        label: a.name,
        sublabel: a.address ?? a.region,
        path: `/ativos?ativo=${encodeURIComponent(a.id)}`,
      })
    }
  }
  for (const t of teams) {
    if (t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.region.toLowerCase().includes(q)) {
      hits.push({ kind: 'team', id: t.id, label: t.name, sublabel: t.region, path: '/equipes' })
    }
  }
  for (const al of alerts) {
    if (al.id.toLowerCase().includes(q) || al.title.toLowerCase().includes(q)) {
      hits.push({ kind: 'alert', id: al.id, label: al.title, sublabel: al.state, path: '/alertas' })
    }
  }
  for (const i of incidents) {
    if (i.id.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.location.toLowerCase().includes(q)) {
      hits.push({ kind: 'incident', id: i.id, label: i.id, sublabel: i.description.slice(0, 60), path: '/ordens-servico' })
    }
  }
  return hits.slice(0, limit)
}

export async function listRegionSummaries(db: FogoDb): Promise<RegionSummary[]> {
  const [assets, alerts, incidents] = await Promise.all([listAssets(db), listAlerts(db), listIncidents(db)])
  const regions = new Set<string>()
  assets.forEach((a) => regions.add(a.region))
  alerts.forEach((a) => a.region && regions.add(a.region))
  incidents.forEach((i) => regions.add(i.region))

  const resolved = incidents.filter((i) => i.status === 'resolvida' && i.resolvedAt)
  return [...regions].sort().map((region) => {
    const regAssets = assets.filter((a) => a.region === region)
    const availability = computeAvailability(regAssets)
    const openAlerts = alerts.filter(
      (a) => a.region === region && isOccurrencePending(a.state),
    )
    const openIncidents = incidents.filter(
      (i) => i.region === region && i.status !== 'resolvida' && i.status !== 'cancelada',
    )
    const mttrSamples = resolved
      .filter((i) => i.region === region && i.resolvedAt)
      .map((i) => (new Date(i.resolvedAt!).getTime() - new Date(i.openedAt).getTime()) / 60_000)
    const avgMttrMinutes =
      mttrSamples.length > 0 ? Math.round(mttrSamples.reduce((a, b) => a + b, 0) / mttrSamples.length) : null
    return {
      region,
      assetsTotal: regAssets.length,
      assetsEligible: availability.eligible,
      assetsExcluded: availability.excluded,
      assetsAlert: availability.alert,
      availabilityPercent: availability.percent,
      openAlerts: openAlerts.length,
      openIncidents: openIncidents.length,
      avgMttrMinutes,
    }
  })
}

const MONITORING_ALERT_SOURCE = 'Monitoramento da cidade'

/** Zera fila operacional (alertas, ocorrências, atividade, manutenção) mantendo cadastros no banco. */
export async function resetOperationalMonitoringData(db: FogoDb): Promise<SimulationSettings> {
  const orgId = db.orgId

  const { error: ahErr } = await db.supabase.from('alert_history').delete().eq('organization_id', orgId)
  if (ahErr) throw ahErr

  const { error: alErr } = await db.supabase.from('alerts').delete().eq('organization_id', orgId)
  if (alErr) throw alErr

  const { error: ihErr } = await db.supabase.from('incident_history').delete().eq('organization_id', orgId)
  if (ihErr) throw ihErr

  const { error: mmOccErr } = await db.supabase
    .from('map_markers')
    .delete()
    .eq('organization_id', orgId)
    .eq('kind', 'ocorrencia')
  if (mmOccErr) throw mmOccErr

  const { error: mmLinkErr } = await db.supabase
    .from('map_markers')
    .delete()
    .eq('organization_id', orgId)
    .not('incident_protocol', 'is', null)
  if (mmLinkErr) throw mmLinkErr

  const { error: incErr } = await db.supabase.from('incidents').delete().eq('organization_id', orgId)
  if (incErr) throw incErr

  const { error: actErr } = await db.supabase.from('activity_events').delete().eq('organization_id', orgId)
  if (actErr) throw actErr

  const { error: telErr } = await db.supabase.from('telemetry_events').delete().eq('organization_id', orgId)
  if (telErr) throw telErr

  const { error: predErr } = await db.supabase.from('predictions').delete().eq('organization_id', orgId)
  if (predErr) throw predErr

  const { error: moErr } = await db.supabase.from('maintenance_orders').delete().eq('organization_id', orgId)
  if (moErr) throw moErr

  const { error: ctrErr } = await db.supabase.from('counters').delete().eq('organization_id', orgId)
  if (ctrErr) throw ctrErr

  await resetTeamsOperationalState(db)
  const { resetCrisisState } = await import('./crisis/service.js')
  await resetCrisisState(db)

  const assets = await listAssets(db)
  for (const asset of assets) {
    if (asset.status === 'alerta' || asset.health < 88) {
      await upsertAsset(db, {
        ...asset,
        status: 'operacional',
        health: Math.max(asset.health, 92),
        lastSeen: asset.lastSeen,
      })
    }
  }

  const prev = await getSimulationSettings(db)
  const next = await setSimulationSettings(db, {
    ...prev,
    enabled: false,
    ticksTotal: 0,
    lastTickAt: undefined,
    startedAt: undefined,
  })

  await insertActivity(db, {
    id: `EVT-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: 'Operação reiniciada — alertas e ocorrências zerados; cadastros da cidade mantidos.',
    kind: 'system',
    dataOrigin: generatedSignalOrigin(db),
  })

  return next
}

export { MONITORING_ALERT_SOURCE }

export async function bootstrap(db: FogoDb) {
  await ensureAssetCategories(db)
  const [simulation, incidents, alerts, activity, assets, maintenance, teams, assetCategories, mapMarkers, cityMapImage] =
    await Promise.all([
      getSimulationSettings(db),
      listIncidents(db),
      listAlerts(db),
      listActivity(db),
      listAssets(db),
      listMaintenance(db),
      listTeams(db),
      listAssetCategories(db),
      listMapMarkers(db),
      getCityMapImage(db),
    ])
  return {
    simulation,
    incidents,
    alerts,
    activity,
    assets,
    maintenance,
    teams,
    assetCategories,
    mapMarkers,
    cityMapImage,
    serverTime: new Date().toISOString(),
  }
}

async function resolveAssetUuid(db: FogoDb, externalId: string): Promise<string | null> {
  const { data, error } = await db.supabase
    .from('assets')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function resolveIncidentUuid(db: FogoDb, protocol: string): Promise<string | null> {
  const { data, error } = await db.supabase
    .from('incidents')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}
