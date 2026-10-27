import type { FogoDb } from '../db.js'
import { HttpError } from '../httpError.js'
import { nextCounter, raiseCounterAtLeast } from '../repository.js'
import { formatRouteExternalId, maxRouteSerial } from './routeIds.js'
import type { StreetRoute } from './osrm.js'
import type { PlannedStop, ScheduleConflict } from './planner.js'

function throwRouteDb(error: { message?: string; code?: string; details?: string; hint?: string } | null): asserts error is null {
  if (!error) return
  const msg = error.message ?? 'Falha no banco de rotas.'
  console.error('[fogo] rotas', error.code ?? '', msg, error.details ?? '', error.hint ?? '')
  if (/schema cache|Could not find the table|does not exist/i.test(msg)) {
    throw new HttpError(503, 'O módulo de rotas ainda não está disponível no banco.')
  }
  if (error.code === '23505' && /external_id/i.test(`${msg} ${error.details ?? ''}`)) {
    throw new HttpError(409, 'Já existe uma rota com esse identificador. Tente salvar de novo.')
  }
  throw new HttpError(500, 'Não foi possível ler ou gravar as rotas.')
}

async function allocateRouteExternalId(db: FogoDb): Promise<string> {
  const { data, error } = await db.supabase
    .from('operational_routes')
    .select('external_id')
    .eq('organization_id', db.orgId)
    .limit(5000)
  if (error) throwRouteDb(error)
  const floor = maxRouteSerial((data ?? []).map((row) => String(row.external_id ?? '')))
  await raiseCounterAtLeast(db, 'operational_route', floor)
  return formatRouteExternalId(await nextCounter(db, 'operational_route'))
}

export type RouteStatus = 'draft' | 'planned' | 'available' | 'in_progress' | 'completed' | 'cancelled'

export type SavedRoute = {
  id: string
  name: string
  agentId: string
  agentName: string
  plannedDate: string | null
  origin: {
    lat: number
    lng: number
    description: string | null
    source: string
    recordedAt?: string | null
  }
  geometry: StreetRoute['geometry'] | null
  distanceMeters: number | null
  durationSeconds: number | null
  provider: string | null
  providerVersion: string | null
  optimization: string | null
  constraints: Record<string, unknown> | null
  notes: string | null
  status: RouteStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
  stops: Array<{
    incidentId: string
    sequence: number
    lat: number
    lng: number
    address: string | null
    coordSource: string | null
    estimatedArrivalAt: string | null
    estimatedDepartureAt: string | null
    status: string
  }>
}

const EDITABLE = new Set<RouteStatus>(['draft', 'planned', 'available'])

function mapRoute(row: Record<string, unknown>, stops: SavedRoute['stops']): SavedRoute {
  return {
    id: row.external_id as string,
    name: row.name as string,
    agentId: row.agent_external_id as string,
    agentName: row.agent_name as string,
    plannedDate: (row.planned_date as string) ?? null,
    origin: {
      lat: Number(row.origin_latitude),
      lng: Number(row.origin_longitude),
      description: (row.origin_description as string) ?? null,
      source: (row.origin_source as string) ?? 'cadastro_operacional',
      recordedAt: (row.origin_recorded_at as string) ?? null,
    },
    geometry: (row.geometry as SavedRoute['geometry']) ?? null,
    distanceMeters: row.total_distance_meters != null ? Number(row.total_distance_meters) : null,
    durationSeconds: row.estimated_duration_seconds != null ? Number(row.estimated_duration_seconds) : null,
    provider: (row.provider as string) ?? null,
    providerVersion: (row.provider_version as string) ?? null,
    optimization: (row.optimization as string) ?? null,
    constraints: (row.constraints as Record<string, unknown>) ?? null,
    notes: (row.notes as string) ?? null,
    status: row.status as RouteStatus,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    stops,
  }
}

async function loadStops(db: FogoDb, routeUuid: string): Promise<SavedRoute['stops']> {
  const { data, error } = await db.supabase
    .from('operational_route_stops')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('route_id', routeUuid)
    .order('sequence', { ascending: true })
  if (error) throwRouteDb(error)
  return (data ?? []).map((s) => ({
    incidentId: s.incident_protocol as string,
    sequence: Number(s.sequence),
    lat: Number(s.latitude),
    lng: Number(s.longitude),
    address: (s.address as string) ?? null,
    coordSource: (s.coord_source as string) ?? null,
    estimatedArrivalAt: (s.estimated_arrival_at as string) ?? null,
    estimatedDepartureAt: (s.estimated_departure_at as string) ?? null,
    status: s.status as string,
  }))
}

