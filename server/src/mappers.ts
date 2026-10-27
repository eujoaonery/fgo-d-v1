import { parseCapabilities } from './teamCapabilities.js'
import { deriveConnectivity, normalizeCadastral, normalizeDataOrigin } from './assets/truth.js'
import { enrichAssetLocation, formatAssetAddress, parseAssetLocation } from './data/mariliaAddresses.js'
import {
  normalizeAgentFunctionalStatus,
  normalizeAgentOperationalStatus,
  parseShifts,
  parseStringList,
} from '../../src/lib/agents.js'
import { parseCloseImages } from '../../src/lib/workOrders.js'
import { isDegradationLevel } from '../../src/lib/assetLifecycle.js'
import { sanitizeAssetSpecs } from '../../src/lib/assetSpecs.js'
import type {
  ActivityEvent,
  AssetLocation,
  Incident,
  MaintenanceOrder,
  OperationalAlert,
  OperationalTeam,
  SimulationSettings,
  UrbanAsset,
} from './types.js'

export function rowToAsset(row: {
  external_id: string
  name: string
  category: string
  subtype?: string | null
  region: string
  status: UrbanAsset['status']
  last_seen: string
  health: number
  map_x?: number | null
  map_y?: number | null
  patrimony_code?: string | null
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
  address?: string | null
  location?: AssetLocation | string | null
  connectivity_status?: string | null
  cadastral_status?: string | null
  criticality?: string | null
  responsible_org?: string | null
  responsible_team?: string | null
  notes?: string | null
  installed_at?: string | null
  acquired_at?: string | null
  last_verified_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  created_by?: string | null
  updated_by?: string | null
  data_origin?: string | null
  maintenance_interval_days?: number | null
  maintenance_next_due?: string | null
  maintenance_last_done?: string | null
  maintenance_plan_notes?: string | null
  useful_life_months?: number | null
  degradation_level?: string | null
  specs?: unknown
}): UrbanAsset {
  const cadastralStatus = normalizeCadastral(row.cadastral_status)
  const lastSeen = row.last_seen
  const parsedLocation = parseAssetLocation(row.location)
  const location = parsedLocation
    ? enrichAssetLocation(parsedLocation, {
        id: row.external_id,
        category: row.category,
        region: row.region,
        placeMissing: false,
      })
    : undefined
  return {
    id: row.external_id,
    name: row.name,
    category: row.category,
    subtype: row.subtype ?? undefined,
    region: row.region,
    status: row.status,
    lastSeen,
    health: row.health,
    mapX: row.map_x != null ? Number(row.map_x) : undefined,
    mapY: row.map_y != null ? Number(row.map_y) : undefined,
    patrimonyCode: row.patrimony_code ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    manufacturer: row.manufacturer ?? undefined,
    model: row.model ?? undefined,
    address: row.address?.trim() || (location?.street ? formatAssetAddress(location) : ''),
    location,
    cadastralStatus,
    connectivityStatus: deriveConnectivity({ lastSeen, cadastralStatus, category: row.category }),
    criticality: (row.criticality as UrbanAsset['criticality']) ?? undefined,
    responsibleOrg: row.responsible_org ?? undefined,
    responsibleTeam: row.responsible_team ?? undefined,
    notes: row.notes ?? undefined,
    installedAt: row.installed_at ?? undefined,
    acquiredAt: row.acquired_at ?? undefined,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    dataOrigin: normalizeDataOrigin(row.data_origin),
    maintenanceIntervalDays: row.maintenance_interval_days != null ? Number(row.maintenance_interval_days) : undefined,
    maintenanceNextDue: row.maintenance_next_due ?? undefined,
    maintenanceLastDone: row.maintenance_last_done ?? undefined,
    maintenancePlanNotes: row.maintenance_plan_notes ?? undefined,
    usefulLifeMonths: row.useful_life_months != null ? Number(row.useful_life_months) : undefined,
    degradationLevel: isDegradationLevel(row.degradation_level) ? row.degradation_level : undefined,
    specs: sanitizeAssetSpecs(row.category, row.specs),
  }
}

