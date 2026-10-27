const WEEKDAYS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

function weekdayFromYmd(year: number, month: number, day: number): string {
  return WEEKDAYS_PT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? ''
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Data civil pt-BR com dia da semana: `quinta-feira, 22/10/2026`. */
export function formatDatePtBr(value: string | null | undefined): string {
  if (!value) return '—'
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    const wd = weekdayFromYmd(year, month, day)
    return `${wd}, ${pad2(day)}/${pad2(month)}/${year}`
  }
  const dt = new Date(value)
  if (!Number.isFinite(dt.getTime())) return value
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
  return formatDatePtBr(`${parts.year}-${parts.month}-${parts.day}`)
}

function civilClockParts(value: string): { year: string; month: string; day: string; hour: string; minute: string } | null {
  const civil = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
  if (civil && !hasOffset) {
    return { year: civil[1], month: civil[2], day: civil[3], hour: civil[4], minute: civil[5] }
  }
  const dt = new Date(value)
  if (!Number.isFinite(dt.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(dt)
      .map((p) => [p.type, p.value]),
  )
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return null
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  }
}

/** Data falada com horário de início: `sábado, 24/10/2026, início às 14h`. */
export function formatWhenSpokenPtBr(value: string | null | undefined): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDatePtBr(value)
  const parts = civilClockParts(value)
  if (!parts) return ''
  const date = formatDatePtBr(`${parts.year}-${parts.month}-${parts.day}`)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  const time = minute === 0 ? `${hour}h` : `${hour}h${pad2(minute)}`
  return `${date}, início às ${time}`
}

/** Data e hora pt-BR com dia da semana: `quinta-feira, 22/10/2026 10:20`. */
export function formatDateTimePtBr(value: string | null | undefined): string {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDatePtBr(value)
  const civil = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
  if (civil && !hasOffset) {
    return `${formatDatePtBr(`${civil[1]}-${civil[2]}-${civil[3]}`)} ${civil[4]}:${civil[5]}`
  }
  const dt = new Date(value)
  if (!Number.isFinite(dt.getTime())) return value
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(dt)
      .map((p) => [p.type, p.value]),
  )
  return `${formatDatePtBr(`${parts.year}-${parts.month}-${parts.day}`)} ${parts.hour}:${parts.minute}`
}

/** Rótulo compacto de gráfico: `23/10, sexta`. */
export function formatChartDayPtBr(value: string | null | undefined): string {
  if (!value) return '—'
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return formatDatePtBr(value)
  const short = weekdayFromYmd(Number(m[1]), Number(m[2]), Number(m[3])).replace('-feira', '')
  return `${m[3]}/${m[2]}, ${short}`
}

/** Troca ISO `YYYY-MM-DD` (e data-hora) por pt-BR com dia da semana. */
export function withPtBrDates(text: string): string {
  return text.replace(
    /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g,
    (match) => (match.includes('T') || match.includes(' ') ? formatDateTimePtBr(match) : formatDatePtBr(match)),
  )
}

export function formatDateTime(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(value % 1 === 0 ? 0 : 1)}%`
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 1) return '<1s'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  if (m > 0) return m < 5 && s > 0 ? `${m}min ${s}s` : `${m}min`
  return `${s}s`
}
