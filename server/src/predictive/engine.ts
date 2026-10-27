import { randomUUID } from 'crypto'
import type { FogoDb } from '../db.js'
import { listAlertForecastSamples, listAlerts, listAssets, listIncidents, listTeams, type AlertForecastSample } from '../repository.js'
import {
  countNeighborhoodAlertsInWindow,
  isUsageEvent,
  neighborhoodRisks,
  observedUseRate,
  staffGaps,
  utilizationMoves,
  type NeighborhoodAlert,
  type UseEvent,
} from './cityForecast.js'
import { buildAlertForecast } from './alertModel.js'
import { projectNeural } from './neuralNet.js'
import { assessAssetsLifecycle, todayYmd } from '../../../src/lib/assetLifecycle.js'
import { isOccurrencePending } from '../../../src/lib/occurrenceState.js'
import { buildContextualSignals } from './context.js'
import { computePredictiveMetrics } from './metrics.js'
import { HttpError } from '../httpError.js'
import { MIN_OBSERVATIONS } from './demand.js'
import {
  getPredictiveControls,
  insertPredictiveRun,
  listPredictiveRuns,
  patchPredictiveControls,
  type PredictiveControls,
} from './controls.js'
import { countObservedAlerts, evaluationReady, periodEndOf, reviewFromObserved, rollupAccuracy } from './evaluate.js'

export type PredictionType = 'region_risk' | 'maintenance_due' | 'incident_spike' | 'demand_forecast'

/** Volume de OS ou tickets. Situação de alerta, pico e contexto urbano não entram aqui. */
export function isOsTicketPrediction(p: Pick<PredictionRecord, 'predictionType' | 'inputSummary'>): boolean {
  if (p.predictionType === 'demand_forecast') return true
  const summary = p.inputSummary ?? {}
  if ('orderIds' in summary) return true
  const rule = String(summary.ruleKey ?? '')
  return rule.startsWith('demand:') || rule.startsWith('maintenance_due:')
}

/** Quantidade de OS por região. Continua fora da fila do CCO e não abre ordem. */
export function isRegionalOsForecast(p: Pick<PredictionRecord, 'inputSummary'>): boolean {
  return String(p.inputSummary?.ruleKey ?? '').startsWith('os-region:')
}

/** Volume antigo de OS/tickets é encerrado. A previsão por região permanece. */
export function retiresOsVolumePrediction(p: Pick<PredictionRecord, 'predictionType' | 'inputSummary'>): boolean {
  return isOsTicketPrediction(p) && !isRegionalOsForecast(p)
}
export type PredictionReviewStatus = 'pending' | 'confirmed' | 'missed' | 'partial' | 'expired'
export type PredictionDecisionStatus = 'pending' | 'accepted' | 'rejected' | 'deferred' | 'irrelevant'

export const DECISION_STATUSES: PredictionDecisionStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'deferred',
  'irrelevant',
]

export interface PredictionRecord {
  id: string
  predictionType: PredictionType
  targetLabel: string
  region?: string
  assetExternalId?: string
  horizonHours: number
  calculatedAt: string
  predictedValue?: number
  baselineValue?: number
  probability?: number
  modelName: string
  modelVersion: string
  inputSummary?: Record<string, unknown>
  explanation: string
  recommendation?: string
  alertProtocol?: string
  observedValue?: number
  observedAt?: string
  observedNote?: string
  reviewStatus: PredictionReviewStatus
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
  datasetWatermark?: string
  workOrderProtocol?: string
}

function rowToPrediction(row: Record<string, unknown>): PredictionRecord {
  return {
    id: row.external_id as string,
    predictionType: row.prediction_type as PredictionType,
    targetLabel: row.target_label as string,
    region: (row.region as string) ?? undefined,
    assetExternalId: (row.asset_external_id as string) ?? undefined,
    horizonHours: row.horizon_hours as number,
    calculatedAt: row.calculated_at as string,
    predictedValue: row.predicted_value != null ? Number(row.predicted_value) : undefined,
    baselineValue: row.baseline_value != null ? Number(row.baseline_value) : undefined,
    probability: row.probability != null ? Number(row.probability) : undefined,
    modelName: row.model_name as string,
    modelVersion: row.model_version as string,
    inputSummary: (row.input_summary as Record<string, unknown>) ?? undefined,
    explanation: row.explanation as string,
    recommendation: (row.recommendation as string) ?? undefined,
    alertProtocol: (row.alert_protocol as string) ?? undefined,
    observedValue: row.observed_value != null ? Number(row.observed_value) : undefined,
    observedAt: (row.observed_at as string) ?? undefined,
    reviewStatus: row.review_status as PredictionReviewStatus,
    reviewNote: (row.review_note as string) ?? undefined,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    reviewedBy: (row.reviewed_by as string) ?? undefined,
    observedNote: (row.observed_note as string) ?? undefined,
    decisionStatus: ((row.decision_status as PredictionDecisionStatus) || 'pending') as PredictionDecisionStatus,
    decisionJustification: (row.decision_justification as string) ?? undefined,
    decisionAt: (row.decision_at as string) ?? undefined,
    decisionBy: (row.decision_by as string) ?? undefined,
    periodStart: (row.period_start as string) ?? undefined,
    periodEnd: (row.period_end as string) ?? undefined,
    intervalLow: row.interval_low != null ? Number(row.interval_low) : undefined,
    intervalHigh: row.interval_high != null ? Number(row.interval_high) : undefined,
    observationCount: row.observation_count != null ? Number(row.observation_count) : undefined,
    dataOriginSet: (row.data_origin_set as string) ?? undefined,
    datasetWatermark: (row.dataset_watermark as string) ?? undefined,
    workOrderProtocol: (row.work_order_protocol as string) ?? undefined,
  }
}

