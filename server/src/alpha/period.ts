import type { AlphaSessionContext } from '../../../src/lib/prometheusAlpha.js'
import { formatDatePtBr } from '../../../src/lib/format.js'

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
}

export type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  isoDate: string
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

/** Instante UTC correspondente a um relógio civil no fuso. */
export function fromZoned(isoDate: string, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(`${isoDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)
  const asZone = zonedParts(guess, timeZone)
  const wantedMin = hour * 60 + minute
  const gotMin = asZone.hour * 60 + asZone.minute
  return new Date(guess.getTime() + (wantedMin - gotMin) * 60_000)
}

export function addLocalDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days))
  return dt.toISOString().slice(0, 10)
}

export function clampForecastHorizon(days: number): number {
  if (!Number.isFinite(days)) return 1
  return Math.min(7, Math.max(1, Math.round(days)))
}

export type ResolvedPeriod = {
  from: Date
  to: Date
  fromDate: string
  toDate: string
  hour: number | null
  label: string
  lookbackDays: number
  forecastDays: number
}

function nextWeekday(fromDate: string, weekday: number): string {
  const [y, m, d] = fromDate.split('-').map(Number)
  const current = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  const delta = (weekday - current + 7) % 7 || 7
  return addLocalDays(fromDate, delta)
}

export function resolvePeriod(opts: {
  text?: string
  now?: Date
  timeZone: string
  context?: AlphaSessionContext
  regionHint?: string | null
  forecastDays?: number
}): { period: ResolvedPeriod; context: AlphaSessionContext; region: string | null } {
  const now = opts.now ?? new Date()
  const tz = opts.timeZone
  const today = zonedParts(now, tz)
  const text = (opts.text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const ctx: AlphaSessionContext = {
    region: opts.regionHint ?? opts.context?.region ?? null,
    date: opts.context?.date ?? today.isoDate,
    hour: opts.context?.hour ?? null,
    lastKind: opts.context?.lastKind ?? null,
    title: opts.context?.title ?? null,
  }

  const hourMatch = text.match(/\b(?:as|às)?\s*(\d{1,2})(?:h|:(\d{2}))\b/)
  if (hourMatch) {
    const h = Number(hourMatch[1])
    if (h >= 0 && h <= 23) ctx.hour = h
  }

  if (/\bamanha\b/.test(text)) {
    ctx.date = addLocalDays(today.isoDate, 1)
  } else if (/\bhoje\b/.test(text)) {
    ctx.date = today.isoDate
  } else if (/\bdepois de amanha\b/.test(text)) {
    ctx.date = addLocalDays(today.isoDate, 2)
  } else {
    for (const [name, wd] of Object.entries(WEEKDAYS)) {
      if (text.includes(name)) {
        ctx.date = nextWeekday(today.isoDate, wd)
        break
      }
    }
  }

  const isoDateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoDateMatch) ctx.date = isoDateMatch[1]

  const lookback = /\bultimos?\s+7\s+dias\b/.test(text) || /\bpassad/.test(text)
  const next7 = /\bproximos?\s+7\s+dias\b/.test(text) || /\bsemana que vem\b/.test(text)
  const forecastDays = clampForecastHorizon(opts.forecastDays ?? (next7 ? 7 : 1))

  let fromDate: string
  let toDate: string
  let label: string
  if (lookback) {
    fromDate = addLocalDays(today.isoDate, -6)
    toDate = today.isoDate
    ctx.date = today.isoDate
    label = 'últimos 7 dias'
  } else if (next7) {
    fromDate = addLocalDays(today.isoDate, 1)
    toDate = addLocalDays(today.isoDate, forecastDays)
    ctx.date = fromDate
    label = `próximos ${forecastDays} dias`
  } else {
    fromDate = ctx.date || today.isoDate
    toDate = fromDate
    const hourBit = ctx.hour != null ? ` às ${String(ctx.hour).padStart(2, '0')}h` : ''
    label = fromDate === addLocalDays(today.isoDate, 1) ? `amanhã${hourBit}` : `${formatDatePtBr(fromDate)}${hourBit}`
  }

  const from = fromZoned(fromDate, ctx.hour ?? 0, 0, tz)
  const to = fromZoned(toDate, ctx.hour ?? 23, 59, tz)
  return {
    period: {
      from,
      to,
      fromDate,
      toDate,
      hour: ctx.hour,
      label,
      lookbackDays: lookback ? 7 : 0,
      forecastDays: lookback ? 0 : forecastDays,
    },
    context: ctx,
    region: ctx.region,
  }
}

export function hourFromText(text: string): number | null {
  const m = text.toLowerCase().match(/\b(\d{1,2})(?:h|:(\d{2}))\b/)
  if (!m) return null
  const h = Number(m[1])
  return h >= 0 && h <= 23 ? h : null
}
