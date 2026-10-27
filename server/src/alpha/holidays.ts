import type { AlphaHoliday } from '../../../src/lib/prometheusAlpha.js'

/** Computa a data da Páscoa (algoritmo de Anonymous Gregorian). */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function utcYmd(year: number, month: number, day: number): string {
  return isoDate(new Date(Date.UTC(year, month - 1, day)))
}

function shift(base: Date, days: number): string {
  const d = new Date(base.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

const NATIONAL_FIXED: { mmdd: string; name: string }[] = [
  { mmdd: '01-01', name: 'Confraternização Universal' },
  { mmdd: '04-21', name: 'Tiradentes' },
  { mmdd: '05-01', name: 'Dia do Trabalho' },
  { mmdd: '09-07', name: 'Independência do Brasil' },
  { mmdd: '10-12', name: 'Nossa Senhora Aparecida' },
  { mmdd: '11-02', name: 'Finados' },
  { mmdd: '11-15', name: 'Proclamação da República' },
  { mmdd: '11-20', name: 'Consciência Negra' },
  { mmdd: '12-25', name: 'Natal' },
]

const SP_FIXED: { mmdd: string; name: string }[] = [{ mmdd: '07-09', name: 'Revolução Constitucionalista' }]

export function holidaysInRange(opts: {
  from: string
  to: string
  uf?: string
  municipal?: string[]
}): AlphaHoliday[] {
  const fromY = Number(opts.from.slice(0, 4))
  const toY = Number(opts.to.slice(0, 4))
  const out: AlphaHoliday[] = []
  for (let year = fromY; year <= toY; year++) {
    const easter = easterSunday(year)
    const movable: AlphaHoliday[] = [
      { date: shift(easter, -48), name: 'Carnaval', scope: 'nacional' },
      { date: shift(easter, -47), name: 'Carnaval', scope: 'nacional' },
      { date: shift(easter, -2), name: 'Sexta-feira Santa', scope: 'nacional' },
      { date: isoDate(easter), name: 'Páscoa', scope: 'nacional' },
      { date: shift(easter, 60), name: 'Corpus Christi', scope: 'nacional' },
    ]
    out.push(...movable)
    for (const h of NATIONAL_FIXED) {
      out.push({ date: `${year}-${h.mmdd}`, name: h.name, scope: 'nacional' })
    }
    if ((opts.uf || 'SP').toUpperCase() === 'SP') {
      for (const h of SP_FIXED) {
        out.push({ date: `${year}-${h.mmdd}`, name: h.name, scope: 'estadual' })
      }
    }
    for (const mmdd of opts.municipal ?? []) {
      if (!/^\d{2}-\d{2}$/.test(mmdd)) continue
      out.push({ date: `${year}-${mmdd}`, name: 'Feriado municipal', scope: 'municipal' })
    }
  }
  return out
    .filter((h) => h.date >= opts.from && h.date <= opts.to)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function isHoliday(date: string, list: AlphaHoliday[]): AlphaHoliday | null {
  return list.find((h) => h.date === date) ?? null
}

export function weekdayNamePt(isoDateStr: string): string {
  const [y, m, d] = isoDateStr.split('-').map(Number)
  const wd = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][wd] ?? ''
}

export { utcYmd }