export async function listPredictions(
  db: FogoDb,
  limit = 50,
  opts?: { excludeDemand?: boolean },
): Promise<PredictionRecord[]> {
  let query = db.supabase.from('predictions').select('*').eq('organization_id', db.orgId)
  if (opts?.excludeDemand) query = query.neq('prediction_type', 'demand_forecast')
  const { data, error } = await query.order('calculated_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => rowToPrediction(r))
}

export async function insertPrediction(
  db: FogoDb,
  input: Omit<PredictionRecord, 'id' | 'reviewStatus' | 'calculatedAt' | 'modelName' | 'modelVersion'> & {
    id?: string
    modelName?: string
    modelVersion?: string
  },
): Promise<PredictionRecord> {
  const externalId = input.id ?? `PRV-${randomUUID().slice(0, 8).toUpperCase()}`
  const row = {
    organization_id: db.orgId,
    external_id: externalId,
    prediction_type: input.predictionType,
    target_label: input.targetLabel,
    region: input.region ?? null,
    asset_external_id: input.assetExternalId ?? null,
    horizon_hours: input.horizonHours,
    predicted_value: input.predictedValue ?? null,
    baseline_value: input.baselineValue ?? null,
    probability: input.probability ?? null,
    model_name: input.modelName ?? 'fogo-rules-v1',
    model_version: input.modelVersion ?? '1.0.0',
    input_summary: input.inputSummary ?? null,
    explanation: input.explanation,
    recommendation: input.recommendation ?? null,
    alert_protocol: input.alertProtocol ?? null,
    review_status: 'pending',
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    interval_low: input.intervalLow ?? null,
    interval_high: input.intervalHigh ?? null,
    observation_count: input.observationCount ?? null,
    data_origin_set: input.dataOriginSet ?? null,
    dataset_watermark: input.datasetWatermark ?? null,
  }
  const { error } = await db.supabase.from('predictions').insert(row)
  if (error) throw error
  const { data } = await db.supabase
    .from('predictions')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
    .single()
  return rowToPrediction(data!)
}

export async function reviewPrediction(
  db: FogoDb,
  externalId: string,
  body: { status: PredictionReviewStatus; note?: string; observedValue?: number },
  reviewedBy: string,
) {
  const patch: Record<string, unknown> = {
    review_status: body.status,
    review_note: body.note ?? null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy,
  }
  if (body.observedValue != null && Number.isFinite(body.observedValue)) {
    patch.observed_value = body.observedValue
    patch.observed_at = new Date().toISOString()
  }
  const { error } = await db.supabase
    .from('predictions')
    .update(patch)
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
  if (error) throw error
}

const JUSTIFICATION_MIN = 8

export async function decidePrediction(
  db: FogoDb,
  externalId: string,
  body: { status: PredictionDecisionStatus; justification: string },
  decidedBy: string,
) {
  if (!DECISION_STATUSES.includes(body.status) || body.status === 'pending') {
    throw new HttpError(400, 'Decisão inválida')
  }
  const justification = body.justification.trim()
  if (justification.length < JUSTIFICATION_MIN) {
    throw new HttpError(400, `Justificativa obrigatória (mínimo ${JUSTIFICATION_MIN} caracteres)`)
  }
  const { error } = await db.supabase
    .from('predictions')
    .update({
      decision_status: body.status,
      decision_justification: justification,
      decision_at: new Date().toISOString(),
      decision_by: decidedBy,
    })
    .eq('organization_id', db.orgId)
    .eq('external_id', externalId)
  if (error) throw error
}

export async function assertPredictionOsAllowed(db: FogoDb, predictionId: string, duplicateNote?: string) {
  const { data, error } = await db.supabase
    .from('predictions')
    .select('external_id')
    .eq('organization_id', db.orgId)
    .eq('external_id', predictionId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Previsão não encontrada.', 'PREDICTION_NOT_FOUND')
  const { count } = await db.supabase
    .from('incidents')
    .select('protocol', { count: 'exact', head: true })
    .eq('organization_id', db.orgId)
    .eq('source_prediction_id', predictionId)
  if ((count ?? 0) > 0 && (duplicateNote?.trim().length ?? 0) < 8) {
    throw new HttpError(
      409,
      'Já existe ordem vinculada a esta previsão. Informe a justificativa operacional para abrir outra.',
      'PREDICTION_OS_EXISTS',
    )
  }
}

export async function linkPredictionToWorkOrder(
  db: FogoDb,
  predictionId: string,
  workOrderProtocol: string,
  duplicateNote?: string,
) {
  await assertPredictionOsAllowed(db, predictionId, duplicateNote)
  const { data, error } = await db.supabase
    .from('predictions')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('external_id', predictionId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Previsão não encontrada.', 'PREDICTION_NOT_FOUND')
  const pred = rowToPrediction(data)
  const { error: updErr } = await db.supabase
    .from('predictions')
    .update({
      work_order_protocol: workOrderProtocol,
      input_summary: {
        ...(pred.inputSummary ?? {}),
        lastWorkOrderProtocol: workOrderProtocol,
        lastWorkOrderAt: new Date().toISOString(),
        duplicateNote: duplicateNote?.trim() || undefined,
      },
    })
    .eq('organization_id', db.orgId)
    .eq('external_id', predictionId)
  if (updErr) throw updErr
}

const lastPredictiveRun = new Map<string, number>()
const predictiveInFlight = new Map<string, Promise<void>>()
const PREDICTIVE_REFRESH_MS = 60_000

/** Ciclo do motor — independente do painel ficar aberto. */
export async function maybeRunPredictiveRules(db: FogoDb) {
  const running = predictiveInFlight.get(db.orgId)
  if (running) return running
  const last = lastPredictiveRun.get(db.orgId) ?? 0
  if (Date.now() - last < PREDICTIVE_REFRESH_MS) return
  lastPredictiveRun.set(db.orgId, Date.now())
  const run = runPredictiveCycle(db).finally(() => predictiveInFlight.delete(db.orgId))
  predictiveInFlight.set(db.orgId, run)
  await run
}

export async function runPredictiveCycle(db: FogoDb) {
  const startedAt = new Date().toISOString()
  const controls = await getPredictiveControls(db)
  try {
    if (controls.forecastsEnabled) {
      await retireOsTicketPredictions(db)
      await runPredictiveRules(db)
      await emitRegionalOsForecasts(db)
      await emitSituationalForecasts(db)
      await emitCityForecasts(db)
      await patchPredictiveControls(db, { lastForecastAt: new Date().toISOString(), lastError: undefined })
    }
    if (controls.evaluationEnabled) {
      await autoReviewPredictions(db, await listAlertForecastSamples(db))
      await patchPredictiveControls(db, { lastEvalAt: new Date().toISOString() })
    }
    if (controls.neuralOfficial) await syncNeuralOfficial(db)
    await insertPredictiveRun(db, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'ok',
      step: 'cycle',
      summary: {
        learning: controls.learningEnabled,
        forecasts: controls.forecastsEnabled,
        evaluation: controls.evaluationEnabled,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await patchPredictiveControls(db, { lastError: message }).catch(() => undefined)
    await insertPredictiveRun(db, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'error',
      step: 'cycle',
      error: message,
    })
    throw err
  }
}

async function upsertLivePrediction(
  db: FogoDb,
  pendingByKey: Map<string, PredictionRecord>,
  input: Omit<PredictionRecord, 'id' | 'reviewStatus' | 'calculatedAt' | 'modelName' | 'modelVersion'> & {
    id?: string
  },
) {
  const ruleKey = String(input.inputSummary?.ruleKey ?? '')
  const existing = pendingByKey.get(ruleKey)
  if (existing) return
  const pred = await insertPrediction(db, input)
  pendingByKey.set(ruleKey, pred)
}


/** Regras de pico e pressão de alertas. A quantidade de OS não entra nestas regras. */
export async function runPredictiveRules(db: FogoDb) {
  const [alerts, existing] = await Promise.all([listAlertForecastSamples(db), listPredictions(db, 200)])
  const pendingByKey = new Map<string, PredictionRecord>()
  for (const p of existing.filter((row) => row.reviewStatus === 'pending' && !isOsTicketPrediction(row))) {
    const key = p.inputSummary?.ruleKey as string | undefined
    if (key) pendingByKey.set(key, p)
  }

  const now = Date.now()
  const dayMs = 86_400_000
  const countable = alerts.filter((a) => a.state !== 'falso positivo' && a.category !== 'Preditiva')
  const last24h = countable.filter((a) => now - Date.parse(a.detectedAt) < dayMs)
  const last7d = countable.filter((a) => now - Date.parse(a.detectedAt) < 7 * dayMs)
  const regions = [...new Set(countable.map((a) => a.region ?? '').filter((r) => r.length > 0))]
  if (regions.length === 0) regions.push('Centro')

  const openIn = (region: string) =>
    alerts.filter((a) => a.region === region && isOccurrencePending(a.state) && a.category !== 'Preditiva').length

  const city24 = last24h.length
  const cityBaseline = last7d.length / 7
  if (city24 >= 3 && cityBaseline >= 0.3 && city24 >= cityBaseline * 1.4) {
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: 'Pico de alertas — cidade',
      horizonHours: 24,
      predictedValue: city24,
      baselineValue: Math.round(cityBaseline * 10) / 10,
      probability: Math.min(0.95, city24 / (cityBaseline * 2 + 1)),
      inputSummary: { ruleKey: 'alert_spike:cidade', count24h: city24, baselineDaily: cityBaseline, windowDays: 7, source: 'alerts' },
      explanation: 'Devido ao aumento de alertas nas últimas 24 h, a cidade pode ter um pico nas próximas horas.',
      recommendation: 'Reforçar o monitoramento e a triagem dos alertas abertos.',
    })
  }

  for (const region of regions) {
    const count24 = last24h.filter((a) => a.region === region).length
    const count7 = last7d.filter((a) => a.region === region).length
    const baselineDaily = count7 / 7
    if (count24 < 2 || baselineDaily < 0.3 || count24 < baselineDaily * 1.4) continue
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: `Pico de alertas — ${region}`,
      region,
      horizonHours: 24,
      predictedValue: count24,
      baselineValue: Math.round(baselineDaily * 10) / 10,
      probability: Math.min(0.95, count24 / (baselineDaily * 2 + 1)),
      inputSummary: { ruleKey: `alert_spike:${region}`, count24h: count24, baselineDaily, windowDays: 7, source: 'alerts' },
      explanation: `Devido ao aumento de alertas nas últimas 24 h, ${region} pode ter um pico nas próximas horas.`,
      recommendation: 'Priorizar a triagem dos alertas dessa região.',
    })
  }

  for (const region of regions) {
    const openAl = openIn(region)
    const otherScores = regions.filter((r) => r !== region).map((r) => openIn(r))
    const median = otherScores.length === 0 ? 0 : [...otherScores].sort((a, b) => a - b)[Math.floor(otherScores.length / 2)]!
    if (openAl < 3) continue
    if (otherScores.length > 0 && openAl < median * 1.3) continue
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: `Alertas acima do restante — ${region}`,
      region,
      horizonHours: 48,
      predictedValue: openAl,
      baselineValue: median,
      probability: Math.min(0.9, openAl / (median + 3)),
      inputSummary: { ruleKey: `alert_risk:${region}`, openAlerts: openAl, medianPeer: median, source: 'alerts' },
      explanation: `Devido aos alertas abertos acima das outras regiões, ${region} pode ficar sobrecarregada.`,
      recommendation: 'Priorizar a triagem de alertas nessa região.',
    })
  }
}

