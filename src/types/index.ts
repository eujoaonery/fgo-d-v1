import type { DegradationLevel } from '@/lib/assetLifecycle'

export type DataOrigin = 'simulado' | 'real' | 'integracao' | 'importado' | 'manual'

export type IncidentPriority = 'baixa' | 'média' | 'alta' | 'crítica'
export type IncidentStatus =
  | 'aberta'
  | 'triagem'
  | 'planejada'
  | 'agendada'
  | 'em deslocamento'
  | 'em atendimento'
  | 'aguardando material'
  | 'resolvida'
  | 'cancelada'
export type AssetStatus = 'operacional' | 'alerta' | 'inativo'

export type AlertSeverity = 'informativa' | 'baixa' | 'média' | 'alta' | 'crítica'
export type AlertState =
  | 'novo'
  | 'reconhecido'
  | 'em atendimento'
  | 'em observação'
  | 'os_aberta'
  | 'resolvido'
  | 'falso positivo'

export interface OperationalAlert {
  id: string
  category: string
  severity: AlertSeverity
  title: string
  description: string
  source: string
  dataOrigin: DataOrigin
  relatedAssetId?: string
  region?: string
  incidentId?: string
  detectedAt: string
  state: AlertState
  rule?: string
  responseDueAt?: string
  escalatedAt?: string
  escalationLevel?: number
  claimedBy?: string
  claimedByLabel?: string
  claimedAt?: string
  dispatchedAt?: string
  completedAt?: string
}

export interface AlertHistoryEntry {
  id: string
  alertProtocol: string
  fromState: AlertState | null
  toState: AlertState
  note: string | null
  actorLabel: string
  changedAt: string
}

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

export interface RegionSummary {
  region: string
  assetsTotal: number
  assetsEligible: number
  assetsExcluded: number
  assetsAlert: number
  availabilityPercent: number
  openAlerts: number
  openIncidents: number
  avgMttrMinutes: number | null
}

export interface SearchHit {
  kind: 'alert' | 'incident' | 'asset' | 'team'
  id: string
  label: string
  sublabel?: string
  path: string
}

export type SimulationIntensity = 'low' | 'medium' | 'high'

export interface SimulationSettings {
  enabled: boolean
  intensity: SimulationIntensity
  tickIntervalMs: number
  startedAt?: string
  lastTickAt?: string
  ticksTotal: number
}
export type MapMarkerKind = 'camera' | 'semaforo' | 'sensor' | 'conectividade' | 'equipe' | 'ocorrencia' | 'movel'

export type TeamCapability =
  | 'semaforos'
  | 'cameras'
  | 'sensores'
  | 'conectividade'
  | 'infra'
  | 'transito'
  | 'manutencao'

export interface Incident {
  id: string
  description: string
  type: string
  region: string
  priority: IncidentPriority
  status: IncidentStatus
  openedAt: string
  dueAt?: string
  resolvedAt?: string
  assignee?: string
  assignedTeamId?: string
  requiredCapability?: TeamCapability
  relatedAssetId?: string
  location: string
  notes?: string
  workOrderDescription?: string
  scheduledStart?: string
  scheduledEnd?: string
  diagnosis?: string
  materials?: string
  closeProblem?: string
  closeSolution?: string
  closeSignature?: string
  closeImages?: OsCloseImage[]
  dataOrigin?: DataOrigin
  sourceAlertId?: string
  sourcePredictionId?: string
  subjectId?: string
  subjectLabel?: string
}

export interface OsCloseImage {
  fileName: string
  contentType: string
  dataUrl: string
}

export interface ActivityEvent {
  id: string
  timestamp: string
  message: string
  kind: 'asset' | 'incident' | 'team' | 'maintenance' | 'alert' | 'system'
  dataOrigin?: DataOrigin
}

export interface KpiMetric {
  id: string
  label: string
  value: number
  suffix?: string
  delta: number
  deltaLabel: string
  trend: 'up' | 'down' | 'neutral'
  route: string
  search?: Record<string, string>
  tone?: 'neutral' | 'success' | 'warning' | 'critical'
}

