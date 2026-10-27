export type MetricPrediction = {
  calculatedAt: string
  predictedValue?: number
  baselineValue?: number
  observedValue?: number
  probability?: number
  reviewStatus: string
  intervalLow?: number
  intervalHigh?: number
}

export type CalibrationBin = {
  label: string
  from: number
  to: number
  predictedMean: number | null
  observedRate: number | null
  count: number
}

export type ChronologicalSplit = {
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

export type PredictiveMetrics = {
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
  calibration: CalibrationBin[]
  chronological: ChronologicalSplit
  note: string
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function maeOf(pairs: { predicted: number; observed: number }[]): number | null {
  if (!pairs.length) return null
  const sum = pairs.reduce((acc, p) => acc + Math.abs(p.predicted - p.observed), 0)
  return round4(sum / pairs.length)
}

function rmseOf(pairs: { predicted: number; observed: number }[]): number | null {
  if (!pairs.length) return null
  const sum = pairs.reduce((acc, p) => acc + (p.predicted - p.observed) ** 2, 0)
  return round4(Math.sqrt(sum / pairs.length))
}

function wapeOf(pairs: { predicted: number; observed: number }[]): number | null {
  if (!pairs.length) return null
  const den = pairs.reduce((acc, p) => acc + Math.abs(p.observed), 0)
  if (den === 0) return null
  const num = pairs.reduce((acc, p) => acc + Math.abs(p.predicted - p.observed), 0)
  return round4(num / den)
}

function intervalCoverageOf(rows: MetricPrediction[]): number | null {
  const scored = rows.filter(
    (r) =>
      r.observedValue != null &&
      r.intervalLow != null &&
      r.intervalHigh != null &&
      Number.isFinite(r.observedValue) &&
      Number.isFinite(r.intervalLow) &&
      Number.isFinite(r.intervalHigh),
  )
  if (!scored.length) return null
  const inside = scored.filter((r) => (r.observedValue as number) >= (r.intervalLow as number) && (r.observedValue as number) <= (r.intervalHigh as number))
  return round4(inside.length / scored.length)
}

function scoredPairs(rows: MetricPrediction[]): { predicted: number; observed: number; at: string }[] {
  return rows
    .filter((r) => r.predictedValue != null && r.observedValue != null && Number.isFinite(r.predictedValue) && Number.isFinite(r.observedValue))
    .map((r) => ({ predicted: r.predictedValue as number, observed: r.observedValue as number, at: r.calculatedAt }))
}

export function chronologicalWindow(now = new Date()): Omit<ChronologicalSplit, 'trainCount' | 'validationCount' | 'scoredTrain' | 'scoredValidation'> {
  const trainDays = 21
  const validationDays = 9
  const trainFrom = new Date(now.getTime() - (trainDays + validationDays) * 86400_000)
  const splitAt = new Date(now.getTime() - validationDays * 86400_000)
  return {
    method: 'cronologico',
    description:
      'Corte cronológico 70/30: treino nas 3 semanas mais antigas da janela de 30 dias; validação nos 9 dias mais recentes. Sem embaralhamento.',
    trainFrom: trainFrom.toISOString(),
    trainTo: splitAt.toISOString(),
    validationFrom: splitAt.toISOString(),
    validationTo: now.toISOString(),
    trainShare: 0.7,
    validationShare: 0.3,
  }
}

export function calibrationBins(rows: MetricPrediction[]): CalibrationBin[] {
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]
  const bins: CalibrationBin[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i]
    const to = edges[i + 1]
    const inBin = rows.filter((r) => r.probability != null && r.probability >= from && r.probability < to)
    const decided = inBin.filter((r) => r.reviewStatus === 'confirmed' || r.reviewStatus === 'missed')
    const confirmed = decided.filter((r) => r.reviewStatus === 'confirmed').length
    const mean =
      inBin.length && inBin.every((r) => r.probability != null)
        ? round4(inBin.reduce((acc, r) => acc + (r.probability ?? 0), 0) / inBin.length)
        : null
    bins.push({
      label: `${Math.round(from * 100)}–${Math.round(Math.min(to, 1) * 100)}%`,
      from,
      to: Math.min(to, 1),
      predictedMean: mean,
      observedRate: decided.length ? round4(confirmed / decided.length) : null,
      count: inBin.length,
    })
  }
  return bins
}

export function computePredictiveMetrics(rows: MetricPrediction[], now = new Date()): PredictiveMetrics {
  const window = chronologicalWindow(now)
  const trainFrom = Date.parse(window.trainFrom)
  const splitAt = Date.parse(window.trainTo)
  const inTrain = (at: string) => {
    const t = Date.parse(at)
    return t >= trainFrom && t < splitAt
  }
  const inVal = (at: string) => {
    const t = Date.parse(at)
    return t >= splitAt
  }

  const pairs = scoredPairs(rows)
  const mae = maeOf(pairs)
  const rmse = rmseOf(pairs)
  const wape = wapeOf(pairs)
  const intervalCoverage = intervalCoverageOf(rows)
  const baselinePairs = rows
    .filter((r) => r.baselineValue != null && r.observedValue != null)
    .map((r) => ({ predicted: r.baselineValue as number, observed: r.observedValue as number }))
  const baselineMae = maeOf(baselinePairs)
  const skillScore =
    mae != null && baselineMae != null && baselineMae > 0 ? round4(1 - mae / baselineMae) : null

  const reviewed = rows.filter((r) => r.reviewStatus !== 'pending')
  const confirmed = reviewed.filter((r) => r.reviewStatus === 'confirmed').length
  const missed = reviewed.filter((r) => r.reviewStatus === 'missed').length
  const partial = reviewed.filter((r) => r.reviewStatus === 'partial').length
  const confirmationRate = reviewed.length ? round4(confirmed / reviewed.length) : null

  const scored = pairs.length
  const note = scored
    ? `MAE/RMSE/WAPE sobre ${scored} previsão(ões) com valor observado. Skill = 1 − MAE modelo / MAE linha de base. WAPE fica em branco se a soma dos observados for zero. Taxa de confirmação não é precisão percentual do modelo.`
    : 'Ainda não há pares previsto × observado. MAE, RMSE e WAPE ficam em branco até o horizonte fechar e a janela de graça terminar.'

  return {
    scored,
    pending: rows.filter((r) => r.reviewStatus === 'pending').length,
    mae,
    rmse,
    wape,
    baselineMae,
    skillScore,
    intervalCoverage,
    confirmationRate,
    accuracy: confirmationRate,
    reviewed: reviewed.length,
    confirmed,
    missed,
    partial,
    calibration: calibrationBins(rows),
    chronological: {
      ...window,
      trainCount: rows.filter((r) => inTrain(r.calculatedAt)).length,
      validationCount: rows.filter((r) => inVal(r.calculatedAt)).length,
      scoredTrain: pairs.filter((p) => inTrain(p.at)).length,
      scoredValidation: pairs.filter((p) => inVal(p.at)).length,
    },
    note,
  }
}

export function isObservedReview(status: string): boolean {
  return status === 'confirmed' || status === 'missed' || status === 'partial' || status === 'expired'
}