/** Situações de alerta e de ativo para a aba operacional. Não conta ordens de serviço. */
async function emitSituationalForecasts(db: FogoDb) {
  const controls = await getPredictiveControls(db)
  const [samples, assets, existing] = await Promise.all([
    listAlertForecastSamples(db),
    listAssets(db),
    listPredictions(db, 300),
  ])
  const pendingByKey = new Map<string, PredictionRecord>()
  for (const p of existing.filter((row) => row.reviewStatus === 'pending' && !isOsTicketPrediction(row))) {
    const key = p.inputSummary?.ruleKey as string | undefined
    if (key) pendingByKey.set(key, p)
  }

  const countable = samples.filter(
    (a) => a.state !== 'falso positivo' && a.category !== 'Preditiva' && (controls.includeSimulated || a.dataOrigin !== 'simulado'),
  )
  let rainProbability: number | null = null
  let rainStart: string | null = null
  try {
    const { resolveCityGeo } = await import('../alpha/geoConfig.js')
    const { fetchOpenMeteoForecast } = await import('../strategy/weather.js')
    const weather = await fetchOpenMeteoForecast(resolveCityGeo(db))
    rainProbability = weather.forecast?.nextHoursPrecipProb ?? null
    rainStart = weather.forecast?.rainStart ?? null
  } catch {
    rainProbability = null
    rainStart = null
  }
  const signals = buildContextualSignals(
    countable.map((alert) => ({ openedAt: alert.detectedAt, region: alert.region })),
    new Date(),
    rainProbability,
    rainStart,
  )
  for (const signal of signals) {
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: `Situação de alertas — ${signal.region}`,
      region: signal.region,
      horizonHours: 6,
      predictedValue: signal.predictedValue,
      baselineValue: signal.baselineValue,
      probability: signal.probability,
      periodStart: signal.periodStart,
      periodEnd: signal.periodEnd,
      observationCount: signal.sampleDays,
      inputSummary: {
        ruleKey: signal.ruleKey,
        kind: 'urban_context',
        source: 'alerts',
        ...signal.evidence,
      },
      explanation: signal.explanation,
      recommendation: 'Usar como apoio de plantão. Não abre alerta nem ordem de serviço automaticamente.',
    })
  }

  const lifecycle = assessAssetsLifecycle(assets, todayYmd())
  for (const item of lifecycle.filter((asset) => (asset.overdueDays ?? 0) > 0).slice(0, 8)) {
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'maintenance_due',
      targetLabel: `${item.name} — ${item.overdueDays} dia(s) de atraso na preventiva`,
      region: item.region,
      assetExternalId: item.assetId,
      horizonHours: 168,
      predictedValue: item.overdueDays ?? 0,
      probability: item.unavailabilityRisk,
      inputSummary: {
        ruleKey: `preventive_overdue:${item.assetId}`,
        overdueDays: item.overdueDays,
        unavailabilityRisk: item.unavailabilityRisk,
        accidentRisk: item.accidentRisk,
        degradation: item.degradation,
        source: 'alerts',
      },
      explanation: `Devido ao atraso na preventiva, ${item.name} pode ficar indisponível.`,
      recommendation: item.actionText,
    })
  }
  for (const item of lifecycle.filter((asset) => asset.remainingLifeDays != null && asset.remainingLifeDays <= 0).slice(0, 4)) {
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'maintenance_due',
      targetLabel: `${item.name} — vida útil vencida`,
      region: item.region,
      assetExternalId: item.assetId,
      horizonHours: 720,
      predictedValue: Math.abs(item.remainingLifeDays ?? 0),
      probability: item.unavailabilityRisk,
      inputSummary: {
        ruleKey: `useful_life_ended:${item.assetId}`,
        remainingLifeDays: item.remainingLifeDays,
        source: 'alerts',
      },
      explanation: `Devido ao fim da vida útil, ${item.name} precisa de revisão.`,
      recommendation: item.actionText,
    })
  }
}

