import type { AccuracyLevel, AccuracyPair, AccuracyTrack } from './evaluate.js'

/** Suavização do nível diário. O dia mais recente pesa mais; os anteriores continuam no nível. */
const LEVEL_ALPHA = 0.45
/** Dias do mesmo weekday necessários para ele se afastar do nível geral. */
const WEEKDAY_PRIOR = 4
const HOUR_HORIZONS = [1, 3, 8, 12, 24] as const
const DAY_LEADS = [0, 1, 2, 3, 4, 5, 6] as const
const MAX_HOUR_WINDOWS = 96

const WEEKDAY_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const civilFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' })

export type HorizonSkill = {
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

export type AlertDayForecast = {
  date: string
  weekday: string
  label: string
  predicted: number | null
  observed: number | null
  inProgress: boolean
  level: AccuracyLevel
  skill: HorizonSkill
}

export type AlertHourForecast = {
  id: `${(typeof HOUR_HORIZONS)[number]}h`
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
  skill: HorizonSkill
}

export type HitPoint = { label: string; acerto: number }

export type ForecastHistoryWindow = {
  id: string
  label: string
  fromLabel: string
  toLabel: string
  predicted: number
  observed: number
  level: AccuracyLevel
}

export type ForecastHistoryDay = {
  date: string
  dateLabel: string
  whenLabel: string
  predicted: number
  observed: number
  level: AccuracyLevel
  windows: ForecastHistoryWindow[]
}

export type BuiltAlertForecast = {
  days: AlertDayForecast[]
  hours: AlertHourForecast[]
  skills: HorizonSkill[]
  alertsTrack: AccuracyTrack
  hourEvolution: HitPoint[]
  todayEvolution: HitPoint[]
  history: ForecastHistoryDay[]
  /** Dias fechados usados só pelo ajuste em beta. A mesa continua lendo `history`. */
  trainingHistory: ForecastHistoryDay[]
  completeDays: number
  modelNote: string
}

type DayBucket = { ymd: string; weekday: number; hours: number[]; total: number }

const HOUR_CONFIDENCE: Record<number, number> = { 1: 0.32, 3: 0.45, 8: 0.58, 12: 0.68, 24: 0.78 }

export function buildAlertForecast(timestamps: string[], now = new Date(), opts?: { rainStart?: string | null }): BuiltAlertForecast {
  const times = timestamps.map((iso) => Date.parse(iso)).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b)
  const nowMs = now.getTime()
  const today = civilDate(nowMs)
  const days = bucketDays(times)
  const complete = days.filter((day) => day.ymd < today)
  const issued = forecastIssued(complete, days, today, nowMs)
  const scoredSkills = scoreHorizons(times, days, nowMs)
  const dayPairs = scoredSkills.find((skill) => skill.id === 'd0')?.pairs ?? []
  const skills = scoredSkills.map((skill) => {
    const { pairs: _pairs, ...rest } = skill
    return rest
  })
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const empty = emptySkill
  const rainMs = opts?.rainStart ? Date.parse(opts.rainStart) : Number.NaN

  const upcomingDays: AlertDayForecast[] = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset)
    const weekday = WEEKDAY_PT[weekdayIndex(date)] ?? 'dia'
    const row = issued.days[offset]
    const observed = offset === 0 ? countBetween(times, dayStartMs(today), nowMs) : null
    return {
      date,
      weekday,
      label: offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : weekday,
      predicted: row?.predicted ?? null,
      observed,
      inProgress: offset === 0,
      level: 'pending',
      skill: skillById.get(`d${offset}`) ?? empty(`d${offset}`, offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : `Em ${offset} dias`),
    }
  })

  const hours: AlertHourForecast[] = HOUR_HORIZONS.map((span) => {
    const end = nowMs + span * 3_600_000
    let predicted = expectedBetween(issued.profile, issued.level, issued.scale, nowMs, end)
    if (Number.isFinite(rainMs) && rainMs >= nowMs && rainMs < end) predicted *= 1.2
    const rounded = issued.completeDays === 0 && issued.level <= 0 ? null : roundCount(predicted)
    const probability = rounded == null ? null : Math.round((1 - Math.exp(-Math.max(0, predicted))) * 100) / 100
    const confidence = Math.round(Math.min(1, issued.completeDays / 14) * (HOUR_CONFIDENCE[span] ?? 0.4) * 100) / 100
    return {
      id: `${span}h`,
      hours: span,
      label: span === 1 ? 'Próxima 1 hora' : `Próximas ${span} horas`,
      fromLabel: hourSpoken(nowMs),
      toLabel: hourSpoken(end),
      periodStart: new Date(nowMs).toISOString(),
      periodEnd: new Date(end).toISOString(),
      predicted: rounded,
      probability,
      probabilityLabel: chanceLabel(probability),
      confidence,
      confidenceLabel: chanceLabel(confidence),
      sampleDays: issued.completeDays,
      skill: skillById.get(`h${span}`) ?? empty(`h${span}`, span === 1 ? '1 hora' : `${span} horas`),
    }
  })

  const alertsTrack = trackFromPairs('Alertas — dias fechados, fora do treino', dayPairs)
  alertsTrack.pairs = dayPairs.slice(-14)
  const hourPairs = scoredSkills.find((skill) => skill.id === 'h1')?.pairs ?? []
  return {
    days: upcomingDays,
    hours,
    skills,
    alertsTrack,
    hourEvolution: cumulativeHits(hourPairs.slice(-24).map((row) => ({ label: hourPointLabel(row.id, row.date), level: row.level }))),
    todayEvolution: todayEvolution(times, issued, today, nowMs),
    history: forecastHistory(times, days, today, HISTORY_DAYS),
    trainingHistory: forecastHistory(times, days, today, TRAINING_DAYS),
    completeDays: issued.completeDays,
    modelNote:
      issued.completeDays < 7
        ? `fogo-alert-ewma-v1 · ${issued.completeDays} dia(s) fechado(s) · weekday ainda puxado para o nível recente`
        : `fogo-alert-ewma-v1 · ${issued.completeDays} dias fechados · nível recente e perfil horário`,
  }
}