export function rowToMapMarker(row: {
  external_id: string
  kind: string
  name: string
  map_x: number
  map_y: number
  status: string
  region: string
  updated_at: string
  incident_protocol: string | null
  priority: string | null
}) {
  return {
    id: row.external_id,
    kind: row.kind,
    name: row.name,
    x: Number(row.map_x),
    y: Number(row.map_y),
    status: row.status,
    region: row.region,
    updatedAt: row.updated_at,
    incidentId: row.incident_protocol ?? undefined,
    priority: row.priority ?? undefined,
  }
}

export function rowToIncident(row: {
  protocol: string
  description: string
  type: string
  region: string
  priority: Incident['priority']
  status: Incident['status']
  opened_at: string
  assignee: string | null
  location: string
  notes: string | null
  data_origin: Incident['dataOrigin']
  source_alert_protocol: string | null
  source_prediction_id?: string | null
  subject_id?: string | null
  subject_label?: string | null
  required_capability: string | null
  assigned_team_external_id: string | null
  due_at?: string | null
  resolved_at?: string | null
  work_order_description?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  diagnosis?: string | null
  materials?: string | null
  close_problem?: string | null
  close_solution?: string | null
  close_signature?: string | null
  close_images?: unknown
  assets?: { external_id: string } | null
}): Incident {
  return {
    id: row.protocol,
    description: row.description,
    type: row.type,
    region: row.region,
    priority: row.priority,
    status: row.status,
    openedAt: row.opened_at,
    dueAt: row.due_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    assignee: row.assignee ?? undefined,
    assignedTeamId: row.assigned_team_external_id ?? undefined,
    requiredCapability: (row.required_capability as Incident['requiredCapability']) ?? undefined,
    relatedAssetId: row.assets?.external_id,
    location: row.location,
    notes: row.notes ?? undefined,
    workOrderDescription: row.work_order_description ?? undefined,
    scheduledStart: row.scheduled_start ?? undefined,
    scheduledEnd: row.scheduled_end ?? undefined,
    diagnosis: row.diagnosis ?? undefined,
    materials: row.materials ?? undefined,
    closeProblem: row.close_problem ?? undefined,
    closeSolution: row.close_solution ?? undefined,
    closeSignature: row.close_signature ?? undefined,
    closeImages: parseCloseImages(row.close_images),
    dataOrigin: row.data_origin,
    sourceAlertId: row.source_alert_protocol ?? undefined,
    sourcePredictionId: row.source_prediction_id ?? undefined,
    subjectId: row.subject_id ?? undefined,
    subjectLabel: row.subject_label ?? undefined,
  }
}

export function rowToTeam(row: {
  external_id: string
  name: string
  specialty_label: string
  capabilities: unknown
  region: string
  status: OperationalTeam['status']
  assigned_incident_protocol: string | null
  member_names: unknown
  map_x?: number | null
  map_y?: number | null
  team_members?: { display_name: string; sort_order: number }[] | null
  registration_number?: string | null
  responsible_org?: string | null
  unit?: string | null
  job_title?: string | null
  qualifications?: unknown
  functional_status?: string | null
  shifts?: unknown
  location_share_until?: string | null
}): OperationalTeam {
  const fromTable =
    row.team_members?.length
      ? [...row.team_members].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.display_name)
      : []
  const fromJson = Array.isArray(row.member_names)
    ? row.member_names.filter((m): m is string => typeof m === 'string')
    : []
  return {
    id: row.external_id,
    name: row.name,
    specialty: row.specialty_label,
    capabilities: parseCapabilities(row.capabilities),
    region: row.region,
    status: normalizeAgentOperationalStatus(row.status),
    assignedIncidentId: row.assigned_incident_protocol ?? undefined,
    members: fromTable.length ? fromTable : fromJson,
    mapX: row.map_x != null ? Number(row.map_x) : undefined,
    mapY: row.map_y != null ? Number(row.map_y) : undefined,
    registrationNumber: row.registration_number ?? undefined,
    responsibleOrg: row.responsible_org ?? undefined,
    unit: row.unit ?? undefined,
    jobTitle: row.job_title ?? undefined,
    qualifications: parseStringList(row.qualifications),
    functionalStatus: normalizeAgentFunctionalStatus(row.functional_status),
    shifts: parseShifts(row.shifts),
    locationShareUntil: row.location_share_until ?? undefined,
  }
}