/** Estima a quantidade de OS nas próximas 24 h em cada região, com a mesma fórmula dos alertas. */
async function emitRegionalOsForecasts(db: FogoDb) {
  const controls = await getPredictiveControls(db)
  const [incidents, existing] = await Promise.all([listIncidents(db), listPredictions(db, 400)])
  const pending = new Map<string, PredictionRecord>()
  for (const row of existing) {
    if (row.reviewStatus !== 'pending' || !isRegionalOsForecast(row)) continue
    const key = String(row.inputSummary?.ruleKey ?? '')
    if (key && !pending.has(key)) pending.set(key, row)
  }
  const countable = incidents.filter((row) => controls.includeSimulated || row.dataOrigin !== 'simulado')
  const byRegion = new Map<string, string[]>()
  for (const row of countable) {
    const region = row.region?.trim()
    if (!region || !row.openedAt) continue
    const list = byRegion.get(region) ?? []
    list.push(row.openedAt)
    byRegion.set(region, list)
  }
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 24 * 3_600_000).toISOString()
  for (const [region, times] of byRegion) {
    const forecast = buildAlertForecast(times, now)
    const hour = forecast.hours.find((item) => item.hours === 24)
    const predicted = hour?.predicted ?? null
    const observed = forecast.history.map((day) => day.observed).filter((value) => Number.isFinite(value))
    const baseline = observed.length ? observed.reduce((sum, value) => sum + value, 0) / observed.length : null
    const ruleKey = `os-region:${region}`
    const explanation =
      predicted == null
        ? `${region}: o Prevision Engine ainda não informa a quantidade. Não há um dia fechado de ordens de serviço nessa região.`
        : `${region}: o Prevision Engine estima ${predicted} ordem(ns) de serviço nas próximas 24 h, pela fórmula fogo-alert-ewma-v1 sobre as OS já abertas. A estimativa fica nesta visão.`
    const inputSummary = { ruleKey, source: 'work_orders', formula: 'fogo-alert-ewma-v1' }
    const current = pending.get(ruleKey)
    if (current) {
      const { error } = await db.supabase
        .from('predictions')
        .update({
          predicted_value: predicted,
          baseline_value: baseline,
          probability: hour?.probability ?? null,
          explanation,
          calculated_at: now.toISOString(),
          observation_count: times.length,
          period_start: now.toISOString(),
          period_end: periodEnd,
          input_summary: inputSummary,
          model_name: 'fogo-alert-ewma-v1',
          model_version: '1.0.0',
        })
        .eq('organization_id', db.orgId)
        .eq('external_id', current.id)
      if (error) throw error
      continue
    }
    await insertPrediction(db, {
      predictionType: 'demand_forecast',
      targetLabel: `OS previstas — ${region}`,
      region,
      horizonHours: 24,
      predictedValue: predicted ?? undefined,
      baselineValue: baseline ?? undefined,
      probability: hour?.probability ?? undefined,
      modelName: 'fogo-alert-ewma-v1',
      modelVersion: '1.0.0',
      inputSummary,
      explanation,
      recommendation: 'Quantidade prevista por região. A estimativa fica em Visão por Região.',
      periodStart: now.toISOString(),
      periodEnd,
      observationCount: times.length,
    })
  }
}