export async function listSavedRoutes(db: FogoDb): Promise<SavedRoute[]> {
  const { data, error } = await db.supabase
    .from('operational_routes')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) throwRouteDb(error)
  const out: SavedRoute[] = []
  for (const row of data ?? []) {
    out.push(mapRoute(row, await loadStops(db, row.id as string)))
  }
  return out
}

export async function getSavedRoute(db: FogoDb, externalId: string): Promise<SavedRoute | null> {
  const { data, error } = await db.supabase
    .from('operational_routes')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) throwRouteDb(error)
  if (!data) return null
  return mapRoute(data, await loadStops(db, data.id as string))
}

async function writeHistory(
  db: FogoDb,
  routeUuid: string,
  action: string,
  previous: unknown,
  next: unknown,
) {
  await db.supabase.from('operational_route_history').insert({
    organization_id: db.orgId,
    route_id: routeUuid,
    action,
    previous_data: previous ?? null,
    new_data: next ?? null,
    performed_by: db.actor?.email ?? db.actor?.userId ?? null,
  })
}

export async function listRouteHistory(db: FogoDb, externalId: string) {
  const { data: route, error } = await db.supabase
    .from('operational_routes')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) throwRouteDb(error)
  if (!route) return []
  const { data, error: hErr } = await db.supabase
    .from('operational_route_history')
    .select('action, previous_data, new_data, performed_by, created_at')
    .eq('route_id', route.id)
    .order('created_at', { ascending: false })
    .limit(80)
  if (hErr) throwRouteDb(hErr)
  return data ?? []
}

export async function insertRoute(
  db: FogoDb,
  input: {
    name: string
    plannedDate?: string | null
    notes?: string | null
    status?: RouteStatus
    agentId: string
    agentName: string
    origin: { lat: number; lng: number; description?: string; source: string; recordedAt?: string }
    street: StreetRoute
    stops: PlannedStop[]
    conflicts: ScheduleConflict[]
    scheduleValidated: boolean
    expectedUpdatedAt?: string
  },
): Promise<SavedRoute> {
  let externalId = await allocateRouteExternalId(db)
  const now = new Date().toISOString()
  const row = {
      organization_id: db.orgId,
      external_id: externalId,
      name: input.name.trim(),
      agent_external_id: input.agentId,
      agent_name: input.agentName,
      planned_date: input.plannedDate?.trim() || null,
      origin_latitude: input.origin.lat,
      origin_longitude: input.origin.lng,
      origin_description: input.origin.description ?? null,
      origin_source: input.origin.source,
      origin_recorded_at: input.origin.recordedAt?.trim() || null,
      geometry: input.street.geometry,
      total_distance_meters: input.street.distanceMeters,
      estimated_duration_seconds: input.street.durationSeconds,
      provider: input.street.provider,
      provider_version: input.street.providerVersion,
      optimization: input.street.optimized ? 'osrm-trip' : 'manual-or-route',
      constraints: { conflicts: input.conflicts, scheduleValidated: input.scheduleValidated },
      notes: input.notes ?? null,
      status: input.status ?? 'planned',
      created_by: db.actor?.email ?? db.actor?.userId ?? null,
      created_at: now,
      updated_at: now,
  }
  let { data, error } = await db.supabase.from('operational_routes').insert(row).select('*').single()
  if (error?.code === '23505' && /external_id/i.test(`${error.message ?? ''} ${error.details ?? ''}`)) {
    externalId = await allocateRouteExternalId(db)
    row.external_id = externalId
    ;({ data, error } = await db.supabase.from('operational_routes').insert(row).select('*').single())
  }
  if (error) throwRouteDb(error)
  if (!data) throw new HttpError(500, 'Não foi possível ler ou gravar as rotas.')
  await replaceStops(db, data.id as string, input.stops, input.street)
  await writeHistory(db, data.id as string, 'create', null, { id: externalId, name: input.name })
  return (await getSavedRoute(db, externalId))!
}

async function replaceStops(db: FogoDb, routeUuid: string, stops: PlannedStop[], street: StreetRoute) {
  const { error: delErr } = await db.supabase
    .from('operational_route_stops')
    .delete()
    .eq('organization_id', db.orgId)
    .eq('route_id', routeUuid)
  if (delErr) throwRouteDb(delErr)
  if (!stops.length) return
  let t = Date.now()
  const rows = stops.map((s, i) => {
    t += (street.legs[i]?.durationSeconds ?? 0) * 1000
    const arrival = new Date(t).toISOString()
    t += 30 * 60 * 1000
    return {
      organization_id: db.orgId,
      route_id: routeUuid,
      incident_protocol: s.incidentId,
      sequence: i + 1,
      latitude: s.lat,
      longitude: s.lng,
      address: s.address,
      coord_source: s.coordSource,
      estimated_arrival_at: arrival,
      estimated_departure_at: new Date(t).toISOString(),
      status: 'pending',
    }
  })
  const { error } = await db.supabase.from('operational_route_stops').insert(rows)
  if (error) throwRouteDb(error)
}

