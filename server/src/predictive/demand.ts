import { predictSameWeekday, type DailyCount } from '../alpha/forecast.js'
import { civilDateInSaoPaulo, civilHourInSaoPaulo } from './evaluate.js'

export const MIN_OBSERVATIONS = 50
export const MIN_SLICE_OBSERVATIONS = 20
export const MIN_HISTORY_DAYS = 14

export const DEMAND_HORIZONS = [
  { id: '24h', hours: 24, label: 'Próximas 24 horas', bucketHours: 6 },
  { id: '7d', hours: 168, label: 'Próximos 7 dias', bucketHours: 24 },
  { id: '30d', hours: 720, label: 'Próximos 30 dias', bucketHours: 24 },
] as const

export type DemandHorizonId = (typeof DEMAND_HORIZONS)[number]['id']

export type IncidentObs = {
  openedAt: string
  region?: string
  type?: string
  dataOrigin?: string
}

export type QualityReport = {
  total: number
  used: number
  droppedInvalidDate: number
  droppedUnclassified: number
  droppedOrigin: number
  rules: string[]
}

export type DemandRates = {
  version: string
  trainedAt: string
  observationCount: number
  dataOriginSet: 'real' | 'simulado' | 'misto' | 'vazio'
  lastIncidentAt: string | null
  weekdayHourRates: number[][]
  weekdayDailyMeans: number[]
  hourCounts: number[]
  quality: QualityReport
}

export type DemandSliceForecast = {
  horizonId: DemandHorizonId
  horizonHours: number
  label: string
  region?: string
  category?: string
  sliceKey: string
  periodStart: string
  periodEnd: string
  predicted: number | null
  baseline: number | null
  intervalLow: number | null
  intervalHigh: number | null
  method: string
  observationCount: number
  experimental: boolean
  insufficient: boolean
  limitations: string[]
}

export const DEMAND_MODEL_VERSION = 'fogo-demand-v2'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseOpenedAt(iso: string): Date | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return null
  return d
}

export function cleanObservations(rows: IncidentObs[], includeSimulated: boolean): {
  used: IncidentObs[]
  quality: QualityReport
} {
  const quality: QualityReport = {
    total: rows.length,
    used: 0,
    droppedInvalidDate: 0,
    droppedUnclassified: 0,
    droppedOrigin: 0,
    rules: [
      'Datas inválidas ou fora de 2000–2100 são excluídas e contabilizadas.',
      'Registros sem categoria (type vazio) são excluídos e contabilizados.',
      includeSimulated
        ? 'Ocorrências simuladas entram no conjunto quando includeSimulated=true.'
        : 'Ocorrências com dataOrigin=simulado foram excluídas deste conjunto.',
    ],
  }
  const used: IncidentObs[] = []
  for (const row of rows) {
    const origin = row.dataOrigin ?? 'real'
    if (!includeSimulated && origin === 'simulado') {
      quality.droppedOrigin += 1
      continue
    }
    if (!parseOpenedAt(row.openedAt)) {
      quality.droppedInvalidDate += 1
      continue
    }
    if (!row.type || !row.type.trim()) {
      quality.droppedUnclassified += 1
      continue
    }
    used.push(row)
  }
  quality.used = used.length
  return { used, quality }
}

export function originSetOf(rows: IncidentObs[]): DemandRates['dataOriginSet'] {
  if (!rows.length) return 'vazio'
  const origins = new Set(rows.map((r) => r.dataOrigin ?? 'real'))
  const hasSim = origins.has('simulado')
  const hasReal = [...origins].some((o) => o !== 'simulado')
  if (hasSim && hasReal) return 'misto'
  if (hasSim) return 'simulado'
  return 'real'
}

function emptyWeekdayHours(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
}

