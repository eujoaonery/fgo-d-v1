import type { Incident, OperationalAlert } from '../types.js'
import { buildAlertForecast } from './alertModel.js'

type EvalPrediction = {
  calculatedAt: string
  horizonHours: number
  region?: string
  periodStart?: string
  periodEnd?: string
  dataOriginSet?: string
  inputSummary?: Record<string, unknown>
}

export const EVAL_GRACE_MS: Record<number, number> = {
  24: 2 * 3600_000,
  48: 4 * 3600_000,
  168: 12 * 3600_000,
  720: 24 * 3600_000,
}

export function periodEndOf(prediction: Pick<EvalPrediction, 'calculatedAt' | 'horizonHours' | 'periodEnd'>): number {
  if (prediction.periodEnd) {
    const t = Date.parse(prediction.periodEnd)
    if (Number.isFinite(t)) return t
  }
  return Date.parse(prediction.calculatedAt) + prediction.horizonHours * 3600_000
}

export function graceMsFor(horizonHours: number): number {
  if (EVAL_GRACE_MS[horizonHours] != null) return EVAL_GRACE_MS[horizonHours]
  if (horizonHours <= 24) return EVAL_GRACE_MS[24]
  if (horizonHours <= 168) return EVAL_GRACE_MS[168]
  return EVAL_GRACE_MS[720]
}

export function evaluationReady(prediction: Pick<EvalPrediction, 'calculatedAt' | 'horizonHours' | 'periodEnd'>, now = Date.now()): boolean {
  return now >= periodEndOf(prediction) + graceMsFor(prediction.horizonHours)
}

