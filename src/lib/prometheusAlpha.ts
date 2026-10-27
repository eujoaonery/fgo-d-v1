import type { SourceMeta } from './strategy'

/** Tipos compartilhados do Prometheus Alpha (front + BFF). */

export const ALPHA_ANALYSIS_KINDS = [
  'tomorrow',
  'next7d',
  'climate_ops',
  'operational_risk',
  'region_demand',
  'traffic',
  'pending_recs',
  'field_capacity',
  'operator_sla',
  'chat',
] as const

export type AlphaAnalysisKind = (typeof ALPHA_ANALYSIS_KINDS)[number]

export const ALPHA_CLAIM_KINDS = [
  'fact',
  'forecast',
  'trend',
  'model',
  'hypothesis',
  'recommendation',
] as const

export type AlphaClaimKind = (typeof ALPHA_CLAIM_KINDS)[number]

export const ALPHA_CLAIM_LABEL: Record<AlphaClaimKind, string> = {
  fact: 'Fato observado',
  forecast: 'Previsão de fonte externa',
  trend: 'Tendência estatística',
  model: 'Modelo preditivo',
  hypothesis: 'Hipótese',
  recommendation: 'Recomendação',
}

export const ALPHA_REC_STATUSES = ['pending', 'accepted', 'rejected', 'deferred', 'irrelevant'] as const
export type AlphaRecStatus = (typeof ALPHA_REC_STATUSES)[number]

export const ALPHA_REC_PRIORITIES = ['baixa', 'media', 'alta', 'critica'] as const
export type AlphaRecPriority = (typeof ALPHA_REC_PRIORITIES)[number]

export type AlphaCityGeo = {
  cityName: string
  uf: string
  lat: number
  lng: number
  timezone: string
  bbox: { south: number; north: number; west: number; east: number }
  municipalHolidays: string[]
  fromSettings: boolean
  weatherPointNote: string
}

export type HourlyWeatherPoint = {
  time: string
  temperatureC: number | null
  apparentC: number | null
  humidityPct: number | null
  precipProbPct: number | null
  precipMm: number | null
  rainMm: number | null
  windKmh: number | null
  gustKmh: number | null
  visibilityM: number | null
  cloudPct: number | null
  weatherCode: number | null
  condition: string
}

export type DailyWeatherPoint = {
  date: string
  weatherCode: number | null
  condition: string
  tempMaxC: number | null
  tempMinC: number | null
  precipSumMm: number | null
  precipProbMaxPct: number | null
}

export type AlphaWeatherBundle = {
  current: HourlyWeatherPoint | null
  hourly: HourlyWeatherPoint[]
  daily: DailyWeatherPoint[]
  source: SourceMeta
  attribution: string
}

export type AlphaArchiveHour = {
  time: string
  precipMm: number | null
  weatherCode: number | null
}

export type AlphaHoliday = {
  date: string
  name: string
  scope: 'nacional' | 'estadual' | 'municipal'
}

export type AlphaChartSeries = {
  id: string
  title: string
  description: string
  unit: string
  observed: boolean
  points: { label: string; value: number | null; timestamp?: string }[]
  source?: string
  updatedAt?: string | null
}

export type AlphaClaim = {
  kind: AlphaClaimKind
  title: string
  body: string
  region?: string
  at?: string
  confidenceNote?: string
  sourceKeys: string[]
}

export type AlphaRecommendationDraft = {
  category: string
  priority: AlphaRecPriority
  region?: string
  relatedRef?: string
  situation: string
  evidence: string[]
  justification: string
  actionText: string
  suggestedDeadline?: string
  expectedBenefit?: string
  uncertainties: string
  generator: string
}

export type AlphaRecommendation = AlphaRecommendationDraft & {
  id: string
  analysisId?: string
  status: AlphaRecStatus
  modelVersion?: string
  createdAt: string
  decisionJustification?: string
  decisionAt?: string
  decisionBy?: string
  observedResult?: string
  observedAt?: string
}

export type AlphaAnalysisResult = {
  id?: string
  kind: AlphaAnalysisKind
  title: string
  generatedAt: string
  city: AlphaCityGeo
  region: string | null
  period: { from: string; to: string; label: string }
  claims: AlphaClaim[]
  charts: AlphaChartSeries[]
  sources: SourceMeta[]
  limitations: string[]
  recommendations: AlphaRecommendationDraft[]
  followUps: string[]
  modelVersion: string
}

export type AlphaChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  analysis?: AlphaAnalysisResult
  claims?: AlphaClaim[]
}

export type AlphaSessionContext = {
  region: string | null
  date: string | null
  hour: number | null
  lastKind: AlphaAnalysisKind | null
  title?: string | null
}

export type AlphaSessionSummary = {
  id: string
  title: string
  updatedAt: string
  messageCount: number
}

export type AlphaBoard = {
  generatedAt: string
  agent: {
    openai: 'ready' | 'missing' | 'error'
    openaiNote: string
    weather: SourceMeta
    traffic: SourceMeta
    osm: SourceMeta
    model: SourceMeta
  }
  city: AlphaCityGeo
  lastAnalysisAt: string | null
  pendingRecommendations: number
  regions: string[]
}

export function isAlphaAnalysisKind(v: unknown): v is AlphaAnalysisKind {
  return typeof v === 'string' && (ALPHA_ANALYSIS_KINDS as readonly string[]).includes(v)
}

export function isAlphaRecStatus(v: unknown): v is AlphaRecStatus {
  return typeof v === 'string' && (ALPHA_REC_STATUSES as readonly string[]).includes(v)
}
