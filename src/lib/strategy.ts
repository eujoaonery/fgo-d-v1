export type SourceStatus = 'ok' | 'empty' | 'stale' | 'unavailable'

export type SourceMeta = {
  key: string
  label: string
  status: SourceStatus
  origin: string
  lastUpdatedAt: string | null
  note: string
}

export type CountByKey = { key: string; count: number }

export type SnapshotDigest = {
  assetsTotal: number
  assetsOperational: number
  assetsUnavailable: number
  openWorkOrders: number
  criticalWorkOrders: number
  activeAlerts: number
  teamsAvailable: number
  teamsMobilized: number
  trafficIncidents: number
  weatherWarnings: number
  predictiveRisks: number
  actionsInProgress: number
  pendingApprovals: number
}

export type SnapshotDelta = {
  field: keyof SnapshotDigest
  label: string
  previous: number
  current: number
  delta: number
}

export type StrategyIndicator = {
  key: string
  label: string
  value: number | null
  unit?: string
  breakdown?: CountByKey[]
  items?: { id: string; title: string; detail?: string }[]
  source: SourceMeta
}

export type WeatherWarning = {
  id: string
  event: string
  severity: string
  startsAt: string | null
  endsAt: string | null
  area: string
  source: string
}

export type WeatherForecast = {
  temperatureC: number | null
  precipitationMm: number | null
  windKmh: number | null
  summary: string
  nextHoursPrecipProb: number | null
  rainStart?: string | null
  fetchedAt: string
}

export type TrafficIncidentItem = {
  id: string
  title: string
  region?: string
  severity?: string
  kind: 'alerta' | 'ordem_servico'
}

export type PredictiveRiskItem = {
  id: string
  title: string
  region?: string
  horizonHours?: number
  probability?: number
  explanation: string
}

export type StrategySnapshot = {
  generatedAt: string
  city: { name: string; lat: number; lng: number }
  digest: SnapshotDigest
  changesSinceLastBriefing: SnapshotDelta[]
  lastBriefingAt: string | null
  indicators: StrategyIndicator[]
  weatherForecast: WeatherForecast | null
  weatherForecastSource: SourceMeta
  weatherWarnings: WeatherWarning[]
  weatherWarningsSource: SourceMeta
  trafficExternalSource: SourceMeta
  limitations: string[]
}

export type PrometheusRisk = {
  title: string
  justification: string
  horizon: string
  confidence: number | null
}

export type PrometheusBriefing = {
  executiveSummary: string
  risks: PrometheusRisk[]
  preventiveRecommendations: string[]
  resourcesNeedingReinforcement: string[]
  missingOrInconsistentData: string[]
}

export type PrometheusResult = {
  available: boolean
  stale: boolean
  generatedAt: string | null
  model: string | null
  briefing: PrometheusBriefing | null
  validationIssues: string[]
  unavailableReason: string | null
}

export type StrategicActionType =
  | 'public_alert'
  | 'civil_defense'
  | 'mobilize_teams'
  | 'traffic_intervention'
  | 'preventive_maintenance'
  | 'contingency_plan'

export type StrategicActionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'sent'
  | 'confirmed'
  | 'blocked_no_integration'
  | 'failed'
  | 'cancelled'

export type StrategicActionRecord = {
  id: string
  protocol: string
  actionType: StrategicActionType
  status: StrategicActionStatus
  title: string
  payload: Record<string, unknown>
  justification: string
  region: string
  createdBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  executedAt: string | null
  executionResult: Record<string, unknown> | null
  linkedEntity: string | null
  createdAt: string
  updatedAt: string
  events?: { eventType: string; detail?: Record<string, unknown>; actorLabel?: string; createdAt: string }[]
}

export type ActionFieldKey =
  | 'region'
  | 'event'
  | 'startsAt'
  | 'validUntil'
  | 'message'
  | 'sources'
  | 'channel'
  | 'units'
  | 'officers'
  | 'presentAt'
  | 'location'
  | 'area'
  | 'reason'
  | 'duration'
  | 'instructions'
  | 'priority'
  | 'teamIds'
  | 'redistributionNote'
  | 'trafficKind'
  | 'stretch'
  | 'agency'
  | 'assetId'
  | 'description'
  | 'assignee'
  | 'dueDate'
  | 'risks'
  | 'measures'
  | 'resources'
  | 'owners'
  | 'schedule'
  | 'activationCriteria'
  | 'evidence'

export type ActionFieldDef = {
  key: ActionFieldKey
  label: string
  kind: 'text' | 'textarea' | 'datetime' | 'select' | 'multiselect' | 'asset' | 'teams'
  required: boolean
  options?: { value: string; label: string }[]
  placeholder?: string
}