export function civilDateInSaoPaulo(iso: string): string {
  const dt = new Date(iso)
  if (!Number.isFinite(dt.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(dt)
      .map((p) => [p.type, p.value]),
  )
  return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

export function todayCivilSaoPaulo(now = new Date()): string {
  return civilDateInSaoPaulo(now.toISOString())
}

export type AccuracyLevel = 'exact' | 'useful' | 'off' | 'miss' | 'pending'

/** Acerto ≈ previsto. Aproveitamento cobre o exemplo 10 previstos e 10–15 emitidos. */
export function accuracyLevel(
  predicted: number | undefined,
  observed: number | null | undefined,
  opts?: { inProgress?: boolean },
): AccuracyLevel {
  if (predicted == null || !Number.isFinite(predicted) || observed == null || !Number.isFinite(observed)) {
    return 'pending'
  }
  if (opts?.inProgress && observed === 0) return 'pending'
  if (predicted > 0 && observed === 0) return 'miss'
  if (predicted <= 0 && observed === 0) return 'exact'
  if (opts?.inProgress && observed < predicted) return 'pending'
  const err = Math.abs(observed - predicted)
  if (err <= Math.max(1, predicted * 0.1) || Math.round(observed) === Math.round(predicted)) return 'exact'
  if (observed >= predicted * 0.5 && observed <= predicted * 1.5) return 'useful'
  if (observed > 0) return 'off'
  return 'miss'
}

export function reviewFromAccuracy(level: AccuracyLevel): 'confirmed' | 'partial' | 'missed' {
  if (level === 'exact') return 'confirmed'
  if (level === 'useful' || level === 'off') return 'partial'
  return 'missed'
}

export function countObservedAlerts(
  alerts: Pick<OperationalAlert, 'detectedAt' | 'region' | 'dataOrigin' | 'state'>[],
  prediction: EvalPrediction,
): number {
  const from = prediction.periodStart ? Date.parse(prediction.periodStart) : Date.parse(prediction.calculatedAt)
  const to = periodEndOf(prediction)
  const includeSimulated = prediction.dataOriginSet !== 'real'
  return alerts.filter((alert) => {
    if (alert.state === 'falso positivo') return false
    const t = Date.parse(alert.detectedAt)
    if (!Number.isFinite(t) || t < from || t >= to) return false
    if (prediction.region && alert.region && alert.region !== prediction.region) return false
    if (!includeSimulated && alert.dataOrigin === 'simulado') return false
    return true
  }).length
}

export function countAlertsOnCivilDay(
  alerts: Pick<OperationalAlert, 'detectedAt' | 'state'>[],
  ymd: string,
): number {
  return alerts.filter((alert) => {
    if (alert.state === 'falso positivo') return false
    return civilDateInSaoPaulo(alert.detectedAt) === ymd
  }).length
}

export function isCityVolumeForecast(prediction: EvalPrediction & { predictionType?: string }): boolean {
  const category = typeof prediction.inputSummary?.category === 'string' ? prediction.inputSummary.category : ''
  return prediction.predictionType === 'demand_forecast' && !prediction.region && !category
}

export type AccuracyPair = {
  id: string
  date: string
  label: string
  predicted: number
  observed: number | null
  level: AccuracyLevel
  inProgress: boolean
}

export type AccuracyTrack = {
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
  pairs: AccuracyPair[]
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function rollupAccuracy(id: AccuracyTrack['id'], label: string, pairs: AccuracyPair[]): AccuracyTrack {
  const decided = pairs.filter((p) => p.level !== 'pending')
  const exact = decided.filter((p) => p.level === 'exact').length
  const useful = decided.filter((p) => p.level === 'useful').length
  const off = decided.filter((p) => p.level === 'off').length
  const miss = decided.filter((p) => p.level === 'miss').length
  const scored = decided.length
  return {
    id,
    label,
    scored,
    exact,
    useful,
    off,
    miss,
    inProgress: pairs.filter((p) => p.inProgress).length,
    utilization: scored ? round4((exact + useful) / scored) : null,
    exactRate: scored ? round4(exact / scored) : null,
    pairs,
  }
}

export function weekdayDailyMeansFromIso(timestamps: string[]): Array<number | null> {
  const byDay = new Map<string, number>()
  for (const iso of timestamps) {
    const ymd = civilDateInSaoPaulo(iso)
    if (!ymd) continue
    byDay.set(ymd, (byDay.get(ymd) ?? 0) + 1)
  }
  const buckets: number[][] = Array.from({ length: 7 }, () => [])
  for (const [ymd, count] of byDay) {
    const wd = new Date(`${ymd}T12:00:00-03:00`).getDay()
    buckets[wd]?.push(count)
  }
  return buckets.map((arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null))
}

export const ALERT_HOUR_HORIZONS = [1, 3, 8, 12, 24] as const

export type ChanceLabel = 'baixa' | 'média' | 'alta'

export type HourlyAlertForecast = {
  id: `${(typeof ALERT_HOUR_HORIZONS)[number]}h`
  hours: number
  label: string
  fromLabel: string
  toLabel: string
  periodStart: string
  periodEnd: string
  predicted: number | null
  probability: number | null
  probabilityLabel: ChanceLabel
  confidence: number | null
  confidenceLabel: ChanceLabel
  sampleDays: number
}

export function civilHourInSaoPaulo(iso: string): { ymd: string; hour: number; weekday: number } | null {
  const dt = new Date(iso)
  if (!Number.isFinite(dt.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(dt)
      .map((p) => [p.type, p.value]),
  )
  if (!parts.year || !parts.month || !parts.day || parts.hour == null) return null
  const ymd = `${parts.year}-${parts.month}-${parts.day}`
  const hour = Number(parts.hour) % 24
  const weekday = new Date(`${ymd}T12:00:00-03:00`).getDay()
  return { ymd, hour, weekday }
}

export function forecastAlertHours(
  timestamps: string[],
  now = new Date(),
  rainStart: string | null = null,
): HourlyAlertForecast[] {
  return buildAlertForecast(timestamps, now, { rainStart }).hours.map((hour) => ({
    id: hour.id,
    hours: hour.hours,
    label: hour.label,
    fromLabel: hour.fromLabel,
    toLabel: hour.toLabel,
    periodStart: hour.periodStart,
    periodEnd: hour.periodEnd,
    predicted: hour.predicted,
    probability: hour.probability,
    probabilityLabel: hour.probabilityLabel,
    confidence: hour.confidence,
    confidenceLabel: hour.confidenceLabel,
    sampleDays: hour.sampleDays,
  }))
}

export function countObserved(
  incidents: Pick<Incident, 'openedAt' | 'region' | 'type' | 'dataOrigin'>[],
  prediction: EvalPrediction,
): number {
  const from = prediction.periodStart ? Date.parse(prediction.periodStart) : Date.parse(prediction.calculatedAt)
  const to = periodEndOf(prediction)
  const category = typeof prediction.inputSummary?.category === 'string' ? prediction.inputSummary.category : undefined
  const includeSimulated = prediction.dataOriginSet !== 'real'
  return incidents.filter((incident) => {
    const t = Date.parse(incident.openedAt)
    if (!Number.isFinite(t) || t < from || t >= to) return false
    if (prediction.region && incident.region !== prediction.region) return false
    if (category && incident.type !== category) return false
    if (!includeSimulated && incident.dataOrigin === 'simulado') return false
    return true
  }).length
}

export function reviewFromObserved(predicted: number | undefined, observed: number): 'confirmed' | 'partial' | 'missed' {
  return reviewFromAccuracy(accuracyLevel(predicted, observed))
}