export function trainDemandRates(rows: IncidentObs[], now = new Date()): DemandRates {
  const weekdayHourCounts = emptyWeekdayHours()
  const weekdayDayKeys = Array.from({ length: 7 }, () => new Set<string>())
  const hourCounts = Array.from({ length: 24 }, () => 0)
  let lastIncidentAt: string | null = null

  for (const row of rows) {
    const d = parseOpenedAt(row.openedAt)
    if (!d || d.getTime() > now.getTime()) continue
    const slot = civilHourInSaoPaulo(d.toISOString())
    if (!slot) continue
    weekdayHourCounts[slot.weekday][slot.hour] += 1
    hourCounts[slot.hour] += 1
    weekdayDayKeys[slot.weekday].add(slot.ymd)
    if (!lastIncidentAt || row.openedAt > lastIncidentAt) lastIncidentAt = row.openedAt
  }

  const weekdayHourRates = weekdayHourCounts.map((hours, wd) => {
    const days = Math.max(1, weekdayDayKeys[wd].size)
    return hours.map((count) => count / days)
  })
  const weekdayDailyMeans = weekdayHourRates.map((hours) => hours.reduce((a, b) => a + b, 0))

  return {
    version: DEMAND_MODEL_VERSION,
    trainedAt: now.toISOString(),
    observationCount: rows.length,
    dataOriginSet: originSetOf(rows),
    lastIncidentAt,
    weekdayHourRates,
    weekdayDailyMeans,
    hourCounts,
    quality: {
      total: rows.length,
      used: rows.length,
      droppedInvalidDate: 0,
      droppedUnclassified: 0,
      droppedOrigin: 0,
      rules: ['Taxas por dia da semana e hora em America/Sao_Paulo, sem usar registros posteriores a trainedAt.'],
    },
  }
}

export function poissonInterval(lambda: number): { low: number; high: number } {
  const sd = Math.sqrt(Math.max(0, lambda))
  return {
    low: round2(Math.max(0, lambda - 1.96 * sd)),
    high: round2(lambda + 1.96 * sd),
  }
}

function addHours(iso: Date, hours: number): Date {
  return new Date(iso.getTime() + hours * 3600_000)
}

