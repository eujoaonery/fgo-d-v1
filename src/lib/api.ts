import type { CcoMemberRole, CcoPermissions } from '@/lib/ccoPermissions'
import type {
  Incident,
  IncidentStatus,
  MaintenanceOrder,
  OperationalAlert,
  SimulationSettings,
  UrbanAsset,
  ActivityEvent,
  MapMarker,
  AlertState,
  Team,
  AssetAttachment,
  AssetAttachmentKind,
  AssetCategory,
  IncidentPriority,
  ConnectivityStatus,
  CadastralStatus,
  AssetCriticality,
  AssetHistoryEntry,
  AlertHistoryEntry,
  SearchHit,
  RegionSummary,
  TelemetryEvent,
  ChartPeriod,
} from '@/types'
import type {
  ActionCatalogEntry,
  PrometheusResult,
  StrategicActionRecord,
  StrategicActionType,
  StrategySnapshot,
} from '@/lib/strategy'
import type {
  AlphaAnalysisKind,
  AlphaAnalysisResult,
  AlphaBoard,
  AlphaChatMessage,
  AlphaCityGeo,
  AlphaRecommendation,
  AlphaRecStatus,
  AlphaSessionContext,
  AlphaSessionSummary,
} from '@/lib/prometheusAlpha'
import type { AcaoRecord, AcaoStatus } from '@/lib/acao'

export type {
  AlphaAnalysisKind,
  AlphaAnalysisResult,
  AlphaBoard,
  AlphaChatMessage,
  AlphaCityGeo,
  AlphaRecommendation,
  AlphaRecStatus,
  AlphaSessionContext,
  AlphaSessionSummary,
}

export type { PrometheusResult, StrategicActionRecord, StrategicActionType, StrategySnapshot }
export type { AcaoRecord }

export type StrategyBoard = {
  snapshot: StrategySnapshot
  prometheus: PrometheusResult
  actions: StrategicActionRecord[]
  catalog: ActionCatalogEntry[]
}

export type { SearchHit }

export interface IncidentHistoryEntry {
  id: string
  incidentProtocol: string
  fromStatus: IncidentStatus | null
  toStatus: IncidentStatus
  note: string | null
  actorLabel: string
  changedAt: string
}

export interface BootstrapPayload {
  simulation: SimulationSettings
  incidents: Incident[]
  alerts: OperationalAlert[]
  activity: ActivityEvent[]
  assets: UrbanAsset[]
  maintenance: MaintenanceOrder[]
  teams: Team[]
  assetCategories: AssetCategory[]
  mapMarkers: MapMarker[]
  cityMapImage: string
  serverTime: string
  mapHome?: {
    ibgeId: number
    name: string
    uf: string
    lat: number
    lng: number
    bbox: { north: number; south: number; east: number; west: number }
  } | null
}

import { getApiAccessToken } from '@/lib/apiAccessToken'
import { apiUrl } from '@/lib/apiBase'
import { authUsesCookies } from '@/lib/authMode'
import { applyTenantHeader } from '@/lib/apiTenant'
import { currentAuthEpoch, noteUnauthorized } from '@/lib/sessionExpiry'
import type { OperationMode, TenantStatus } from '@/lib/tenant'

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const startedEpoch = currentAuthEpoch()
  const token = getApiAccessToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  applyTenantHeader(headers)
  if (init?.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(apiUrl(input), {
    ...init,
    headers,
    credentials: init?.credentials ?? (authUsesCookies() ? 'include' : 'same-origin'),
  })
  if (res.status === 401) noteUnauthorized(input, startedEpoch)
  return res
}

export class ReauthRequiredError extends Error {
  constructor(message = 'Confirme a senha para esta operação administrativa') {
    super(message)
    this.name = 'ReauthRequiredError'
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      if (body.error === 'reauth_required') {
        throw new ReauthRequiredError(body.message ?? 'Confirme a senha para esta operação administrativa')
      }
      if (body.error) message = body.error
    } catch (e) {
      if (e instanceof ReauthRequiredError) throw e
      message = await res.text().catch(() => message)
    }
    if (res.status === 404 && /cannot (get|post|patch|delete)/i.test(message)) {
      message =
        'Rota da API não encontrada — reinicie o serviço backend (npm run dev:api ou npm run dev:all). A instância em execução parece desatualizada.'
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function confirmAdminReauth(password: string): Promise<void> {
  await parseJson(
    await apiFetch('/api/auth/reauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  )
}

export async function withAdminStepUp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (!(e instanceof ReauthRequiredError)) throw e
    const password = window.prompt('Confirme sua senha para esta operação administrativa')
    if (!password) throw new Error('Operação cancelada')
    await confirmAdminReauth(password)
    return await fn()
  }
}

export interface ApiMeResponse {
  organizationId: string
  organizationSlug: string
  tenantName: string
  cityName: string | null
  isPlatformSuperAdmin?: boolean
  tenant?: {
    id: string
    slug: string
    name: string
    status: TenantStatus
    operationMode: OperationMode
    timezone: string
    locale: string
    description: string | null
  } | null
  actor: {
    userId: string
    email?: string
    role: CcoMemberRole
    displayName?: string | null
    avatarUrl?: string | null
    scopeRegion?: string | null
    scopeOrg?: string | null
    locationShareUntil?: string | null
  } | null
  mustChangePassword?: boolean
  permissions: CcoPermissions
}

export interface UserProfileRecord {
  userId: string
  email: string | null
  displayName: string
  avatarUrl: string | null
  role: string
  mustChangePassword: boolean
}

export async function completeFirstLoginPassword(
  newPassword: string,
  turnstileToken?: string,
): Promise<void> {
  await parseJson(
    await apiFetch('/api/me/profile/password/first-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, turnstileToken }),
    }),
  )
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string,
  turnstileToken?: string,
): Promise<void> {
  await parseJson(
    await apiFetch('/api/me/profile/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, turnstileToken }),
    }),
  )
}

export async function fetchUserProfile(): Promise<UserProfileRecord> {
  return parseJson(await apiFetch('/api/me/profile'))
}