export async function listRegionalOsForecasts(db: FogoDb): Promise<PredictionRecord[]> {
  const rows = await listPredictions(db, 400)
  const latest = new Map<string, PredictionRecord>()
  for (const row of rows) {
    if (row.reviewStatus !== 'pending' || !isRegionalOsForecast(row)) continue
    const key = row.region || String(row.inputSummary?.ruleKey ?? row.id)
    if (!latest.has(key)) latest.set(key, row)
  }
  return [...latest.values()].sort((a, b) => (b.predictedValue ?? -1) - (a.predictedValue ?? -1))
}

async function retireOsTicketPredictions(db: FogoDb) {
  const pending = (await listPredictions(db, 300)).filter((p) => p.reviewStatus === 'pending' && retiresOsVolumePrediction(p))
  for (const p of pending) {
    await reviewPrediction(
      db,
      p.id,
      {
        status: 'expired',
        note: 'O motor deixou de estimar quantas ordens de serviço vão ocorrer. Esta previsão foi encerrada.',
      },
      'sistema',
    )
  }
}


async function listUsageEvents(db: FogoDb, sinceIso: string): Promise<UseEvent[]> {
  const { data, error } = await db.supabase
    .from('telemetry_events')
    .select('asset_external_id, event_type, occurred_at')
    .eq('organization_id', db.orgId)
    .gte('occurred_at', sinceIso)
    .limit(8000)
  if (error) throw error
  return (data ?? [])
    .filter((row) => isUsageEvent(String(row.event_type ?? '')))
    .map((row) => ({
      assetId: String(row.asset_external_id ?? ''),
      occurredAt: String(row.occurred_at ?? ''),
    }))
    .filter((row) => row.assetId.length > 0)
}

async function loadNeighborhoodAlerts(db: FogoDb): Promise<NeighborhoodAlert[]> {
  const [alerts, assets] = await Promise.all([listAlerts(db), listAssets(db)])
  const neighborhoodOf = new Map(assets.map((asset) => [asset.id, asset.location?.neighborhood?.trim() ?? '']))
  return alerts.map((alert) => ({
    detectedAt: alert.detectedAt,
    neighborhood: alert.relatedAssetId ? neighborhoodOf.get(alert.relatedAssetId) ?? '' : '',
    region: alert.region ?? '',
    state: alert.state,
    category: alert.category,
  }))
}