function cumulativeHits(rows: { label: string; level: AccuracyLevel }[]): HitPoint[] {
  let hits = 0
  return rows.map((row, index) => {
    if (row.level === 'exact' || row.level === 'useful') hits += 1
    return { label: row.label, acerto: Math.round((hits / (index + 1)) * 100) }
  })
}

function hourPointLabel(id: string, date: string): string {
  const start = Number(id.split(':')[1])
  if (!Number.isFinite(start)) return date.slice(5)
  const parts = civilParts(start)
  return `${parts.ymd.slice(8)} ${String(parts.hour).padStart(2, '0')}h`
}

/** Horas de hoje contra o esperado dos dias fechados, sem ajustar pelo que já entrou hoje. */
function todayEvolution(times: number[], issued: Issued, today: string, nowMs: number): HitPoint[] {
  if (issued.completeDays === 0) return []
  const start = dayStartMs(today)
  const hourNow = civilParts(nowMs).hour
  const rows: { label: string; level: AccuracyLevel }[] = []
  for (let hour = 0; hour <= hourNow; hour++) {
    const end = hour < hourNow ? start + (hour + 1) * 3_600_000 : nowMs
    if (end <= start) continue
    const predicted = roundCount(expectedBetween(issued.profile, issued.level, 1, start, end))
    const observed = countBetween(times, start, end)
    if (predicted === 0 && observed === 0) continue
    rows.push({ label: `${String(hour).padStart(2, '0')}h`, level: closedLevel(predicted, observed) })
  }
  return cumulativeHits(rows)
}

const HISTORY_DAYS = 30
const TRAINING_DAYS = 120

/** Um retrato por dia fechado: o que a mesa colocaria à 0h e o que entrou depois. */
function forecastHistory(times: number[], days: DayBucket[], today: string, limit: number): ForecastHistoryDay[] {
  const yesterday = addDays(today, -1)
  const rows: ForecastHistoryDay[] = []
  for (const target of days) {
    if (target.ymd >= today) continue
    const train = days.filter((day) => day.ymd < target.ymd)
    if (train.length === 0) continue
    const level = ewma(train.map((day) => day.total))
    const profile = hourProfile(train)
    const predicted = roundCount(predictTotal(train, target.weekday, level))
    const start = dayStartMs(target.ymd)
    const windows = HOUR_HORIZONS.map((span) => {
      const end = start + span * 3_600_000
      const windowPredicted = roundCount(expectedBetween(profile, level, 1, start, end))
      const observed = countBetween(times, start, end)
      return {
        id: `${span}h`,
        label: span === 1 ? 'Próxima 1 hora' : `Próximas ${span} horas`,
        fromLabel: hourSpoken(start),
        toLabel: hourSpoken(end),
        predicted: windowPredicted,
        observed,
        level: closedLevel(windowPredicted, observed),
      }
    })
    const weekday = WEEKDAY_PT[target.weekday] ?? 'dia'
    rows.push({
      date: target.ymd,
      dateLabel: brDate(target.ymd),
      whenLabel: target.ymd === yesterday ? 'Ontem' : weekday.charAt(0).toUpperCase() + weekday.slice(1),
      predicted,
      observed: target.total,
      level: closedLevel(predicted, target.total),
      windows,
    })
  }
  return rows.slice(-limit).reverse()
}