export type ChartPeriod = '24h' | '7d' | '30d'

export interface MapMarker {
  id: string
  kind: MapMarkerKind
  name: string
  x: number
  y: number
  lat?: number
  lng?: number
  status: AssetStatus | 'campo' | 'aberta'
  region: string
  updatedAt: string
  incidentId?: string
  priority?: IncidentPriority
}

export type ConnectivityStatus = 'conectado' | 'atrasado' | 'sem_comunicacao' | 'desconhecido' | 'nao_aplicavel'
export type CadastralStatus =
  | 'operacional'
  | 'nao_instalado'
  | 'mau_funcionamento'
  | 'em_manutencao'
  | 'em_uso'
  | 'desativado'
  | 'furtado'
  | 'baixado'

export type LocationType = 'ponto_fixo' | 'base' | 'trecho' | 'area' | 'recurso_movel'
export type CoordOrigin = 'cadastro' | 'mapa' | 'geocodificacao' | 'gps' | 'importado'
export type LocationReferenceKind = 'numero' | 'oposto_numero' | 'quilometro' | 'sem_numero' | 'ponto_conhecido'

export interface AssetLocation {
  cep: string
  neighborhood: string
  city: string
  uf: string
  street: string
  number: string
  reference?: string
  referenceKind?: LocationReferenceKind
  lat?: number
  lng?: number
  coordOrigin?: CoordOrigin
  coordPrecisionM?: number
  /** Falso quando o pino está na rua, mas o número de porta não foi confirmado. */
  numberConfirmed?: boolean
  locationType?: LocationType
  locationValidatedAt?: string
}

export interface AssetLiveLocation {
  lat: number
  lng: number
  recordedAt: string
  source: string
  accuracyM?: number
}

export interface AssetHistoryEntry {
  id: string
  assetId: string
  actorLabel: string
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  changedFields: string[]
  changedAt: string
}
export type AssetCriticality = 'baixa' | 'média' | 'alta' | 'crítica'

export interface AssetCategory {
  slug: string
  label: string
  markerKind: string
  sortOrder: number
}

export type AssetAttachmentKind =
  | 'manual'
  | 'certificado'
  | 'foto_instalacao'
  | 'documento_patrimonial'
  | 'outro'

export interface AssetAttachment {
  id: string
  assetId: string
  kind: AssetAttachmentKind
  fileName: string
  contentType: string
  sizeBytes?: number
  uploadedBy?: string
  uploadedAt: string
}

export interface UrbanAsset {
  id: string
  name: string
  category: string
  subtype?: string
  region: string
  status: AssetStatus
  lastSeen: string
  health: number
  mapX?: number
  mapY?: number
  patrimonyCode?: string
  serialNumber?: string
  manufacturer?: string
  model?: string
  address?: string
  location?: AssetLocation
  liveLocation?: AssetLiveLocation
  connectivityStatus?: ConnectivityStatus
  cadastralStatus?: CadastralStatus
  criticality?: AssetCriticality
  responsibleOrg?: string
  responsibleTeam?: string
  notes?: string
  installedAt?: string
  acquiredAt?: string
  lastVerifiedAt?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
  dataOrigin?: DataOrigin
  icmpEnabled?: boolean
  icmpHost?: string
  mqttEnabled?: boolean
  mqttHost?: string
  mqttPort?: number
  mqttTls?: boolean
  mqttTopics?: string
  mqttClientId?: string
  mqttUsername?: string
  mqttPasswordSet?: boolean
  snmpEnabled?: boolean
  snmpHost?: string
  snmpPort?: number
  snmpVersion?: '2c' | '3'
  snmpOids?: string
  snmpCommunitySet?: boolean
  snmpUsername?: string
  snmpAuthProtocol?: string
  snmpPrivProtocol?: string
  rtspEnabled?: boolean
  rtspHost?: string
  rtspPort?: number
  rtspPath?: string
  rtspUsername?: string
  rtspPasswordSet?: boolean
  rtspHealth?: 'unknown' | 'healthy' | 'degraded' | 'down'
  rtspLastError?: string
  rtspLastAttemptAt?: string
  onvifEnabled?: boolean
  onvifHost?: string
  onvifPort?: number
  onvifPath?: string
  onvifTls?: boolean
  onvifUsername?: string
  onvifPasswordSet?: boolean
  onvifHealth?: 'unknown' | 'healthy' | 'degraded' | 'down'
  onvifLastError?: string
  onvifLastAttemptAt?: string
  maintenanceIntervalDays?: number
  maintenanceNextDue?: string
  maintenanceLastDone?: string
  maintenancePlanNotes?: string
  usefulLifeMonths?: number
  degradationLevel?: DegradationLevel
  specs?: import('@/lib/assetSpecs').AssetSpecs
}