function dailyHistory(rows: IncidentObs[], region?: string): DailyCount[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (region && row.region !== region) continue
    const date = civilDateInSaoPaulo(row.openedAt)
    if (!date) continue
    map.set(date, (map.get(date) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([date, count]) => ({ date, region: region ?? 'todas', count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function countInWindow(rows: IncidentObs[], from: Date, to: Date, region?: string, category?: string): number {
  const a = from.getTime()
  const b = to.getTime()
  return rows.filter((row) => {
    const t = Date.parse(row.openedAt)
    if (!Number.isFinite(t) || t < a || t >= b) return false
    if (region && row.region !== region) return false
    if (category && row.type !== category) return false
    return true
  }).length
}

function historySpanDays(rows: IncidentObs[]): number {
  if (rows.length < 2) return rows.length ? 1 : 0
  const times = rows.map((r) => Date.parse(r.openedAt)).filter((t) => Number.isFinite(t))
  if (times.length < 2) return 1
  return Math.max(1, Math.ceil((Math.max(...times) - Math.min(...times)) / 86_400_000))
}

export function forecastHorizon(input: {
  rates: DemandRates
  rows: IncidentObs[]
  now?: Date
  hours: number
  region?: string
  category?: string
}): DemandSliceForecast {
  const now = input.now ?? new Date()
  const horizon = DEMAND_HORIZONS.find((h) => h.hours === input.hours) ?? DEMAND_HORIZONS[0]
  const periodStart = now
  const periodEnd = addHours(now, horizon.hours)
  const sliceRows = input.rows.filter((row) => {
    if (input.region && row.region !== input.region) return false
    if (input.category && row.type !== input.category) return false
    return true
  })
  const observationCount = sliceRows.length
  const cityCount = input.rows.length
  const insufficient = cityCount < MIN_OBSERVATIONS || observationCount < (input.region || input.category ? MIN_SLICE_OBSERVATIONS : MIN_OBSERVATIONS)
  const experimental = insufficient || historySpanDays(sliceRows) < MIN_HISTORY_DAYS
  const limitations: string[] = []
  if (cityCount < MIN_OBSERVATIONS) {
    limitations.push(`Histórico insuficiente (${cityCount} < ${MIN_OBSERVATIONS} ocorrências). Previsão experimental não habilitada.`)
  } else if (observationCount < MIN_SLICE_OBSERVATIONS && (input.region || input.category)) {
    limitations.push('Recorte específico com poucas observações — use a agregação da cidade.')
  }
  if (historySpanDays(sliceRows) < MIN_HISTORY_DAYS) {
    limitations.push(`Série menor que ${MIN_HISTORY_DAYS} dias.`)
  }
  if (input.rates.dataOriginSet === 'simulado') {
    limitations.push('Conjunto apenas simulado — não evidencia desempenho em operação real.')
  }

  if (insufficient) {
    return {
      horizonId: horizon.id,
      horizonHours: horizon.hours,
      label: horizon.label,
      region: input.region,
      category: input.category,
      sliceKey: `${horizon.id}:${input.region ?? 'cidade'}:${input.category ?? 'todas'}`,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      predicted: null,
      baseline: null,
      intervalLow: null,
      intervalHigh: null,
      method: 'histórico insuficiente',
      observationCount,
      experimental: true,
      insufficient: true,
      limitations,
    }
  }

  const rates = input.region || input.category ? trainDemandRates(sliceRows, now) : input.rates
  let predicted = 0
  let method: string
  if (horizon.hours === 24) {
    for (let h = 0; h < 24; h++) {
      const slot = civilHourInSaoPaulo(addHours(now, h).toISOString())
      if (!slot) continue
      predicted += rates.weekdayHourRates[slot.weekday][slot.hour] ?? 0
    }
    method = 'taxa horária × dia da semana (America/Sao_Paulo)'
  } else {
    const days = horizon.hours / 24
    const hist = dailyHistory(sliceRows, input.region)
    for (let d = 0; d < days; d++) {
      const slot = civilHourInSaoPaulo(addHours(now, d * 24).toISOString())
      if (!slot) continue
      const same = predictSameWeekday(hist, slot.ymd)
      predicted += same.predicted ?? rates.weekdayDailyMeans[slot.weekday] ?? 0
    }
    method = 'média do mesmo dia da semana (reuso alpha-baseline-v1) somada no horizonte'
  }

  const baselineFrom = addHours(now, -horizon.hours)
  const baseline = countInWindow(sliceRows, baselineFrom, now, input.region, input.category)
  const interval = poissonInterval(predicted)

  return {
    horizonId: horizon.id,
    horizonHours: horizon.hours,
    label: horizon.label,
    region: input.region,
    category: input.category,
    sliceKey: `${horizon.id}:${input.region ?? 'cidade'}:${input.category ?? 'todas'}`,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    predicted: round2(predicted),
    baseline,
    intervalLow: interval.low,
    intervalHigh: interval.high,
    method,
    observationCount,
    experimental,
    insufficient: false,
    limitations,
  }
}

export function listEligibleSlices(rows: IncidentObs[]): { region?: string; category?: string }[] {
  const slices: { region?: string; category?: string }[] = [{}]
  const byRegion = new Map<string, number>()
  const byType = new Map<string, number>()
  for (const row of rows) {
    if (row.region) byRegion.set(row.region, (byRegion.get(row.region) ?? 0) + 1)
    if (row.type) byType.set(row.type, (byType.get(row.type) ?? 0) + 1)
  }
  for (const [region, count] of byRegion) {
    if (count >= MIN_SLICE_OBSERVATIONS) slices.push({ region })
  }
  for (const [category, count] of byType) {
    if (count >= MIN_SLICE_OBSERVATIONS) slices.push({ category })
  }
  return slices
}

export function periodBucketStart(now: Date, bucketHours: number): string {
  const ms = bucketHours * 3600_000
  return new Date(Math.floor(now.getTime() / ms) * ms).toISOString()
}

export function weatherAdjustmentFactor(opts: {
  wetDryRatio: number | null
  experimental: boolean
  rainProbability: number | null
}): { factor: number; note: string } {
  if (opts.experimental || opts.wetDryRatio == null || opts.rainProbability == null) {
    return {
      factor: 1,
      note: 'Clima anexado sem ajustar a quantidade — amostra insuficiente ou fonte indisponível. Associação, não causalidade.',
    }
  }
  const rain = Math.min(1, Math.max(0, opts.rainProbability / 100))
  const tilt = Math.min(1.35, Math.max(0.75, 1 + (opts.wetDryRatio - 1) * rain * 0.35))
  return {
    factor: round2(tilt),
    note: `Ajuste descritivo pela associação chuva×ocorrências (razão ${opts.wetDryRatio}). Não implica causalidade.`,
  }
}