export async function updateRoute(
  db: FogoDb,
  externalId: string,
  patch: {
    name?: string
    plannedDate?: string | null
    notes?: string | null
    status?: RouteStatus
    origin?: { lat: number; lng: number; description?: string; source: string; recordedAt?: string }
    street?: StreetRoute
    stops?: PlannedStop[]
    conflicts?: ScheduleConflict[]
    scheduleValidated?: boolean
    expectedUpdatedAt?: string
  },
): Promise<SavedRoute> {
  const current = await getSavedRoute(db, externalId)
  if (!current) throw new Error('Rota não encontrada.')
  if (!EDITABLE.has(current.status) && patch.status !== 'cancelled') {
    throw new Error('Não é possível alterar uma rota já em execução ou concluída.')
  }
  if (patch.expectedUpdatedAt && patch.expectedUpdatedAt !== current.updatedAt) {
    throw new Error('A rota foi alterada por outra sessão. Recarregue e tente de novo.')
  }
  const { data: row, error: findErr } = await db.supabase
    .from('operational_routes')
    .select('id, status')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (findErr) throwRouteDb(findErr)
  if (!row) throw new Error('Rota não encontrada.')
  const nextStatus = patch.status ?? current.status
  const { error } = await db.supabase
    .from('operational_routes')
    .update({
      name: patch.name?.trim() ?? current.name,
      planned_date: patch.plannedDate !== undefined ? patch.plannedDate : current.plannedDate,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      status: nextStatus,
      origin_latitude: patch.origin?.lat ?? current.origin.lat,
      origin_longitude: patch.origin?.lng ?? current.origin.lng,
      origin_description: patch.origin?.description ?? current.origin.description,
      origin_source: patch.origin?.source ?? current.origin.source,
      origin_recorded_at: patch.origin?.recordedAt ?? current.origin.recordedAt,
      geometry: patch.street?.geometry ?? current.geometry,
      total_distance_meters: patch.street?.distanceMeters ?? current.distanceMeters,
      estimated_duration_seconds: patch.street?.durationSeconds ?? current.durationSeconds,
      provider: patch.street?.provider ?? current.provider,
      provider_version: patch.street?.providerVersion ?? current.providerVersion,
      optimization: patch.street ? (patch.street.optimized ? 'osrm-trip' : 'manual-or-route') : current.optimization,
      constraints:
        patch.conflicts || patch.scheduleValidated != null
          ? { conflicts: patch.conflicts ?? [], scheduleValidated: patch.scheduleValidated ?? false }
          : current.constraints,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) throwRouteDb(error)
  if (patch.stops && patch.street) {
    await replaceStops(db, row.id as string, patch.stops, patch.street)
  }
  await writeHistory(db, row.id as string, patch.status === 'cancelled' ? 'cancel' : 'update', current, {
    name: patch.name ?? current.name,
    status: nextStatus,
  })
  return (await getSavedRoute(db, externalId))!
}

export async function duplicateRoute(db: FogoDb, externalId: string): Promise<SavedRoute> {
  const current = await getSavedRoute(db, externalId)
  if (!current) throw new Error('Rota não encontrada.')
  if (!current.geometry) throw new Error('Rota sem geometria para duplicar.')
  const copy = await insertRoute(db, {
    name: `${current.name} (cópia)`,
    plannedDate: current.plannedDate,
    notes: current.notes,
    status: 'draft',
    agentId: current.agentId,
    agentName: current.agentName,
    origin: {
      lat: current.origin.lat,
      lng: current.origin.lng,
      description: current.origin.description ?? undefined,
      source: current.origin.source,
      recordedAt: current.origin.recordedAt ?? undefined,
    },
    street: {
      geometry: current.geometry,
      distanceMeters: current.distanceMeters ?? 0,
      durationSeconds: current.durationSeconds ?? 0,
      legs: current.stops.map(() => ({ distanceMeters: 0, durationSeconds: 0, steps: [] })),
      waypointOrder: current.stops.map((_, i) => i),
      optimized: current.optimization === 'osrm-trip',
      provider: current.provider ?? 'osrm',
      providerVersion: current.providerVersion ?? 'copied',
    },
    stops: current.stops.map((s) => ({
      incidentId: s.incidentId,
      agentId: current.agentId,
      agentName: current.agentName,
      title: s.incidentId,
      address: s.address ?? '',
      city: '',
      type: '',
      lat: s.lat,
      lng: s.lng,
      coordSource: s.coordSource ?? 'cadastro',
    })),
    conflicts: [],
    scheduleValidated: false,
  })
  return copy
}