/** Risco por bairro, falta de agentes e tendência de uso. Não abre ordem. */
async function emitCityForecasts(db: FogoDb) {
  const now = Date.now()
  const [neighborhoodAlerts, alerts, assets, teams, incidents, existing, usage] = await Promise.all([
    loadNeighborhoodAlerts(db),
    listAlerts(db),
    listAssets(db),
    listTeams(db),
    listIncidents(db),
    listPredictions(db, 400),
    listUsageEvents(db, new Date(now - 14 * 86_400_000).toISOString()),
  ])
  const pendingByKey = new Map<string, PredictionRecord>()
  for (const row of existing.filter((item) => item.reviewStatus === 'pending')) {
    const key = row.inputSummary?.ruleKey as string | undefined
    if (key) pendingByKey.set(key, row)
  }

  for (const row of neighborhoodRisks(neighborhoodAlerts, now)) {
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: `Pico de alertas — ${row.neighborhood}`,
      region: row.region || undefined,
      horizonHours: 24,
      predictedValue: row.count24,
      baselineValue: row.baselineDaily,
      probability: Math.round(row.probability * 100) / 100,
      inputSummary: {
        ruleKey: `bairro_risk:${row.region}:${row.neighborhood}`,
        neighborhood: row.neighborhood,
        count24h: row.count24,
        baselineDaily: row.baselineDaily,
        windowDays: 7,
        source: 'alerts',
      },
      explanation: `Devido ao aumento de alertas nas últimas 24 h, ${row.neighborhood} pode ter um pico nas próximas horas. Foram ${row.count24} alertas, contra a média diária de ${row.baselineDaily}.`,
      recommendation: 'Priorizar a triagem dos alertas desse bairro.',
    })
  }

  const gaps = staffGaps({
    alerts: alerts.map((alert) => ({
      region: alert.region ?? '',
      severity: alert.severity,
      state: alert.state,
      hasOrder: Boolean(alert.incidentId),
      category: alert.category,
    })),
    orders: incidents.map((incident) => ({ region: incident.region, status: incident.status })),
    agents: teams.map((team) => ({
      region: team.region,
      status: team.status,
      functionalStatus: team.functionalStatus,
    })),
  })
  for (const row of gaps) {
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: `Faltam agentes — ${row.region}`,
      region: row.region,
      horizonHours: 24,
      predictedValue: row.gap,
      baselineValue: row.supply,
      probability: Math.min(0.95, row.gap / (row.demand + 1)),
      inputSummary: {
        ruleKey: `staff_gap:${row.region}`,
        demand: row.demand,
        supply: row.supply,
        gap: row.gap,
        source: 'teams',
      },
      explanation: `Faltam ${row.gap} agentes em ${row.region}. A fila tem ${row.demand} e há ${row.supply} disponíveis. Quem já está em campo não entra na oferta.`,
      recommendation: `Faltam ${row.gap} agentes em ${row.region} para a fila atual.`,
    })
  }

  const names = new Map(assets.map((asset) => [asset.id, asset]))
  for (const row of utilizationMoves(usage, now)) {
    const asset = names.get(row.assetId)
    const verb = row.direction === 'caiu' ? 'caiu' : 'subiu'
    await upsertLivePrediction(db, pendingByKey, {
      predictionType: 'region_risk',
      targetLabel: `${asset?.name ?? row.assetId} — uso ${verb}`,
      region: asset?.region,
      assetExternalId: row.assetId,
      horizonHours: 168,
      predictedValue: row.rate7,
      baselineValue: row.ratePrev,
      probability: Math.min(0.9, 0.45 + row.deviation / 4),
      inputSummary: {
        ruleKey: `use_trend:${row.assetId}`,
        direction: row.direction,
        rate7: row.rate7,
        ratePrev: row.ratePrev,
        source: 'telemetry',
      },
      explanation: `A média recente de ${asset?.name ?? row.assetId} é ${row.rate7} eventos por dia, contra ${row.ratePrev} na semana anterior. O uso ${verb}.`,
      recommendation:
        row.direction === 'caiu'
          ? 'Conferir se o equipamento segue em operação.'
          : 'Acompanhar o aumento de uso deste equipamento.',
    })
  }
}

async function observedCityForecast(db: FogoDb, prediction: PredictionRecord, rule: string): Promise<number> {
  const from = prediction.periodStart ? Date.parse(prediction.periodStart) : Date.parse(prediction.calculatedAt)
  const to = periodEndOf(prediction)
  if (rule.startsWith('bairro_risk:')) {
    const neighborhood = String(prediction.inputSummary?.neighborhood ?? '')
    const alerts = await loadNeighborhoodAlerts(db)
    return countNeighborhoodAlertsInWindow(alerts, neighborhood, from, to)
  }
  if (rule.startsWith('staff_gap:')) {
    const [alerts, teams, incidents] = await Promise.all([listAlerts(db), listTeams(db), listIncidents(db)])
    const gap = staffGaps({
      alerts: alerts.map((alert) => ({
        region: alert.region ?? '',
        severity: alert.severity,
        state: alert.state,
        hasOrder: Boolean(alert.incidentId),
        category: alert.category,
      })),
      orders: incidents.map((incident) => ({ region: incident.region, status: incident.status })),
      agents: teams.map((team) => ({
        region: team.region,
        status: team.status,
        functionalStatus: team.functionalStatus,
      })),
    }).find((row) => row.region === prediction.region)
    return gap?.gap ?? 0
  }
  const events = await listUsageEvents(db, new Date(from).toISOString())
  return observedUseRate(events, prediction.assetExternalId ?? '', from, to)
}