export async function patchUserProfile(body: {
  displayName?: string
  avatarUrl?: string | null
}): Promise<UserProfileRecord> {
  return parseJson(
    await apiFetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function fetchApiMe(): Promise<ApiMeResponse> {
  return parseJson(await apiFetch('/api/me'))
}

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  return parseJson(await apiFetch('/api/bootstrap'))
}

export async function patchSimulation(patch: Partial<SimulationSettings>): Promise<SimulationSettings> {
  return parseJson(
    await apiFetch('/api/settings/simulation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export async function resolveOpenOccurrences(): Promise<{ resolved: number }> {
  return parseJson(await apiFetch('/api/settings/occurrences/resolve', { method: 'POST' }))
}

export async function resetMonitoringOperationalData(): Promise<SimulationSettings> {
  const body = await parseJson<{ ok: boolean; simulation: SimulationSettings }>(
    await apiFetch('/api/settings/monitoring/reset', { method: 'POST' }),
  )
  return body.simulation
}

export type WorkOrderSubject = {
  id: string
  name: string
  active: boolean
  sortOrder: number
}

export async function fetchWorkOrderSubjects(includeInactive = false): Promise<WorkOrderSubject[]> {
  const qs = includeInactive ? '?todos=1' : ''
  const data = await parseJson<{ subjects: WorkOrderSubject[] }>(await apiFetch(`/api/work-order-subjects${qs}`))
  return data.subjects
}

export async function createWorkOrderSubject(name: string): Promise<WorkOrderSubject> {
  return parseJson(
    await apiFetch('/api/work-order-subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
}

export async function patchWorkOrderSubject(
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<WorkOrderSubject> {
  return parseJson(
    await apiFetch(`/api/work-order-subjects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export async function createWorkOrder(body: {
  description?: string
  type?: string
  region?: string
  priority?: IncidentPriority
  relatedAssetId?: string
  location?: string
  assignee?: string
  dueAt?: string
  workOrderDescription?: string
  subjectId: string
  sourceAlertId?: string
  sourcePredictionId?: string
  predictionDuplicateNote?: string
}): Promise<Incident> {
  return parseJson(
    await apiFetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export type IncidentPatchBody = {
  status?: IncidentStatus
  assignee?: string
  notes?: string
  actorLabel?: string
  priority?: IncidentPriority
  dueAt?: string
  workOrderDescription?: string
  scheduledStart?: string
  scheduledEnd?: string
  diagnosis?: string
  materials?: string
  closeProblem?: string
  closeSolution?: string
  closeSignature?: string
  closeImages?: Incident['closeImages']
}

export async function patchIncident(id: string, body: IncidentPatchBody): Promise<Incident> {
  return parseJson(
    await apiFetch(`/api/incidents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function dispatchIncidentTeam(
  incidentId: string,
  teamId: string,
): Promise<{ incident: Incident; team: Team }> {
  return parseJson(
    await apiFetch(`/api/incidents/${encodeURIComponent(incidentId)}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    }),
  )
}

export async function scheduleWorkOrder(
  incidentId: string,
  body: { teamId: string; start: string; end?: string },
): Promise<{ incident: Incident; team: Team }> {
  return parseJson(
    await apiFetch(`/api/incidents/${encodeURIComponent(incidentId)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function fetchIncidentHistory(protocol: string): Promise<IncidentHistoryEntry[]> {
  return parseJson(await apiFetch(`/api/incidents/${encodeURIComponent(protocol)}/history`))
}

export interface MaintenanceHistoryEntry {
  id: string
  maintenanceId: string
  fromStatus: MaintenanceOrder['status'] | null
  toStatus: MaintenanceOrder['status']
  note: string | null
  actorLabel: string
  changedAt: string
}

export type AssetUpsertBody = {
  name: string
  category: string
  region: string
  id?: string
  status?: UrbanAsset['status']
  health?: number
  mapX?: number
  mapY?: number
  patrimonyCode?: string
  serialNumber?: string
  manufacturer?: string
  model?: string
  address?: string
  location?: UrbanAsset['location']
  dataOrigin?: UrbanAsset['dataOrigin']
  connectivityStatus?: ConnectivityStatus
  cadastralStatus?: CadastralStatus
  criticality?: AssetCriticality
  responsibleOrg?: string
  responsibleTeam?: string
  notes?: string
  installedAt?: string
  subtype?: string
  acquiredAt?: string
  lastVerifiedAt?: string
  icmpEnabled?: boolean
  icmpHost?: string
  mqttEnabled?: boolean
  mqttHost?: string
  mqttPort?: number | string
  mqttTls?: boolean
  mqttTopics?: string
  mqttClientId?: string
  mqttUsername?: string
  mqttPassword?: string
  snmpEnabled?: boolean
  snmpHost?: string
  snmpPort?: number | string
  snmpVersion?: '2c' | '3'
  snmpOids?: string
  snmpCommunity?: string
  snmpUsername?: string
  snmpAuthProtocol?: string
  snmpPrivProtocol?: string
  snmpAuthPassword?: string
  snmpPrivPassword?: string
  rtspEnabled?: boolean
  rtspHost?: string
  rtspPort?: number | string
  rtspPath?: string
  rtspUsername?: string
  rtspPassword?: string
  onvifEnabled?: boolean
  onvifHost?: string
  onvifPort?: number | string
  onvifPath?: string
  onvifTls?: boolean
  onvifUsername?: string
  onvifPassword?: string
  maintenanceIntervalDays?: number
  maintenanceNextDue?: string
  maintenanceLastDone?: string
  maintenancePlanNotes?: string
  usefulLifeMonths?: number
  degradationLevel?: UrbanAsset['degradationLevel']
  cadastralJustification?: string
  specs?: UrbanAsset['specs'] | null
}

function assetSaveSignal() {
  return AbortSignal.timeout(20000)
}

function rethrowAssetSave(e: unknown): never {
  if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
    throw new Error('O servidor não confirmou o salvamento. Tente de novo.')
  }
  throw e
}

export async function createAsset(body: AssetUpsertBody): Promise<UrbanAsset> {
  try {
    return await parseJson(
      await apiFetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: assetSaveSignal(),
      }),
    )
  } catch (e) {
    rethrowAssetSave(e)
  }
}

export async function updateAsset(
  externalId: string,
  body: Partial<AssetUpsertBody> & { cadastralJustification?: string },
): Promise<UrbanAsset> {
  try {
    return await parseJson(
      await apiFetch(`/api/assets/${encodeURIComponent(externalId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: assetSaveSignal(),
      }),
    )
  } catch (e) {
    rethrowAssetSave(e)
  }
}

export async function fetchAssetHistory(externalId: string): Promise<AssetHistoryEntry[]> {
  return parseJson(await apiFetch(`/api/assets/${encodeURIComponent(externalId)}/history`))
}

export async function fetchAssetAttachments(externalId: string): Promise<AssetAttachment[]> {
  return parseJson(await apiFetch(`/api/assets/${encodeURIComponent(externalId)}/attachments`))
}

export async function uploadAssetAttachment(
  externalId: string,
  file: File,
  kind: AssetAttachmentKind,
): Promise<AssetAttachment> {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  return parseJson(
    await apiFetch(`/api/assets/${encodeURIComponent(externalId)}/attachments`, {
      method: 'POST',
      body: form,
    }),
  )
}

export async function downloadAssetAttachmentFile(
  externalId: string,
  attId: string,
  fileName: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/assets/${encodeURIComponent(externalId)}/attachments/${encodeURIComponent(attId)}`,
  )
  if (!res.ok) throw new Error('Não foi possível baixar o anexo')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export async function deleteAssetAttachment(externalId: string, attId: string): Promise<void> {
  const res = await apiFetch(
    `/api/assets/${encodeURIComponent(externalId)}/attachments/${encodeURIComponent(attId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteAsset(externalId: string): Promise<void> {
  const res = await apiFetch(`/api/assets/${encodeURIComponent(externalId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export type GeoSuggestion = {
  label: string
  street?: string
  neighborhood?: string
  city: string
  uf: string
  cep?: string
  lat?: number
  lng?: number
  origin: 'geocodificacao' | 'cep'
}

export async function suggestAssetLocation(body: {
  q?: string
  cep?: string
  lat?: number
  lng?: number
}): Promise<GeoSuggestion[]> {
  return parseJson(
    await apiFetch('/api/geo/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function patchAlert(protocol: string, state: AlertState, note?: string): Promise<OperationalAlert> {
  return parseJson(
    await apiFetch(`/api/alerts/${encodeURIComponent(protocol)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, note }),
    }),
  )
}

export async function assumeAlert(protocol: string): Promise<OperationalAlert> {
  return parseJson(
    await apiFetch(`/api/alerts/${encodeURIComponent(protocol)}/assume`, {
      method: 'POST',
    }),
  )
}

export type CcoFloorOperator = {
  userId: string
  displayName: string
  email: string | null
  role: string
  roleLabel: string
  monitoring: boolean
  occupancy: 'ocupado' | 'livre'
  lastSeenAt: string | null
  assumedCount?: number
  solvedCount?: number
  claimedAlerts: Array<{ protocol: string; title: string; severity: string; state: string }>
}

export type CcoSlaAlertRow = {
  protocol: string
  title: string
  category?: string
  severity: OperationalAlert['severity']
  state: OperationalAlert['state']
  region?: string
  detectedAt: string
  responseDueAt?: string
  claimedBy?: string
  claimedByLabel?: string
  elapsedMs?: number
  slaPercent?: number
  assumeAt?: string
  dispatchAt?: string
  completeAt?: string
  assumeMs: number | null
  dispatchMs: number | null
  completeMs: number | null
  assumePending: boolean
  dispatchPending: boolean
  completePending: boolean
  firstResponseOverdue: boolean
}

export type CcoFloorResponse = {
  generatedAt: string
  counts: {
    operators: number
    monitoring: number
    offline: number
    occupied: number
    free: number
    totalAlerts?: number
    pending?: number
    resolved?: number
    assumed?: number
    solved?: number
  }
  operators: CcoFloorOperator[]
  showSla?: boolean
  sla: {
    summary: {
      openAlerts: number
      assumed: number
      dispatched: number
      completed: number
      overdueOpen: number
      avgAssumeMs: number | null
      avgDispatchMs: number | null
      avgCompleteMs: number | null
    }
    alerts: CcoSlaAlertRow[]
  }
}

export type CategorySlaConfig = {
  defaultMinutes: number
  categories: Array<{ category: string; minutes: number }>
}

export async function fetchCategorySla(): Promise<CategorySlaConfig> {
  return parseJson(await apiFetch('/api/settings/sla'))
}

export async function saveCategorySla(minutesByCategory: Record<string, number>): Promise<CategorySlaConfig> {
  return parseJson(
    await apiFetch('/api/settings/sla', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutesByCategory }),
    }),
  )
}

export async function fetchCcoFloor(): Promise<CcoFloorResponse> {
  return parseJson(await apiFetch('/api/cco/floor'))
}

export async function fetchAssetCategories(): Promise<AssetCategory[]> {
  return parseJson(await apiFetch('/api/asset-categories'))
}

export async function createTeam(body: Partial<Team> & { name: string; specialty: string; region: string }): Promise<Team> {
  return parseJson(
    await apiFetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function updateTeam(externalId: string, body: Partial<Team> & { mapX?: number; mapY?: number }): Promise<Team> {
  return parseJson(
    await apiFetch(`/api/teams/${encodeURIComponent(externalId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteTeam(externalId: string): Promise<void> {
  const res = await apiFetch(`/api/teams/${encodeURIComponent(externalId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function createMaintenanceOrder(body: {
  assetId?: string
  assetName: string
  type: MaintenanceOrder['type']
  priority?: IncidentPriority
  assignee: string
  dueDate: string
  description?: string
  origin?: string
}): Promise<MaintenanceOrder> {
  return parseJson(
    await apiFetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function patchMaintenanceOrder(
  id: string,
  body: { status: MaintenanceOrder['status']; note?: string },
): Promise<MaintenanceOrder> {
  return parseJson(
    await apiFetch(`/api/maintenance/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function fetchMaintenanceHistory(orderId: string): Promise<MaintenanceHistoryEntry[]> {
  return parseJson(await apiFetch(`/api/maintenance/${encodeURIComponent(orderId)}/history`))
}

export async function createMaintenanceFromAlert(alertProtocol: string): Promise<MaintenanceOrder> {
  return parseJson(
    await apiFetch(`/api/alerts/${encodeURIComponent(alertProtocol)}/maintenance`, {
      method: 'POST',
    }),
  )
}

export async function fetchAlertHistory(protocol: string): Promise<AlertHistoryEntry[]> {
  return parseJson(await apiFetch(`/api/alerts/${encodeURIComponent(protocol)}/history`))
}

export async function createIncidentFromAlert(
  alertProtocol: string,
  body: { subjectId: string; priority?: IncidentPriority; dueAt?: string; notes?: string; description?: string },
): Promise<Incident> {
  return parseJson(
    await apiFetch(`/api/alerts/${encodeURIComponent(alertProtocol)}/incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  )
}

export async function fetchIncidentAlerts(incidentProtocol: string): Promise<OperationalAlert[]> {
  return parseJson(await apiFetch(`/api/incidents/${encodeURIComponent(incidentProtocol)}/alerts`))
}

export async function linkAlertsToIncident(incidentProtocol: string, alertProtocols: string[]): Promise<void> {
  const res = await apiFetch(`/api/incidents/${encodeURIComponent(incidentProtocol)}/link-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertProtocols }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function searchOperational(query: string): Promise<SearchHit[]> {
  return parseJson(await apiFetch(`/api/search?q=${encodeURIComponent(query)}`))
}

export async function fetchRegionSummaries(): Promise<RegionSummary[]> {
  return parseJson(await apiFetch('/api/regions/summary'))
}

export async function fetchTelemetry(opts?: {
  region?: string
  assetId?: string
  limit?: number
}): Promise<TelemetryEvent[]> {
  const params = new URLSearchParams()
  if (opts?.region) params.set('region', opts.region)
  if (opts?.assetId) params.set('assetId', opts.assetId)
  if (opts?.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  return parseJson(await apiFetch(`/api/telemetry${qs ? `?${qs}` : ''}`))
}

export interface AnalyticsPayload {
  period: ChartPeriod
  from: string
  to: string
  incidentsTimeSeries: { label: string; total: number; resolved: number }[]
  incidentsByCategory: { category: string; count: number }[]
  incidentsByRegion: { region: string; count: number }[]
  alertsBySeverity: { severity: string; count: number }[]
  hourlyDemand: { hour: string; hoje: number; semana: number; projecao: number }[]
  assetAvailability: number
  assetAvailabilityEligible: number
  assetAvailabilityExcluded: number
  assetStatusDistribution: { name: string; value: number }[]
  totals: {
    incidents: number
    incidentsResolved: number
    alerts: number
    assets: number
    assetsOperational: number
    assetsAlert: number
    assetsEligible: number
    assetsExcluded: number
  }
  insights: { title: string; body: string; tone: 'neutral' | 'warning' | 'critical' }[]
}

export async function fetchAnalytics(period: ChartPeriod, region?: string): Promise<AnalyticsPayload> {
  const params = new URLSearchParams({ period })
  if (region) params.set('region', region)
  return parseJson(await apiFetch(`/api/analytics?${params.toString()}`))
}

export interface PredictiveControls {
  learningEnabled: boolean
  forecastsEnabled: boolean
  evaluationEnabled: boolean
  retrainEnabled: boolean
  includeSimulated: boolean
  intervalSec: number
  lastForecastAt?: string
  lastEvalAt?: string
  lastLearnAt?: string
  lastError?: string
  lastChangedBy?: string
  lastChangedAt?: string
}

export interface PredictiveHorizon {
  id: '24h' | '7d' | '30d'
  hours: number
  label: string
  predicted: number | null
  baseline: number | null
  intervalLow: number | null
  intervalHigh: number | null
  periodStart: string | null
  periodEnd: string | null
  issuedAt: string | null
  method: string | null
  observationCount: number
  experimental: boolean
  dataOriginSet: string
  limitations: string[]
  weatherNote: string | null
}

export type PredictionAccuracyLevel = 'exact' | 'useful' | 'off' | 'miss' | 'pending'

export interface PredictiveHourForecast {
  id: '1h' | '3h' | '8h' | '12h' | '24h'
  hours: number
  label: string
  fromLabel: string
  toLabel: string
  periodStart: string
  periodEnd: string
  predicted: number | null
  probability: number | null
  probabilityLabel: 'baixa' | 'média' | 'alta'
  confidence: number | null
  confidenceLabel: 'baixa' | 'média' | 'alta'
  sampleDays: number
  skill?: PredictiveHorizonSkill
}

export interface PredictiveDayForecast {
  date: string
  weekday: string
  label: string
  predicted: number | null
  observed?: number | null
  inProgress?: boolean
  level?: PredictionAccuracyLevel
  skill?: PredictiveHorizonSkill
}

export interface PredictiveHorizonSkill {
  id: string
  label: string
  scored: number
  exact: number
  useful: number
  off: number
  miss: number
  utilization: number | null
  mae: number | null
}

export interface PredictiveAccuracyPair {
  id: string
  date: string
  label: string
  predicted: number
  observed: number | null
  level: PredictionAccuracyLevel
  inProgress: boolean
}

export interface PredictiveAccuracyTrack {
  id: 'alerts' | 'tickets'
  label: string
  scored: number
  exact: number
  useful: number
  off: number
  miss: number
  inProgress: number
  utilization: number | null
  exactRate: number | null
  pairs: PredictiveAccuracyPair[]
}

export interface PredictiveHitPoint {
  label: string
  acerto: number
}

export interface PredictiveHistoryWindow {
  id: string
  label: string
  fromLabel: string
  toLabel: string
  predicted: number
  observed: number
  level: PredictionAccuracyLevel
}

export interface PredictiveHistoryDay {
  date: string
  dateLabel: string
  whenLabel: string
  predicted: number
  observed: number
  level: PredictionAccuracyLevel
  windows: PredictiveHistoryWindow[]
}

export interface PredictiveAccuracy {
  alerts: PredictiveAccuracyTrack
  tickets: PredictiveAccuracyTrack
  byHorizon?: PredictiveHorizonSkill[]
  hourEvolution?: PredictiveHitPoint[]
  todayEvolution?: PredictiveHitPoint[]
  history?: PredictiveHistoryDay[]
}

export interface PredictiveRunRow {
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: string
  step: string
  error: string | null
}

export interface PredictiveSummary {
  kpis: { label: string; value: string; unit: string; tone: 'neutral' | 'warning' | 'critical' | 'success' }[]
  maintenanceRisk: { percent: number; count?: number; label: string; trend: number[] }
  anomalies: {
    id: string
    title: string
    location: string
    time: string
    severity: 'alta' | 'média'
    explanation: string
  }[]
  recommendations: { id: string; text: string; impact: 'alto' | 'médio'; predictionId: string }[]
  predictions: PredictionRecord[]
  metrics?: PredictiveMetrics
  horizons?: PredictiveHorizon[]
  upcomingDays?: PredictiveDayForecast[]
  upcomingHours?: PredictiveHourForecast[]
  accuracy?: PredictiveAccuracy
  insufficientHistory?: boolean
  observationCount?: number
  weatherReadings?: number
  minObservations?: number
  dataOriginSet?: string
  controls?: PredictiveControls
  runs?: PredictiveRunRow[]
  neural?: NeuralForecastView
  modelLabel: string
}

export type PredictionDecisionStatus = 'pending' | 'accepted' | 'rejected' | 'deferred' | 'irrelevant'

export interface PredictionRecord {
  id: string
  predictionType: 'region_risk' | 'maintenance_due' | 'incident_spike' | 'demand_forecast'
  targetLabel: string
  region?: string
  assetExternalId?: string
  horizonHours: number
  calculatedAt: string
  predictedValue?: number
  baselineValue?: number
  probability?: number
  explanation: string
  recommendation?: string
  alertProtocol?: string
  workOrderProtocol?: string
  observedValue?: number
  observedAt?: string
  observedNote?: string
  reviewStatus: 'pending' | 'confirmed' | 'missed' | 'partial' | 'expired'
  reviewNote?: string
  reviewedAt?: string
  reviewedBy?: string
  decisionStatus: PredictionDecisionStatus
  decisionJustification?: string
  decisionAt?: string
  decisionBy?: string
  periodStart?: string
  periodEnd?: string
  intervalLow?: number
  intervalHigh?: number
  observationCount?: number
  dataOriginSet?: string
  inputSummary?: Record<string, unknown>
}

export type CityWeatherBrief = {
  point: { lat: number; lng: number; city: string }
  current: {
    time: string | null
    temperatureC: number | null
    precipitationMm: number | null
    summary: string
    kind: 'modelo_atual'
  } | null
  forecastHours: {
    time: string
    temperatureC: number | null
    precipitationMm: number | null
    precipProbPct: number | null
  }[]
  history: {
    date: string
    precipitationMm: number | null
    temperatureC: number | null
    kind: 'arquivo'
  } | null
  error: string | null
  note: string
}

export async function fetchCityWeather(): Promise<CityWeatherBrief> {
  return parseJson(await apiFetch('/api/weather/city'))
}

export type WeatherGridCell = {
  lat: number
  lng: number
  halfLat: number
  halfLng: number
  weatherCode: Array<number | null>
  precipMm: Array<number | null>
  windKmh: Array<number | null>
  cloudPct: Array<number | null>
  temperatureC: Array<number | null>
}

export type WeatherGrid = {
  hours: string[]
  cells: WeatherGridCell[]
  history: { date: string; precipitationMm: number | null; temperatureC: number | null } | null
  note: string
  error: string | null
}

export async function fetchWeatherGrid(): Promise<WeatherGrid> {
  return parseJson(await apiFetch('/api/weather/grid'))
}

export async function fetchPredictions(limit = 200): Promise<PredictionRecord[]> {
  return parseJson(await apiFetch(`/api/predictions?limit=${limit}`))
}

export async function fetchRegionalOsForecasts(): Promise<PredictionRecord[]> {
  return parseJson(await apiFetch('/api/predictions/os-by-region'))
}

export interface PredictiveMetrics {
  scored: number
  pending: number
  mae: number | null
  rmse: number | null
  wape: number | null
  baselineMae: number | null
  skillScore: number | null
  intervalCoverage: number | null
  confirmationRate: number | null
  accuracy: number | null
  reviewed: number
  confirmed: number
  missed: number
  partial: number
  calibration: {
    label: string
    from: number
    to: number
    predictedMean: number | null
    observedRate: number | null
    count: number
  }[]
  chronological: {
    method: 'cronologico'
    description: string
    trainFrom: string
    trainTo: string
    validationFrom: string
    validationTo: string
    trainShare: number
    validationShare: number
    trainCount: number
    validationCount: number
    scoredTrain: number
    scoredValidation: number
  }
  note: string
}

export type NeuralMaturity = 'sem_base' | 'inicial' | 'em_formacao' | 'em_prova' | 'confiavel'

export interface NeuralForecastView {
  maturity: NeuralMaturity
  maturityLabel: string
  closedDays: number
  formulaMae: number | null
  neuralMae: number | null
  canProvision: boolean
  official: boolean
  hours: { id: string; label: string; hours: number; predicted: number | null }[]
  days: { date: string; label: string; predicted: number | null }[]
  history: {
    date: string
    dateLabel: string
    whenLabel: string
    predicted: number
    observed: number
    windows: { id: string; label: string; predicted: number; observed: number }[]
  }[]
  note: string
}

export async function provisionNeuralOfficial(): Promise<{ ok: true }> {
  return parseJson(await apiFetch('/api/predictive/neural-official', { method: 'POST' }))
}

export async function fetchPredictiveSummary(): Promise<PredictiveSummary> {
  return parseJson(await apiFetch('/api/predictive/summary'))
}

export async function fetchPredictiveControls(): Promise<{ controls: PredictiveControls; runs: PredictiveRunRow[] }> {
  return parseJson(await apiFetch('/api/predictive/controls'))
}

export async function patchPredictiveControls(
  patch: Partial<PredictiveControls>,
): Promise<{ controls: PredictiveControls }> {
  return parseJson(
    await apiFetch('/api/predictive/controls', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export async function runPredictiveCycleNow(): Promise<{ ok: boolean }> {
  return parseJson(await apiFetch('/api/predictive/run', { method: 'POST' }))
}

export async function reviewPrediction(
  externalId: string,
  body: { status: 'confirmed' | 'missed' | 'partial' | 'expired'; note?: string; observedValue?: number },
): Promise<void> {
  const res = await apiFetch(`/api/predictions/${encodeURIComponent(externalId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function decidePrediction(
  externalId: string,
  body: { status: Exclude<PredictionDecisionStatus, 'pending'>; justification: string },
): Promise<void> {
  const res = await apiFetch(`/api/predictions/${encodeURIComponent(externalId)}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

export type PrometheusPrevisibilidade = {
  available: boolean
  generatedAt: string | null
  model: string | null
  unavailableReason: string | null
  headline: string | null
  feedbacks: { title: string; body: string; tone: 'neutral' | 'warning' | 'critical'; basedOn: string }[]
  priorities: { title: string; why: string; horizon: string }[]
  limitations: string[]
  metrics: PredictiveMetrics
  availability: {
    total: number
    eligible: number
    excluded: number
    operational: number
    alert: number
    inactive: number
    percent: number
  }
  charts: {
    osByStatus: { name: string; value: number }[]
    alertsBySeverity: { name: string; value: number }[]
    cadastralMix: { name: string; value: number }[]
    agentsByStatus: { name: string; value: number }[]
    predictionsByType: { name: string; value: number }[]
    decisions: { name: string; value: number }[]
    regionLoad: { region: string; os: number; alerts: number; assets: number }[]
  }
}

export async function fetchPrevisibilidade(): Promise<PrometheusPrevisibilidade> {
  return parseJson(await apiFetch('/api/predictive/previsibilidade'))
}

export async function runPrevisibilidadePrometheus(): Promise<PrometheusPrevisibilidade> {
  return parseJson(await apiFetch('/api/predictive/previsibilidade', { method: 'POST' }))
}

export type OrgMemberStatus = 'active' | 'inactive'

export interface OrgMemberRecord {
  id: string
  userId: string
  role: CcoMemberRole
  permissions: CcoPermissions
  groupId: string | null
  groupName: string | null
  scopeRegion: string | null
  scopeOrg: string | null
  locationShareUntil: string | null
  status: OrgMemberStatus
  createdAt: string
  email: string | null
  displayName: string
}

export interface OrgGroupRecord {
  id: string
  name: string
  description: string | null
  permissions: CcoPermissions
  memberCount: number
  createdAt: string
}

export async function fetchOrgMembers(): Promise<OrgMemberRecord[]> {
  return parseJson(await apiFetch('/api/org/members'))
}

export async function fetchOrgGroups(): Promise<OrgGroupRecord[]> {
  return parseJson(await apiFetch('/api/org/groups'))
}

export async function createOrgGroup(body: {
  name: string
  description?: string
  permissions: CcoPermissions
}): Promise<OrgGroupRecord> {
  return parseJson(
    await apiFetch('/api/org/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function patchOrgGroup(
  groupId: string,
  body: { name?: string; description?: string; permissions?: CcoPermissions },
): Promise<OrgGroupRecord> {
  return parseJson(
    await apiFetch(`/api/org/groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteOrgGroup(groupId: string): Promise<void> {
  const res = await apiFetch(`/api/org/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (body.error === 'reauth_required') throw new ReauthRequiredError(body.message)
    throw new Error(body.error ?? res.statusText)
  }
}

export interface AuditLogRecord {
  id: string
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  actorId: string | null
  actorEmail: string | null
  createdAt: string
}

export async function fetchAuditLogs(opts?: {
  limit?: number
  offset?: number
  action?: string
  entityType?: string
}): Promise<AuditLogRecord[]> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  if (opts?.action) params.set('action', opts.action)
  if (opts?.entityType) params.set('entityType', opts.entityType)
  const qs = params.toString()
  return parseJson(await apiFetch(`/api/org/audit-logs${qs ? `?${qs}` : ''}`))
}

export interface SystemLogRecord {
  id: string
  level: 'info' | 'warn' | 'error'
  category: 'auth' | 'http' | 'ops' | 'system'
  message: string
  metadata: Record<string, unknown>
  actorId: string | null
  actorEmail: string | null
  createdAt: string
}

export async function fetchSystemLogs(opts?: {
  limit?: number
  offset?: number
  level?: SystemLogRecord['level']
  category?: SystemLogRecord['category']
}): Promise<SystemLogRecord[]> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  if (opts?.level) params.set('level', opts.level)
  if (opts?.category) params.set('category', opts.category)
  const qs = params.toString()
  return parseJson(await apiFetch(`/api/org/system-logs${qs ? `?${qs}` : ''}`))
}

/** Registra login/logout/falha no backend (não bloqueia o fluxo de auth). */
export async function reportAuthEvent(body: {
  type: 'login' | 'logout' | 'login_failed'
  email?: string
  error?: string
}): Promise<void> {
  try {
    const res = await apiFetch('/api/auth/events', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!res.ok) await res.text()
  } catch {
    /* ignore */
  }
}

export async function inviteOrgMember(body: {
  email: string
  displayName?: string
  role?: CcoMemberRole
  groupId?: string
  scopeRegion?: string | null
  scopeOrg?: string | null
  locationShareUntil?: string | null
}): Promise<{
  userId: string
  email: string
  role: CcoMemberRole
  linkedExisting?: boolean
  temporaryPassword?: string
}> {
  return parseJson(
    await apiFetch('/api/org/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function patchOrgMember(
  userId: string,
  body: {
    role?: CcoMemberRole
    groupId?: string | null
    password?: string
    displayName?: string
    scopeRegion?: string | null
    scopeOrg?: string | null
    locationShareUntil?: string | null
    status?: OrgMemberStatus
  },
): Promise<{ userId: string; role: CcoMemberRole; status?: OrgMemberStatus }> {
  return parseJson(
    await apiFetch(`/api/org/members/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteOrgMember(userId: string): Promise<void> {
  const res = await apiFetch(`/api/org/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (body.error === 'reauth_required') throw new ReauthRequiredError(body.message)
    throw new Error(body.error ?? (await res.text().catch(() => res.statusText)))
  }
}

async function downloadCsv(path: string, filename: string) {
  const res = await apiFetch(path)
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportAssetsCsv(): Promise<void> {
  await downloadCsv('/api/assets/export.csv', 'fogo-ativos.csv')
}

export async function exportTeamsCsv(): Promise<void> {
  await downloadCsv('/api/teams/export.csv', 'fogo-agentes.csv')
}

export async function importAssetsCsv(csv: string): Promise<{ imported: number }> {
  return parseJson(
    await apiFetch('/api/assets/import.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    }),
  )
}

export async function importTeamsCsv(csv: string): Promise<{ imported: number }> {
  return parseJson(
    await apiFetch('/api/teams/import.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    }),
  )
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/health', { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchStrategyBoard(): Promise<StrategyBoard> {
  return parseJson(await apiFetch('/api/strategy/snapshot'))
}

export async function runPrometheusAnalysis(): Promise<PrometheusResult> {
  return parseJson(await apiFetch('/api/strategy/prometheus', { method: 'POST' }))
}

export type ConnectorCatalogEntry = {
  kind: string
  label: string
  group: string
  summary: string
  claims: string
}

export type ConnectorRecord = {
  id: string
  kind: string
  name: string
  description: string | null
  status: string
  health: string
  enabled: boolean
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  hasSecret: boolean
  adapterVersion: string
}

export type IngestEventRow = {
  id: string
  connector_id: string | null
  source_kind: string
  received_at: string
  status: string
  error: string | null
  data_origin: string
}

export type IngestDeliveryRow = {
  id: string
  event_type: string
  status: string
  attempts: number
  last_error: string | null
}

export async function fetchConnectorCatalog(): Promise<{ catalog: ConnectorCatalogEntry[] }> {
  return parseJson(await apiFetch('/api/integrations/catalog'))
}

export type IcmpMonitorRow = {
  id: string
  assetId: string | null
  assetName: string
  category: string | null
  region: string | null
  host: string
  enabled: boolean
  lastRunAt: string | null
  lastCheckAt: string | null
  lastOkAt: string | null
  consecutiveFailures: number
  state: string
  reason: string | null
}

export async function fetchIcmpMonitors(): Promise<{ operationMode: string; monitors: IcmpMonitorRow[] }> {
  return parseJson(await apiFetch('/api/integrations/icmp-monitors'))
}

export type PrometheusIntegrationStatus = {
  vaultReady: boolean
  openai: {
    configured: boolean
    fromOrg: boolean
    fromEnv: boolean
    model: string
    keyHint: string | null
  }
  channels: Array<{
    id: string
    env: string
    label: string
    hint: string
    configured: boolean
    fromOrg: boolean
    fromEnv: boolean
  }>
}

export async function fetchPrometheusIntegration(): Promise<PrometheusIntegrationStatus> {
  return parseJson(await apiFetch('/api/integrations/prometheus'))
}

export async function savePrometheusIntegration(body: {
  apiKey?: string | null
  clearKey?: boolean
  model?: string
  channels?: Record<string, string | null>
}): Promise<PrometheusIntegrationStatus> {
  return parseJson(
    await apiFetch('/api/integrations/prometheus', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function testPrometheusIntegration(body?: {
  apiKey?: string
  model?: string
}): Promise<{ ok: boolean; model: string; error?: string }> {
  return parseJson(
    await apiFetch('/api/integrations/prometheus/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  )
}

export async function fetchConnectors(): Promise<{ connectors: ConnectorRecord[] }> {
  return parseJson(await apiFetch('/api/integrations/connectors'))
}

export async function createConnector(body: {
  kind: string
  name: string
  config?: Record<string, unknown>
  enabled?: boolean
}): Promise<{ connector: ConnectorRecord }> {
  return parseJson(await apiFetch('/api/integrations/connectors', { method: 'POST', body: JSON.stringify(body) }))
}

export async function testConnector(id: string): Promise<{
  result: { ok: boolean; result: string; error?: string | null; detail?: unknown }
}> {
  return parseJson(await apiFetch(`/api/integrations/connectors/${encodeURIComponent(id)}/test`, { method: 'POST' }))
}

export async function executeConnector(
  id: string,
  payload?: unknown,
): Promise<{
  result: { ok: boolean; result: string; error?: string | null }
  ingest: { accepted: number; duplicate: number; rejected: number }
}> {
  return parseJson(
    await apiFetch(`/api/integrations/connectors/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload != null ? { payload } : {}),
    }),
  )
}

export async function fetchIngestEvents(): Promise<{ events: IngestEventRow[] }> {
  return parseJson(await apiFetch('/api/integrations/events'))
}

export async function fetchIngestDeliveries(): Promise<{ deliveries: IngestDeliveryRow[] }> {
  return parseJson(await apiFetch('/api/integrations/deliveries'))
}

export async function reprocessIngestEvent(id: string): Promise<{ queued: boolean }> {
  return parseJson(await apiFetch(`/api/integrations/events/${encodeURIComponent(id)}/reprocess`, { method: 'POST' }))
}

export async function retryWebhookDelivery(id: string): Promise<{ queued: boolean }> {
  return parseJson(await apiFetch(`/api/integrations/deliveries/${encodeURIComponent(id)}/retry`, { method: 'POST' }))
}

export async function fetchAlphaBoard(): Promise<AlphaBoard> {
  return parseJson(await apiFetch('/api/alpha/board'))
}

export async function fetchAlphaConfig(): Promise<{ city: AlphaCityGeo }> {
  return parseJson(await apiFetch('/api/alpha/config'))
}

export async function saveAlphaConfig(patch: Partial<AlphaCityGeo>): Promise<{ city: AlphaCityGeo }> {
  return parseJson(
    await apiFetch('/api/alpha/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export async function runAlphaAnalysis(
  body: { kind: AlphaAnalysisKind; region?: string | null; date?: string | null; hour?: number | null },
  signal?: AbortSignal,
): Promise<{ analysis: AlphaAnalysisResult; recommendations: AlphaRecommendation[] }> {
  return parseJson(
    await apiFetch('/api/alpha/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),
  )
}

export async function fetchAlphaAnalyses(limit = 20): Promise<{
  items: { id: string; kind: string; title: string; createdAt: string; region: string | null }[]
}> {
  return parseJson(await apiFetch(`/api/alpha/analyses?limit=${limit}`))
}

export async function fetchAlphaAnalysis(id: string): Promise<AlphaAnalysisResult> {
  return parseJson(await apiFetch(`/api/alpha/analyses/${encodeURIComponent(id)}`))
}

export async function fetchAlphaSession(id?: string | null): Promise<{
  sessionId: string
  context: AlphaSessionContext
  messages: AlphaChatMessage[]
}> {
  const q = id ? `?id=${encodeURIComponent(id)}` : ''
  return parseJson(await apiFetch(`/api/alpha/session${q}`))
}

export async function fetchAlphaSessions(): Promise<{ items: AlphaSessionSummary[] }> {
  return parseJson(await apiFetch('/api/alpha/sessions'))
}

export async function createAlphaSession(): Promise<{
  sessionId: string
  context: AlphaSessionContext
  messages: AlphaChatMessage[]
  items: AlphaSessionSummary[]
}> {
  return parseJson(await apiFetch('/api/alpha/sessions', { method: 'POST' }))
}

export async function clearAlphaSession(id: string): Promise<{
  sessionId: string
  context: AlphaSessionContext
  messages: AlphaChatMessage[]
}> {
  return parseJson(await apiFetch(`/api/alpha/sessions/${encodeURIComponent(id)}/clear`, { method: 'POST' }))
}

export async function sendAlphaChat(
  body: { message: string; region?: string | null; sessionId?: string | null },
  signal?: AbortSignal,
): Promise<{
  sessionId: string
  context: AlphaSessionContext
  message: AlphaChatMessage
  analysis: AlphaAnalysisResult
  recommendations: AlphaRecommendation[]
  messages: AlphaChatMessage[]
  items: AlphaSessionSummary[]
}> {
  return parseJson(
    await apiFetch('/api/alpha/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),
  )
}

export async function fetchAlphaRecommendations(status?: AlphaRecStatus): Promise<{ items: AlphaRecommendation[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return parseJson(await apiFetch(`/api/alpha/recommendations${q}`))
}

export async function decideAlphaRecommendation(
  id: string,
  body: { status: Exclude<AlphaRecStatus, 'pending'>; justification: string },
): Promise<{ recommendation: AlphaRecommendation; nextStep: { type: string; hint: string } | null }> {
  return parseJson(
    await apiFetch(`/api/alpha/recommendations/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function observeAlphaRecommendation(
  id: string,
  observedResult: string,
): Promise<{ recommendation: AlphaRecommendation }> {
  return parseJson(
    await apiFetch(`/api/alpha/recommendations/${encodeURIComponent(id)}/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observedResult }),
    }),
  )
}

export type RoutableOrder = {
  incidentId: string
  agentId: string
  agentName: string
  title: string
  address: string
  city: string
  type: string
  scheduledStart?: string | null
  scheduledEnd?: string | null
  lat: number
  lng: number
  coordSource: string
  status: string
  eligible: boolean
  blockReason?: string
}

export type RouteAgentChoice = { agentId: string; agentName: string }

export type RouteAgentOrigin = {
  agentId: string
  agentName: string
  lat: number
  lng: number
  description: string
  source: 'gps' | 'cadastro_operacional' | 'manual' | string
  recordedAt?: string
  stale?: boolean
}

export type StreetRouteGeometry = {
  type: 'LineString'
  coordinates: [number, number][]
}

export type StreetRouteResult = {
  geometry: StreetRouteGeometry
  distanceMeters: number
  durationSeconds: number
  legs: { distanceMeters: number; durationSeconds: number; steps: { instruction: string; distanceMeters: number; durationSeconds: number }[] }[]
  waypointOrder: number[]
  optimized: boolean
  provider: string
  providerVersion: string
}

export type RouteScheduleConflict = { incidentId: string; reason: string }

export type PlannedRoute = {
  agentId: string
  agentName: string
  origin: RouteAgentOrigin
  stops: RoutableOrder[]
  street: StreetRouteResult
  conflicts: RouteScheduleConflict[]
  scheduleValidated: boolean
  optimization: string
  optimizationNote: string
}

export type SavedOperationalRoute = {
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
  geometry: StreetRouteGeometry | null
  distanceMeters: number | null
  durationSeconds: number | null
  provider: string | null
  providerVersion: string | null
  optimization: string | null
  constraints: Record<string, unknown> | null
  notes: string | null
  status: 'draft' | 'planned' | 'available' | 'in_progress' | 'completed' | 'cancelled'
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

export type RouteHistoryRow = {
  action: string
  previous_data: unknown
  new_data: unknown
  performed_by: string | null
  created_at: string
}

export type RoutePlanInput = {
  incidentIds?: string[]
  stopOrder?: string[]
  optimize?: boolean
  origin?: { lat: number; lng: number; description?: string }
  name?: string
  plannedDate?: string | null
  notes?: string | null
  status?: string
  expectedUpdatedAt?: string
}

export async function fetchRoutableOrders(): Promise<{
  orders: RoutableOrder[]
  agents: RouteAgentOrigin[]
  agentChoices: RouteAgentChoice[]
  city: string
}> {
  return parseJson(await apiFetch('/api/routes/orders'))
}

export async function planOperationalRoute(body: RoutePlanInput): Promise<PlannedRoute> {
  return parseJson(
    await apiFetch('/api/routes/plan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

export async function saveOperationalRoute(body: RoutePlanInput): Promise<SavedOperationalRoute> {
  return parseJson(
    await apiFetch('/api/routes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

export async function fetchSavedRoutes(): Promise<SavedOperationalRoute[]> {
  return parseJson(await apiFetch('/api/routes'))
}

export async function fetchSavedRoute(id: string): Promise<SavedOperationalRoute> {
  return parseJson(await apiFetch(`/api/routes/${encodeURIComponent(id)}`))
}

export async function fetchMyAssignedRoutes(): Promise<SavedOperationalRoute[]> {
  return parseJson(await apiFetch('/api/routes/mine'))
}

export async function patchOperationalRoute(id: string, body: RoutePlanInput): Promise<SavedOperationalRoute> {
  return parseJson(
    await apiFetch(`/api/routes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )
}

export async function duplicateOperationalRoute(id: string): Promise<SavedOperationalRoute> {
  return parseJson(
    await apiFetch(`/api/routes/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
    }),
  )
}

export async function fetchRouteHistory(id: string): Promise<RouteHistoryRow[]> {
  return parseJson(await apiFetch(`/api/routes/${encodeURIComponent(id)}/history`))
}

export async function fetchAcoes(): Promise<{ items: AcaoRecord[] }> {
  return parseJson(await apiFetch('/api/acoes'))
}

export async function patchAcao(
  id: string,
  body: {
    status: AcaoStatus
    takenAction?: string
    ignoredReason?: string
    delegatedToName?: string
    delegatedToUserId?: string
  },
): Promise<{ item: AcaoRecord }> {
  return parseJson(
    await apiFetch(`/api/acoes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