export function rowToAlert(row: {
  protocol: string
  category: string
  severity: OperationalAlert['severity']
  title: string
  description: string
  source: string
  data_origin: OperationalAlert['dataOrigin']
  region: string | null
  detected_at: string
  state: OperationalAlert['state']
  rule: string | null
  response_due_at?: string | null
  escalated_at?: string | null
  escalation_level?: number | null
  claimed_by?: string | null
  claimed_by_label?: string | null
  claimed_at?: string | null
  dispatched_at?: string | null
  completed_at?: string | null
  incidents?: { protocol: string } | null
  assets?: { external_id: string } | null
}): OperationalAlert {
  return {
    id: row.protocol,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    source: row.source,
    dataOrigin: row.data_origin,
    relatedAssetId: row.assets?.external_id,
    region: row.region ?? undefined,
    incidentId: row.incidents?.protocol,
    detectedAt: row.detected_at,
    state: row.state,
    rule: row.rule ?? undefined,
    responseDueAt: row.response_due_at ?? undefined,
    escalatedAt: row.escalated_at ?? undefined,
    escalationLevel: row.escalation_level ?? undefined,
    claimedBy: row.claimed_by ?? undefined,
    claimedByLabel: row.claimed_by_label ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    dispatchedAt: row.dispatched_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

export function rowToMaintenance(row: {
  external_id: string
  asset_name: string
  type: string
  priority: MaintenanceOrder['priority']
  assignee: string
  due_date: string
  status: MaintenanceOrder['status']
  description?: string | null
  origin?: string | null
  source_alert_protocol?: string | null
  opened_at?: string | null
  assets?: { external_id: string } | null
}): MaintenanceOrder {
  return {
    id: row.external_id,
    assetId: row.assets?.external_id ?? '',
    assetName: row.asset_name,
    type: row.type as MaintenanceOrder['type'],
    priority: row.priority,
    assignee: row.assignee,
    dueDate: row.due_date,
    status: row.status,
    description: row.description ?? undefined,
    origin: row.origin ?? undefined,
    sourceAlertId: row.source_alert_protocol ?? undefined,
    openedAt: row.opened_at ?? undefined,
  }
}

export function rowToActivity(row: {
  external_id: string
  occurred_at: string
  message: string
  kind: ActivityEvent['kind']
  data_origin: ActivityEvent['dataOrigin'] | null
}): ActivityEvent {
  return {
    id: row.external_id,
    timestamp: row.occurred_at,
    message: row.message,
    kind: row.kind,
    dataOrigin: row.data_origin ?? undefined,
  }
}

export function parseSimulation(json: unknown): SimulationSettings {
  const base: SimulationSettings = {
    enabled: false,
    intensity: 'medium',
    tickIntervalMs: 60000,
    ticksTotal: 0,
  }
  if (!json || typeof json !== 'object') return base
  const o = json as Record<string, unknown>
  return {
    enabled: o.enabled === true,
    intensity: (o.intensity as SimulationSettings['intensity']) ?? base.intensity,
    tickIntervalMs: typeof o.tickIntervalMs === 'number' ? o.tickIntervalMs : 60000,
    startedAt: typeof o.startedAt === 'string' ? o.startedAt : undefined,
    lastTickAt: typeof o.lastTickAt === 'string' ? o.lastTickAt : undefined,
    ticksTotal: typeof o.ticksTotal === 'number' ? o.ticksTotal : 0,
  }
}