function brDate(ymd: string): string {
  const [year, month, day] = ymd.split('-')
  return `${day}/${month}/${year}`
}

function emptySkill(id: string, label: string): HorizonSkill {
  return { id, label, scored: 0, exact: 0, useful: 0, off: 0, miss: 0, utilization: null, mae: null }
}

type Issued = {
  completeDays: number
  level: number
  scale: number
  profile: number[]
  days: Array<{ predicted: number | null }>
}

function forecastIssued(complete: DayBucket[], all: DayBucket[], today: string, nowMs: number): Issued {
  const todayBucket = all.find((day) => day.ymd === today)
  const observed = todayBucket?.total ?? 0
  let level = ewma(complete.map((day) => day.total))
  let profile = hourProfile(complete)
  if (complete.length === 0 && observed > 0) {
    const hoursElapsed = Math.max(0.5, (nowMs - dayStartMs(today)) / 3_600_000)
    level = (observed / hoursElapsed) * 24
    profile = partialProfile(todayBucket, civilParts(nowMs).hour)
  }
  const elapsed = shareUntil(profile, nowMs)
  const fullToday = predictTotal(complete, weekdayIndex(today), level)
  const expectedSoFar = fullToday * elapsed
  const scale = elapsed >= 0.12 && expectedSoFar >= 1 ? clamp(observed / expectedSoFar, 0.55, 1.8) : 1
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset)
    const base = predictTotal(complete, weekdayIndex(date), level)
    if (complete.length === 0 && observed === 0) return { predicted: null }
    if (offset === 0) {
      const remaining = Math.max(0, 1 - elapsed)
      return { predicted: roundCount(observed + fullToday * scale * remaining) }
    }
    const blend = Math.exp(-offset / 2.5)
    return { predicted: roundCount(base * (1 + (scale - 1) * blend)) }
  })
  return { completeDays: complete.length, level, scale, profile, days }
}

/** Total do dia usando só dias já fechados. Weekday sem amostra herda o nível. */
function predictTotal(train: DayBucket[], weekday: number, level: number): number {
  if (train.length === 0) return level
  const learned = ewma(train.map((day) => day.total))
  const same = train.filter((day) => day.weekday === weekday)
  const sameMean = same.length ? same.reduce((sum, day) => sum + day.total, 0) / same.length : learned
  return (same.length * sameMean + WEEKDAY_PRIOR * learned) / (same.length + WEEKDAY_PRIOR)
}

function partialProfile(day: DayBucket | undefined, currentHour: number): number[] {
  const totals = Array.from({ length: 24 }, () => 0)
  if (!day || currentHour <= 0) return totals.map(() => 1 / 24)
  let seen = 0
  for (let hour = 0; hour < currentHour; hour++) {
    totals[hour] = day.hours[hour] ?? 0
    seen += totals[hour] ?? 0
  }
  const fill = seen / currentHour
  for (let hour = currentHour; hour < 24; hour++) totals[hour] = fill
  const sum = totals.reduce((a, b) => a + b, 0)
  if (sum <= 0) return totals.map(() => 1 / 24)
  return totals.map((count) => count / sum)
}

function hourProfile(complete: DayBucket[]): number[] {
  const totals = Array.from({ length: 24 }, () => 0)
  if (complete.length === 0) return totals.map(() => 1 / 24)
  for (const day of complete) {
    for (let hour = 0; hour < 24; hour++) totals[hour] += day.hours[hour] ?? 0
  }
  const sum = totals.reduce((a, b) => a + b, 0)
  if (sum <= 0) return totals.map(() => 1 / 24)
  return totals.map((count) => count / sum)
}