export type ActionCatalogEntry = {
  type: StrategicActionType
  code: string
  title: string
  purpose: string
  effects: string
  requiresChannel: boolean
  channelEnv: string | null
  channelReady?: boolean
  fields: ActionFieldDef[]
}

export const ACTION_CATALOG: ActionCatalogEntry[] = [
  {
    type: 'public_alert',
    code: 'A',
    title: 'Emitir alerta à população',
    purpose: 'Informar a população sobre evento ou risco, com validade e canal definidos.',
    effects: 'Registra o alerta e, se houver canal autorizado, envia a mensagem. Sem integração, permanece rascunho ou pendente.',
    requiresChannel: true,
    channelEnv: 'FOGO_PUBLIC_ALERT_WEBHOOK',
    fields: [
      { key: 'region', label: 'Região afetada', kind: 'text', required: true },
      { key: 'event', label: 'Evento ou risco', kind: 'text', required: true },
      { key: 'startsAt', label: 'Início', kind: 'datetime', required: true },
      { key: 'validUntil', label: 'Validade', kind: 'datetime', required: true },
      { key: 'message', label: 'Mensagem', kind: 'textarea', required: true },
      { key: 'sources', label: 'Fontes e evidências', kind: 'textarea', required: true },
      { key: 'channel', label: 'Canal', kind: 'select', required: true, options: [
        { value: 'webhook', label: 'Integração autorizada (webhook)' },
        { value: 'sms', label: 'SMS (requer integração)' },
        { value: 'sirene', label: 'Sirene / alto-falante (requer integração)' },
      ] },
    ],
  },
  {
    type: 'civil_defense',
    code: 'B',
    title: 'Convocar unidades da Defesa Civil',
    purpose: 'Solicitar apresentação de unidades e responsáveis em local e horário definidos.',
    effects: 'Registra a convocação. Só marca como enviada se a comunicação sair por canal integrado.',
    requiresChannel: true,
    channelEnv: 'FOGO_CIVIL_DEFENSE_WEBHOOK',
    fields: [
      { key: 'units', label: 'Unidades', kind: 'textarea', required: true, placeholder: 'Uma unidade por linha' },
      { key: 'officers', label: 'Responsáveis', kind: 'textarea', required: true },
      { key: 'presentAt', label: 'Data e horário de apresentação', kind: 'datetime', required: true },
      { key: 'location', label: 'Local', kind: 'text', required: true },
      { key: 'area', label: 'Área de atuação', kind: 'text', required: true },
      { key: 'reason', label: 'Motivo', kind: 'textarea', required: true },
      { key: 'duration', label: 'Duração prevista', kind: 'text', required: true },
      { key: 'instructions', label: 'Instruções', kind: 'textarea', required: true },
      { key: 'evidence', label: 'Referências e evidências', kind: 'textarea', required: true },
      { key: 'priority', label: 'Prioridade', kind: 'select', required: true, options: [
        { value: 'baixa', label: 'Baixa' },
        { value: 'média', label: 'Média' },
        { value: 'alta', label: 'Alta' },
        { value: 'crítica', label: 'Crítica' },
      ] },
    ],
  },
  {
    type: 'mobilize_teams',
    code: 'C',
    title: 'Mobilizar equipes operacionais',
    purpose: 'Propor redistribuição de equipes disponíveis conforme necessidade, localização e competências.',
    effects: 'Registra a proposta. A comunicação com as equipes só ocorre se houver canal e permissão.',
    requiresChannel: true,
    channelEnv: 'FOGO_TEAM_NOTIFY_WEBHOOK',
    fields: [
      { key: 'region', label: 'Região / necessidade', kind: 'text', required: true },
      { key: 'reason', label: 'Justificativa', kind: 'textarea', required: true },
      { key: 'teamIds', label: 'Equipes', kind: 'teams', required: true },
      { key: 'redistributionNote', label: 'Redistribuição proposta', kind: 'textarea', required: true },
      { key: 'evidence', label: 'Evidências', kind: 'textarea', required: false },
    ],
  },
  {
    type: 'traffic_intervention',
    code: 'D',
    title: 'Solicitar intervenção de trânsito',
    purpose: 'Registrar pedido de sinalização, bloqueio, desvio ou apoio — sem alterar vias diretamente.',
    effects: 'Abre solicitação ao órgão responsável. Não aciona semáforos nem bloqueia vias sem integração autorizada.',
    requiresChannel: true,
    channelEnv: 'FOGO_TRAFFIC_AGENCY_WEBHOOK',
    fields: [
      { key: 'trafficKind', label: 'Tipo de intervenção', kind: 'select', required: true, options: [
        { value: 'sinalizacao', label: 'Sinalização' },
        { value: 'bloqueio', label: 'Bloqueio' },
        { value: 'desvio', label: 'Desvio' },
        { value: 'apoio', label: 'Apoio operacional' },
      ] },
      { key: 'stretch', label: 'Trecho', kind: 'text', required: true },
      { key: 'region', label: 'Região', kind: 'text', required: true },
      { key: 'reason', label: 'Justificativa', kind: 'textarea', required: true },
      { key: 'startsAt', label: 'Início do período', kind: 'datetime', required: true },
      { key: 'validUntil', label: 'Fim do período', kind: 'datetime', required: true },
      { key: 'agency', label: 'Órgão responsável', kind: 'text', required: true, placeholder: 'Ex.: CET / SMTT' },
      { key: 'evidence', label: 'Evidências', kind: 'textarea', required: true },
    ],
  },
  {
    type: 'preventive_maintenance',
    code: 'E',
    title: 'Abrir operação preventiva de manutenção',
    purpose: 'Criar ordem de manutenção vinculada a ativo cadastrado, com prioridade, equipe e prazo.',
    effects: 'Gera ordem no módulo de manutenção se não houver duplicata aberta para o mesmo ativo.',
    requiresChannel: false,
    channelEnv: null,
    fields: [
      { key: 'assetId', label: 'Ativo', kind: 'asset', required: true },
      { key: 'priority', label: 'Prioridade', kind: 'select', required: true, options: [
        { value: 'baixa', label: 'Baixa' },
        { value: 'média', label: 'Média' },
        { value: 'alta', label: 'Alta' },
        { value: 'crítica', label: 'Crítica' },
      ] },
      { key: 'description', label: 'Descrição', kind: 'textarea', required: true },
      { key: 'assignee', label: 'Equipe responsável', kind: 'text', required: true },
      { key: 'dueDate', label: 'Prazo', kind: 'datetime', required: true },
      { key: 'evidence', label: 'Evidências', kind: 'textarea', required: false },
    ],
  },
  {
    type: 'contingency_plan',
    code: 'F',
    title: 'Criar plano de contingência',
    purpose: 'Consolidar riscos, medidas, recursos, responsáveis, cronograma e critérios de ativação.',
    effects: 'Grava o plano com versão e estado. Novas edições incrementam o histórico de versões.',
    requiresChannel: false,
    channelEnv: null,
    fields: [
      { key: 'event', label: 'Título do plano', kind: 'text', required: true },
      { key: 'region', label: 'Abrangência', kind: 'text', required: true },
      { key: 'risks', label: 'Riscos contemplados', kind: 'textarea', required: true },
      { key: 'measures', label: 'Medidas preventivas', kind: 'textarea', required: true },
      { key: 'resources', label: 'Recursos necessários', kind: 'textarea', required: true },
      { key: 'owners', label: 'Responsáveis', kind: 'textarea', required: true },
      { key: 'schedule', label: 'Cronograma', kind: 'textarea', required: true },
      { key: 'activationCriteria', label: 'Critérios de ativação', kind: 'textarea', required: true },
    ],
  },
]

