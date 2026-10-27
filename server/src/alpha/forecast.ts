import type { AlphaArchiveHour } from '../../../src/lib/prometheusAlpha.js'

export type DailyCount = { date: string; region: string; count: number }

export type RegionForecast = {
  region: string
  targetDate: string
  predicted: number | null
  baseline: number | null
  method: string
  weekdayMean: number | null
  sampleDays: number
  experimental: boolean
}

export type ForecastEvaluation = {
  scored: number
  mae: number | null
  rmse: number | null
  baselineMae: number | null
  skillScore: number | null
  trainDays: number
  validationDays: number
  note: string
  version: string
}

export const ALPHA_MODEL_VERSION = 'alpha-baseline-v1'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10)
}

export function aggregateDaily(rows: { date: string; region?: string }[], region?: string | null): DailyCount[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (region && row.region && row.region !== region) continue
    const key = `${row.date}|${region || row.region || 'todas'}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([key, count]) => {
      const [date, reg] = key.split('|')
      return { date, region: reg, count }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function chronologicalSplit<T extends { date: string }>(rows: T[]): { train: T[]; validation: T[] } {
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  if (dates.length < 4) return { train: rows, validation: [] }
  const cut = Math.max(1, Math.floor(dates.length * 0.7))
  const trainDates = new Set(dates.slice(0, cut))
  return {
    train: rows.filter((r) => trainDates.has(r.date)),
    validation: rows.filter((r) => !trainDates.has(r.date)),
  }
}

export function predictSameWeekday(history: DailyCount[], targetDate: string): RegionForecast {
  const region = history[0]?.region ?? 'todas'
  const wd = weekdayOf(targetDate)
  const same = history.filter((h) => weekdayOf(h.date) === wd)
  const weekdayMean = mean(same.map((h) => h.count))
  const lastWeek = history.find((h) => h.date === addDays(targetDate, -7))
  const overall = mean(history.slice(-7).map((h) => h.count))
  const predicted = weekdayMean ?? overall
  const method =
    same.length >= 3 ? 'média do mesmo dia da semana (treino)' : overall != null ? 'média móvel de 7 dias' : 'sem histórico'
  return {
    region,
    targetDate,
    predicted: predicted != null ? round2(predicted) : null,
    baseline: lastWeek ? lastWeek.count : overall != null ? round2(overall) : null,
    method,
    weekdayMean: weekdayMean != null ? round2(weekdayMean) : null,
    sampleDays: history.length,
    experimental: history.length < 14 || same.length < 3,
  }
}

export function evaluateForecast(history: DailyCount[]): ForecastEvaluation {
  const { train, validation } = chronologicalSplit(history)
  const pairs: { predicted: number; observed: number; baseline: number }[] = []
  for (const row of validation) {
    const pred = predictSameWeekday(train.filter((t) => t.region === row.region), row.date)
    if (pred.predicted == null) continue
    pairs.push({
      predicted: pred.predicted,
      observed: row.count,
      baseline: pred.baseline ?? pred.predicted,
    })
  }
  const mae = pairs.length ? round2(pairs.reduce((a, p) => a + Math.abs(p.predicted - p.observed), 0) / pairs.length) : null
  const rmse = pairs.length
    ? round2(Math.sqrt(pairs.reduce((a, p) => a + (p.predicted - p.observed) ** 2, 0) / pairs.length))
    : null
  const baselineMae = pairs.length
    ? round2(pairs.reduce((a, p) => a + Math.abs(p.baseline - p.observed), 0) / pairs.length)
    : null
  const skillScore = mae != null && baselineMae != null && baselineMae > 0 ? round2(1 - mae / baselineMae) : null
  const dates = [...new Set(history.map((h) => h.date))].sort()
  const cut = Math.max(1, Math.floor(dates.length * 0.7))
  return {
    scored: pairs.length,
    mae,
    rmse,
    baselineMae,
    skillScore,
    trainDays: cut,
    validationDays: Math.max(0, dates.length - cut),
    note: pairs.length
      ? `Avaliação cronológica 70/30 sobre ${pairs.length} dia(s). Sem embaralhamento e sem usar o futuro no treino.`
      : 'Histórico insuficiente para MAE/RMSE. A previsão, se existir, é experimental.',
    version: ALPHA_MODEL_VERSION,
  }
}

export type ClimateLink = {
  wetHours: number
  dryHours: number
  meanIncidentsWet: number | null
  meanIncidentsDry: number | null
  ratio: number | null
  sampleIncidents: number
  note: string
  experimental: boolean
}

export function correlatePrecipAndIncidents(
  incidents: { openedAt: string }[],
  archive: AlphaArchiveHour[],
  wetThresholdMm = 1,
): ClimateLink {
  const byHour = new Map<string, { precip: number; incidents: number }>()
  for (const h of archive) {
    const key = h.time.slice(0, 13)
    byHour.set(key, { precip: h.precipMm ?? 0, incidents: 0 })
  }
  let sample = 0
  for (const inc of incidents) {
    const key = inc.openedAt.slice(0, 13)
    const bucket = byHour.get(key)
    if (!bucket) continue
    bucket.incidents += 1
    sample += 1
  }
  const wet = [...byHour.values()].filter((b) => b.precip >= wetThresholdMm)
  const dry = [...byHour.values()].filter((b) => b.precip < wetThresholdMm)
  const meanWet = mean(wet.map((b) => b.incidents))
  const meanDry = mean(dry.map((b) => b.incidents))
  const experimental = wet.length < 8 || dry.length < 24 || sample < 10
  let note: string
  if (!archive.length) {
    note = 'Arquivo meteorológico indisponível — não há como cruzar chuva e ocorrências.'
  } else if (experimental) {
    note = 'Amostra pequena para afirmar relação. Resultado experimental, sem causalidade.'
  } else {
    note = `Comparação descritiva: horas com precipitação ≥ ${wetThresholdMm} mm versus horas secas. Não implica causalidade.`
  }
  return {
    wetHours: wet.length,
    dryHours: dry.length,
    meanIncidentsWet: meanWet != null ? round2(meanWet) : null,
    meanIncidentsDry: meanDry != null ? round2(meanDry) : null,
    ratio: meanWet != null && meanDry != null && meanDry > 0 ? round2(meanWet / meanDry) : null,
    sampleIncidents: sample,
    note,
    experimental,
  }
}

export function hourlyHistogram(openedAt: string[]): { hour: string; count: number }[] {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}h`, count: 0 }))
  for (const iso of openedAt) {
    const hour = Number(iso.slice(11, 13))
    if (Number.isFinite(hour) && hour >= 0 && hour < 24) buckets[hour].count += 1
  }
  return buckets
}