function expectedBetween(profile: number[], level: number, scale: number, startMs: number, endMs: number): number {
  if (endMs <= startMs || level <= 0) return 0
  let total = 0
  let cursor = startMs
  while (cursor < endMs) {
    const next = nextHourMs(cursor)
    const sliceEnd = Math.min(endMs, next)
    const slot = civilParts(cursor)
    const frac = (sliceEnd - cursor) / 3_600_000
    total += level * scale * (profile[slot.hour] ?? 0) * frac
    if (sliceEnd <= cursor) break
    cursor = sliceEnd
  }
  return total
}

function scaleAt(train: DayBucket[], profile: number[], level: number, startMs: number, times: number[]): number {
  const ymd = civilDate(startMs)
  const elapsed = expectedBetween(profile, 1, 1, dayStartMs(ymd), startMs)
  const observed = countBetween(times, dayStartMs(ymd), startMs)
  const expectedSoFar = predictTotal(train, weekdayIndex(ymd), level) * elapsed
  if (elapsed < 0.12 || expectedSoFar < 1) return 1
  return clamp(observed / expectedSoFar, 0.55, 1.8)
}

function shareUntil(profile: number[], nowMs: number): number {
  const start = dayStartMs(civilDate(nowMs))
  return expectedBetween(profile, 1, 1, start, nowMs)
}

function scoreHorizons(times: number[], days: DayBucket[], nowMs: number): HorizonSkill[] {
  const today = civilDate(nowMs)
  const hourSkills = HOUR_HORIZONS.map((span) => {
    const pairs: AccuracyPair[] = []
    for (const start of hourStarts(times, nowMs, span)) {
      const startDay = civilDate(start)
      const train = days.filter((day) => day.ymd < startDay)
      if (train.length === 0) continue
      const level = ewma(train.map((day) => day.total))
      const profile = hourProfile(train)
      const scale = scaleAt(train, profile, level, start, times)
      const predictedRaw = expectedBetween(profile, level, scale, start, start + span * 3_600_000)
      const predicted = roundCount(predictedRaw)
      const observed = countBetween(times, start, start + span * 3_600_000)
      pairs.push(pair(`h${span}:${start}`, civilDate(start), span === 1 ? '1 hora' : `${span} horas`, predicted, observed))
    }
    return skillFrom(`h${span}`, span === 1 ? '1 hora' : `${span} horas`, pairs.slice(-MAX_HOUR_WINDOWS))
  })

  const daySkills = DAY_LEADS.map((lead) => {
    const pairs: AccuracyPair[] = []
    for (const target of days) {
      if (target.ymd >= today) continue
      const origin = addDays(target.ymd, -lead)
      const train = days.filter((day) => day.ymd < origin)
      if (train.length === 0) continue
      const level = ewma(train.map((day) => day.total))
      const predicted = roundCount(predictTotal(train, target.weekday, level))
      pairs.push(pair(`d${lead}:${target.ymd}`, target.ymd, lead === 0 ? 'Hoje' : lead === 1 ? 'Amanhã' : `Em ${lead} dias`, predicted, target.total))
    }
    const label = lead === 0 ? 'Hoje' : lead === 1 ? 'Amanhã' : `Em ${lead} dias`
    return skillFrom(`d${lead}`, label, pairs)
  })

  return [...hourSkills, ...daySkills]
}

function pair(id: string, date: string, label: string, predicted: number, observed: number): AccuracyPair {
  return {
    id,
    date,
    label,
    predicted,
    observed,
    level: closedLevel(predicted, observed),
    inProgress: false,
  }
}

/** Mesma régua de accuracyLevel, só para janela já fechada. */
export function closedLevel(predicted: number, observed: number): AccuracyLevel {
  if (!Number.isFinite(predicted) || !Number.isFinite(observed)) return 'pending'
  if (predicted > 0 && observed === 0) return 'miss'
  if (predicted <= 0 && observed === 0) return 'exact'
  const err = Math.abs(observed - predicted)
  if (err <= Math.max(1, predicted * 0.1) || Math.round(observed) === Math.round(predicted)) return 'exact'
  if (observed >= predicted * 0.5 && observed <= predicted * 1.5) return 'useful'
  return observed > 0 ? 'off' : 'miss'
}

