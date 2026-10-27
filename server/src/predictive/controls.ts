import type { FogoDb } from '../db.js'
import { writeAudit } from '../audit.js'
import type { DemandRates } from './demand.js'

export type PredictiveControls = {
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
  neuralOfficial?: boolean
  model?: DemandRates | null
  candidateModel?: DemandRates | null
}

export const DEFAULT_PREDICTIVE_INTERVAL_SEC = 900
const MIN_INTERVAL_SEC = 60
const MAX_INTERVAL_SEC = 24 * 3600

export function clampPredictiveIntervalSec(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PREDICTIVE_INTERVAL_SEC
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)))
}

export function parsePredictiveControls(json: unknown, operationMode?: string): PredictiveControls {
  const real = operationMode === 'real'
  const o = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
  return {
    learningEnabled: o.learningEnabled !== false,
    forecastsEnabled: o.forecastsEnabled !== false,
    evaluationEnabled: o.evaluationEnabled !== false,
    retrainEnabled: o.retrainEnabled !== false,
    includeSimulated: typeof o.includeSimulated === 'boolean' ? o.includeSimulated : !real,
    intervalSec: clampPredictiveIntervalSec(typeof o.intervalSec === 'number' ? o.intervalSec : DEFAULT_PREDICTIVE_INTERVAL_SEC),
    lastForecastAt: typeof o.lastForecastAt === 'string' ? o.lastForecastAt : undefined,
    lastEvalAt: typeof o.lastEvalAt === 'string' ? o.lastEvalAt : undefined,
    lastLearnAt: typeof o.lastLearnAt === 'string' ? o.lastLearnAt : undefined,
    lastError: typeof o.lastError === 'string' ? o.lastError : undefined,
    lastChangedBy: typeof o.lastChangedBy === 'string' ? o.lastChangedBy : undefined,
    lastChangedAt: typeof o.lastChangedAt === 'string' ? o.lastChangedAt : undefined,
    neuralOfficial: o.neuralOfficial === true,
    model: (o.model as DemandRates) ?? null,
    candidateModel: (o.candidateModel as DemandRates) ?? null,
  }
}

export async function getPredictiveControls(db: FogoDb): Promise<PredictiveControls> {
  const { data, error } = await db.supabase
    .from('system_settings')
    .select('predictive')
    .eq('organization_id', db.orgId)
    .maybeSingle()
  if (error) {
    if (/predictive/i.test(error.message)) {
      return parsePredictiveControls({}, db.tenant?.operationMode)
    }
    throw error
  }
  return parsePredictiveControls(data?.predictive, db.tenant?.operationMode)
}

export async function setPredictiveControls(db: FogoDb, next: PredictiveControls): Promise<PredictiveControls> {
  const { error } = await db.supabase.from('system_settings').upsert({
    organization_id: db.orgId,
    predictive: next as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  return next
}

export type PredictiveControlPatch = Partial<
  Pick<
    PredictiveControls,
    'learningEnabled' | 'forecastsEnabled' | 'evaluationEnabled' | 'retrainEnabled' | 'includeSimulated' | 'intervalSec'
  >
>

export async function patchPredictiveControls(
  db: FogoDb,
  patch: Partial<PredictiveControls>,
  changedBy?: string,
): Promise<PredictiveControls> {
  const prev = await getPredictiveControls(db)
  const next: PredictiveControls = {
    ...prev,
    ...patch,
    intervalSec: patch.intervalSec != null ? clampPredictiveIntervalSec(patch.intervalSec) : prev.intervalSec,
  }
  const controlKeys: (keyof PredictiveControlPatch)[] = [
    'learningEnabled',
    'forecastsEnabled',
    'evaluationEnabled',
    'retrainEnabled',
    'includeSimulated',
    'intervalSec',
  ]
  const changed = controlKeys.some((key) => patch[key] !== undefined && patch[key] !== prev[key])
  if (changed) {
    next.lastChangedBy = changedBy ?? db.actor?.email ?? 'sistema'
    next.lastChangedAt = new Date().toISOString()
    await writeAudit(db, 'predictive.controls', 'system_settings', {
      patch: controlKeys.reduce<Record<string, unknown>>((acc, key) => {
        if (patch[key] !== undefined) acc[key] = patch[key]
        return acc
      }, {}),
      by: next.lastChangedBy,
    })
  }
  return setPredictiveControls(db, next)
}

export async function insertPredictiveRun(
  db: FogoDb,
  input: {
    startedAt: string
    finishedAt: string
    status: 'ok' | 'error' | 'skipped'
    step: string
    error?: string
    summary?: Record<string, unknown>
  },
) {
  const duration = Date.parse(input.finishedAt) - Date.parse(input.startedAt)
  const { error } = await db.supabase.from('predictive_runs').insert({
    organization_id: db.orgId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    duration_ms: Number.isFinite(duration) ? duration : null,
    status: input.status,
    step: input.step,
    error: input.error ?? null,
    summary: input.summary ?? null,
  })
  if (error) console.error('[fogo] predictive_runs', error.message)
}

export async function listPredictiveRuns(db: FogoDb, limit = 12) {
  const { data, error } = await db.supabase
    .from('predictive_runs')
    .select('started_at, finished_at, duration_ms, status, step, error, summary')
    .eq('organization_id', db.orgId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => ({
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) ?? null,
    durationMs: (row.duration_ms as number) ?? null,
    status: row.status as string,
    step: row.step as string,
    error: (row.error as string) ?? null,
    summary: (row.summary as Record<string, unknown>) ?? null,
  }))
}