export type AgentOperationalStatus =
  | 'disponível'
  | 'em campo'
  | 'em atividade'
  | 'fora de escala'
  | 'pausa'
  | 'encerrado o turno'
  | 'indisponível'

export type AgentFunctionalStatus = 'ativo' | 'afastado' | 'desligado' | 'ferias'

export interface AgentShift {
  weekday: number
  start: string
  end: string
}

export interface Team {
  id: string
  name: string
  specialty: string
  capabilities: TeamCapability[]
  members: string[]
  region: string
  status: AgentOperationalStatus
  assignedIncidentId?: string
  mapX?: number
  mapY?: number
  registrationNumber?: string
  responsibleOrg?: string
  unit?: string
  jobTitle?: string
  qualifications?: string[]
  functionalStatus?: AgentFunctionalStatus
  shifts?: AgentShift[]
  locationShareUntil?: string
}

export interface MaintenanceOrder {
  id: string
  assetId: string
  assetName: string
  type: 'preventiva' | 'corretiva' | 'inspeção'
  priority: IncidentPriority
  assignee: string
  dueDate: string
  status: 'pendente' | 'em execução' | 'concluída' | 'atrasada'
  description?: string
  origin?: string
  sourceAlertId?: string
  openedAt?: string
}

export type CameraStreamStatus = 'online' | 'alerta' | 'offline'

export interface CameraFeed {
  id: string
  assetId: string
  label: string
  region: string
  status: CameraStreamStatus
  /** URL demonstrativa (rua/ponto). Troque por `/camera-feeds/...` ou stream real. */
  imageUrl: string
  primary?: boolean
}

export type CrisisLevel = 'A' | 'B' | 'C'
export type CrisisStatus = 'idle' | 'declared' | 'plan_active' | 'super_intel' | 'recovered'
export type CrisisAssignmentStatus = 'pending' | 'dispatched' | 'normalizing' | 'normalized'
export type UnsolvedReason =
  | 'sem_cobertura'
  | 'sem_unidade_livre'
  | 'critico_sem_atendimento'
  | 'prazo_estourado'
  | 'escalonado'

export interface CrisisAssignment {
  alertProtocol: string
  alertTitle: string
  category: string
  severity: AlertSeverity
  region: string
  capability: TeamCapability
  reason: UnsolvedReason
  solution: string
  teamId?: string
  teamName?: string
  incidentId?: string
  status: CrisisAssignmentStatus
  dispatchedAt?: string
  normalizingAt?: string
  normalizedAt?: string
}

export interface CrisisSnapshot {
  openAlerts: number
  resolvedAlerts: number
  unsolvedAlerts: number
  criticalUnsolved: number
  highUnsolved: number
  availableTeams: number
  regionsAffected: number
}

export interface CrisisState {
  level: CrisisLevel | null
  status: CrisisStatus
  declaredAt?: string
  acknowledgedAt?: string
  popupLevel?: CrisisLevel | null
  reasons: string[]
  snapshot: CrisisSnapshot
  unitsConvened: boolean
  convenedAt?: string
  superIntelActive: boolean
  superIntelStartedAt?: string
  assignments: CrisisAssignment[]
  recoveredAt?: string
  recoveredMessage?: string
}