function skillFrom(id: string, label: string, pairs: AccuracyPair[]): HorizonSkill & { pairs: AccuracyPair[] } {
  const decided = pairs.filter((row) => row.level !== 'pending')
  const exact = decided.filter((row) => row.level === 'exact').length
  const useful = decided.filter((row) => row.level === 'useful').length
  const off = decided.filter((row) => row.level === 'off').length
  const miss = decided.filter((row) => row.level === 'miss').length
  const scored = decided.length
  const mae = scored ? decided.reduce((sum, row) => sum + Math.abs((row.observed ?? 0) - row.predicted), 0) / scored : null
  return {
    id,
    label,
    scored,
    exact,
    useful,
    off,
    miss,
    utilization: scored ? Math.round(((exact + useful) / scored) * 10000) / 10000 : null,
    mae: mae == null ? null : Math.round(mae * 10) / 10,
    pairs,
  }
}

function trackFromPairs(label: string, pairs: AccuracyPair[]): AccuracyTrack {
  const skill = skillFrom('alerts', label, pairs)
  return {
    id: 'alerts',
    label,
    scored: skill.scored,
    exact: skill.exact,
    useful: skill.useful,
    off: skill.off,
    miss: skill.miss,
    inProgress: 0,
    utilization: skill.utilization,
    exactRate: skill.scored ? Math.round((skill.exact / skill.scored) * 10000) / 10000 : null,
    pairs,
  }
}

function ewma(values: number[]): number {
  if (values.length === 0) return 0
  let level = values[0] ?? 0
  for (let i = 1; i < values.length; i++) level = LEVEL_ALPHA * (values[i] ?? 0) + (1 - LEVEL_ALPHA) * level
  return level
}

function bucketDays(times: number[]): DayBucket[] {
  const map = new Map<string, DayBucket>()
  for (const ms of times) {
    const slot = civilParts(ms)
    let day = map.get(slot.ymd)
    if (!day) {
      day = { ymd: slot.ymd, weekday: weekdayIndex(slot.ymd), hours: Array.from({ length: 24 }, () => 0), total: 0 }
      map.set(slot.ymd, day)
    }
    day.hours[slot.hour] = (day.hours[slot.hour] ?? 0) + 1
    day.total += 1
  }
  return [...map.values()].sort((a, b) => a.ymd.localeCompare(b.ymd))
}

function hourStarts(times: number[], nowMs: number, horizonHours: number): number[] {
  if (times.length === 0) return []
  const last = nowMs - horizonHours * 3_600_000
  const starts: number[] = []
  let cursor = nextHourMs(times[0] ?? nowMs)
  while (cursor <= last && starts.length < 4000) {
    starts.push(cursor)
    cursor += 3_600_000
  }
  return starts.slice(-MAX_HOUR_WINDOWS)
}

function countBetween(times: number[], start: number, end: number): number {
  return upperBound(times, end) - lowerBound(times, start)
}

function lowerBound(times: number[], target: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((times[mid] ?? 0) < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function upperBound(times: number[], target: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((times[mid] ?? 0) < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function roundCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n >= 10) return Math.round(n)
  return Math.round(n * 10) / 10
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function chanceLabel(value: number | null): 'baixa' | 'média' | 'alta' {
  if (value == null) return 'baixa'
  if (value >= 0.6) return 'alta'
  if (value >= 0.3) return 'média'
  return 'baixa'
}

function civilDate(ms: number): string {
  return civilParts(ms).ymd
}

function civilParts(ms: number): { ymd: string; hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(civilFormat.formatToParts(new Date(ms)).map((part) => [part.type, part.value]))
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? 0) % 24,
    minute: Number(parts.minute ?? 0),
    second: Number(parts.second ?? 0),
  }
}

function weekdayIndex(ymd: string): number {
  const name = weekdayFormat.format(new Date(`${ymd}T12:00:00-03:00`))
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[name] ?? 0
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days))
  return next.toISOString().slice(0, 10)
}

function dayStartMs(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00-03:00`)
}

function nextHourMs(ms: number): number {
  const slot = civilParts(ms)
  const elapsed = slot.minute * 60 + slot.second
  return ms + (elapsed === 0 ? 3_600 : 3_600 - elapsed) * 1000
}

function hourSpoken(ms: number): string {
  const slot = civilParts(ms)
  return slot.minute === 0 ? `${slot.hour}h` : `${slot.hour}h${String(slot.minute).padStart(2, '0')}`
}