export function actionCatalogEntry(type: StrategicActionType): ActionCatalogEntry | undefined {
  return ACTION_CATALOG.find((a) => a.type === type)
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  ok: 'Fonte disponível',
  empty: 'Sem ocorrências',
  stale: 'Desatualizado',
  unavailable: 'Fonte indisponível',
}

export const ACTION_STATUS_LABEL: Record<StrategicActionStatus, string> = {
  draft: 'Rascunho',
  pending_approval: 'Pendente de aprovação',
  approved: 'Aprovada',
  executing: 'Em execução',
  sent: 'Enviada',
  confirmed: 'Confirmada',
  blocked_no_integration: 'Aguardando integração',
  failed: 'Falha no envio',
  cancelled: 'Cancelada',
}

export const DIGEST_LABELS: Record<keyof SnapshotDigest, string> = {
  assetsTotal: 'Ativos cadastrados',
  assetsOperational: 'Ativos operacionais',
  assetsUnavailable: 'Ativos indisponíveis',
  openWorkOrders: 'Ordens abertas',
  criticalWorkOrders: 'Ordens críticas',
  activeAlerts: 'Alertas ativos',
  teamsAvailable: 'Equipes disponíveis',
  teamsMobilized: 'Equipes mobilizadas',
  trafficIncidents: 'Incidentes de trânsito',
  weatherWarnings: 'Avisos meteorológicos',
  predictiveRisks: 'Riscos preditivos',
  actionsInProgress: 'Ações em andamento',
  pendingApprovals: 'Aprovações pendentes',
}