/** Avalia previsões cujo período e a janela de graça já terminaram. Não altera o valor previsto. */
async function autoReviewPredictions(db: FogoDb, alerts: AlertForecastSample[]) {
  const pending = (await listPredictions(db, 200)).filter((p) => p.reviewStatus === 'pending' && !isOsTicketPrediction(p))
  const now = Date.now()
  for (const p of pending) {
    if (!evaluationReady(p, now)) continue
    const rule = String(p.inputSummary?.ruleKey ?? '')
    if (rule.startsWith('bairro_risk:') || rule.startsWith('staff_gap:') || rule.startsWith('use_trend:')) {
      const observed = await observedCityForecast(db, p, rule)
      const status = reviewFromObserved(p.predictedValue, observed)
      await reviewPrediction(
        db,
        p.id,
        {
          status,
          observedValue: observed,
          note: `Confrontado com a conta desta previsão. Observado ${observed}. Previsto ${p.predictedValue ?? 'n/d'} preservado.`,
        },
        'sistema',
      )
      continue
    }
    if (p.predictionType === 'region_risk') {
      const observed = countObservedAlerts(alerts, p)
      const status = reviewFromObserved(p.predictedValue, observed)
      await reviewPrediction(
        db,
        p.id,
        {
          status,
          observedValue: observed,
          note: `Confrontado com alertas emitidos no período. Observado ${observed}. Previsto ${p.predictedValue ?? 'n/d'} preservado.`,
        },
        'sistema',
      )
      continue
    }
    await reviewPrediction(
      db,
      p.id,
      {
        status: 'expired',
        note: 'Horizonte e janela de graça encerrados sem par previsto×observado aplicável a este tipo.',
      },
      'sistema',
    )
  }
}

function countableAlerts(samples: AlertForecastSample[], controls: PredictiveControls) {
  return samples.filter(
    (alert) => alert.state !== 'falso positivo' && alert.category !== 'Preditiva' && (controls.includeSimulated || alert.dataOrigin !== 'simulado'),
  )
}

export async function provisionNeuralOfficial(db: FogoDb) {
  const view = await neuralViewFor(db)
  if (!view.canProvision) {
    throw new HttpError(409, 'A rede ainda não está confiável. A fila segue na fórmula.')
  }
  await patchPredictiveControls(db, { neuralOfficial: true }, db.actor?.email)
  await publishNeuralHorizons(db, view.hours)
  return { ok: true as const }
}

async function syncNeuralOfficial(db: FogoDb) {
  const view = await neuralViewFor(db)
  if (!view.canProvision) {
    await retireNeuralOfficial(db)
    await patchPredictiveControls(db, { neuralOfficial: false })
    return
  }
  await publishNeuralHorizons(db, view.hours)
}

async function neuralViewFor(db: FogoDb) {
  const controls = await getPredictiveControls(db)
  const samples = await listAlertForecastSamples(db)
  const forecast = buildAlertForecast(countableAlerts(samples, controls).map((alert) => alert.detectedAt), new Date())
  return projectNeural({
    training: forecast.trainingHistory,
    hours: forecast.hours.map((hour) => ({ id: hour.id, label: hour.label, hours: hour.hours, predicted: hour.predicted })),
    days: forecast.days.map((day) => ({ date: day.date, label: day.label, predicted: day.predicted })),
    history: forecast.history,
  })
}

async function publishNeuralHorizons(
  db: FogoDb,
  hours: { label: string; hours: number; predicted: number | null }[],
) {
  const existing = await listPredictions(db, 200)
  for (const hour of hours) {
    if (hour.predicted == null) continue
    const ruleKey = `neural-official:${hour.hours}h`
    const found = existing.find((row) => row.reviewStatus === 'pending' && row.inputSummary?.ruleKey === ruleKey)
    const explanation = `Quantidade da rede neural para ${hour.label.toLowerCase()}.`
    if (found) {
      const { error } = await db.supabase
        .from('predictions')
        .update({
          predicted_value: hour.predicted,
          explanation,
          calculated_at: new Date().toISOString(),
        })
        .eq('organization_id', db.orgId)
        .eq('external_id', found.id)
      if (error) throw error
      continue
    }
    await insertPrediction(db, {
      predictionType: 'region_risk',
      targetLabel: `Rede neural — ${hour.label}`,
      horizonHours: hour.hours,
      predictedValue: hour.predicted,
      modelName: 'fogo-neural-v1',
      inputSummary: { ruleKey, source: 'neural' },
      explanation,
      recommendation: 'Previsão oficial da rede neural para esta janela.',
    })
  }
}

async function retireNeuralOfficial(db: FogoDb) {
  const rows = await listPredictions(db, 200)
  for (const row of rows) {
    if (row.reviewStatus !== 'pending') continue
    if (!String(row.inputSummary?.ruleKey ?? '').startsWith('neural-official:')) continue
    await reviewPrediction(
      db,
      row.id,
      { status: 'expired', note: 'A rede deixou de estar confiável. A fila volta à fórmula.' },
      'sistema',
    )
  }
}

export async function computePredictiveSummary(db: FogoDb) {
  await maybeRunPredictiveRules(db)
  const [allPreds, controls, runs, samples] = await Promise.all([
    listPredictions(db, 200),
    getPredictiveControls(db),
    listPredictiveRuns(db, 8),
    listAlertForecastSamples(db),
  ])
  const preds = allPreds.filter((p) => !isOsTicketPrediction(p))
  const alertSample = countableAlerts(samples, controls)
  const insufficientHistory = alertSample.length < MIN_OBSERVATIONS
  const pending = preds.filter((p) => p.reviewStatus === 'pending')

  const anomalies = pending
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.targetLabel,
      location: p.region ?? '—',
      time: new Date(p.calculatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      severity: (p.probability ?? 0) > 0.7 ? ('alta' as const) : ('média' as const),
      explanation: p.explanation,
    }))

  const recommendations = pending.slice(0, 4).map((p) => ({
    id: p.id,
    text: p.recommendation ?? p.explanation,
    impact: (p.probability ?? 0) > 0.75 ? ('alto' as const) : ('médio' as const),
    predictionId: p.id,
  }))

  const maintenanceRisk = {
    percent: 0,
    count: 0,
    label: 'Alertas na mesa. Quantidade de OS por região em Visão por Região.',
    trend: [] as number[],
  }

  const metrics = computePredictiveMetrics(preds)
  const fmt = (n: number | null) => (n == null ? '—' : String(n))
  const rainStart = preds
    .map((p) => (typeof p.inputSummary?.rainStart === 'string' ? p.inputSummary.rainStart : null))
    .find((value): value is string => Boolean(value))
  const forecast = buildAlertForecast(
    alertSample.map((alert) => alert.detectedAt),
    new Date(),
    { rainStart: rainStart ?? null },
  )
  const upcomingDays = forecast.days
  const upcomingHours = forecast.hours
  const neuralView = projectNeural({
    training: forecast.trainingHistory,
    hours: forecast.hours.map((hour) => ({ id: hour.id, label: hour.label, hours: hour.hours, predicted: hour.predicted })),
    days: forecast.days.map((day) => ({ date: day.date, label: day.label, predicted: day.predicted })),
    history: forecast.history,
  })
  const neural = { ...neuralView, official: Boolean(controls.neuralOfficial && neuralView.canProvision) }
  const weatherReadings = await countWeatherReadings(
    db,
    alertSample.map((alert) => alert.detectedAt),
  )
  const accuracy = {
    alerts: forecast.alertsTrack,
    tickets: rollupAccuracy('tickets', 'OS / tickets', []),
    byHorizon: forecast.skills,
    hourEvolution: forecast.hourEvolution,
    todayEvolution: forecast.todayEvolution,
    history: forecast.history,
  }

  return {
    kpis: [
      {
        label: 'Observações no conjunto',
        value: String(alertSample.length),
        unit: insufficientHistory ? `< ${MIN_OBSERVATIONS}` : '',
        tone: insufficientHistory ? 'warning' : 'neutral',
      },
      { label: 'MAE', value: fmt(metrics.mae), unit: '', tone: 'neutral' as const },
      { label: 'WAPE', value: fmt(metrics.wape), unit: '', tone: 'neutral' as const },
      { label: 'Skill vs base', value: fmt(metrics.skillScore), unit: '', tone: metrics.skillScore != null && metrics.skillScore < 0 ? 'warning' : 'neutral' },
      { label: 'Previsões pendentes', value: String(pending.length), unit: '', tone: pending.length ? 'critical' : 'success' },
      {
        label: 'Aproveitamento alertas',
        value: accuracy.alerts.utilization != null ? String(Math.round(accuracy.alerts.utilization * 100)) : '—',
        unit: accuracy.alerts.scored ? `% de ${accuracy.alerts.scored}` : '',
        tone: 'neutral' as const,
      },
    ],
    maintenanceRisk,
    anomalies,
    recommendations,
    predictions: preds,
    metrics,
    horizons: [],
    upcomingDays,
    upcomingHours,
    accuracy,
    insufficientHistory,
    observationCount: alertSample.length,
    weatherReadings,
    minObservations: MIN_OBSERVATIONS,
    dataOriginSet: originLabel(controls),
    quality: { used: alertSample.length, dropped: 0, rules: ['somente alertas'] },
    controls,
    runs,
    neural,
    modelLabel: insufficientHistory
      ? `Histórico insuficiente (${alertSample.length} < ${MIN_OBSERVATIONS} alertas). ${forecast.modelNote}`
      : `${forecast.modelNote} · conjunto ${originLabel(controls)}`,
  }
}

/** Horas de previsão e do arquivo meteorológico que o motor lê para o clima. */
async function countWeatherReadings(db: FogoDb, detectedAt: string[]): Promise<number> {
  try {
    const { resolveCityGeo } = await import('../alpha/geoConfig.js')
    const { fetchOpenMeteoForecast } = await import('../strategy/weather.js')
    const { loadArchiveWeather } = await import('../alpha/weather.js')
    const geo = resolveCityGeo(db)
    const end = new Date(Date.now() - 86_400_000)
    const endDate = end.toISOString().slice(0, 10)
    const stamps = detectedAt.map((value) => Date.parse(value)).filter((value) => Number.isFinite(value))
    const oldest = stamps.length ? Math.min(...stamps) : end.getTime() - 30 * 86_400_000
    const startMs = Math.max(oldest, end.getTime() - 180 * 86_400_000)
    const startDate = new Date(startMs).toISOString().slice(0, 10)
    const [forecast, archive] = await Promise.all([
      fetchOpenMeteoForecast(geo),
      startDate <= endDate ? loadArchiveWeather(geo, startDate, endDate) : Promise.resolve({ hours: [] }),
    ])
    return (forecast.hourlyCount ?? 0) + archive.hours.length
  } catch (err) {
    console.error('[fogo] leituras meteorológicas', err instanceof Error ? err.message : err)
    return 0
  }
}

function originLabel(controls: PredictiveControls): string {
  if (controls.model?.dataOriginSet) return controls.model.dataOriginSet
  return controls.includeSimulated ? 'misto/simulado permitido' : 'real'
}
