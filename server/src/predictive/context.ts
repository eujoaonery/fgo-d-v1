import { formatWhenSpokenPtBr } from '../../../src/lib/format.js'

export const WEEKDAY_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const

export type ContextObs = {
  openedAt: string
  region: string
}

export type HourBucket = { start: number; end: number; label: string }

export const HOUR_BUCKETS: HourBucket[] = [
  { start: 0, end: 6, label: '0h–6h' },
  { start: 6, end: 12, label: '6h–12h' },
  { start: 12, end: 18, label: '12h–18h' },
  { start: 18, end: 24, label: '18h–24h' },
]

export const MIN_SAME_SLOT = 6

export function hourBucketFor(hour: number): HourBucket {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  return HOUR_BUCKETS.find((b) => h >= b.start && h < b.end) ?? HOUR_BUCKETS[0]!
}

export function localParts(iso: string) {
  const d = new Date(iso)
  return { weekday: d.getDay(), hour: d.getHours(), time: d.getTime(), day: iso.slice(0, 10) }
}

export type SlotStat = {
  count: number
  days: number
  mean: number
}

export function slotStat(rows: ContextObs[], weekday: number, bucketStart: number): SlotStat {
  const days = new Set<string>()
  let count = 0
  for (const row of rows) {
    const p = localParts(row.openedAt)
    if (p.weekday !== weekday) continue
    if (hourBucketFor(p.hour).start !== bucketStart) continue
    count += 1
    days.add(p.day)
  }
  const n = days.size
  return { count, days: n, mean: n > 0 ? count / n : 0 }
}

export type ContextualSignal = {
  ruleKey: string
  region: string
  weekday: number
  weekdayLabel: string
  bucket: HourBucket
  periodStart: string
  periodEnd: string
  historicalMean: number
  peerMean: number
  sampleDays: number
  recent72h: number
  rainProbability: number | null
  predictedValue: number
  baselineValue: number
  probability: number
  explanation: string
  evidence: Record<string, unknown>
}

/**
 * Sinais a partir de histórico observado, ocorrências recentes e clima opcional.
 * Não inventa contagens nem afirma causalidade. Exige amostra mínima no mesmo slot.
 */
export function buildContextualSignals(
  rows: ContextObs[],
  now: Date,
  rainProbability: number | null,
  rainStart: string | null = null,
): ContextualSignal[] {
  if (rows.length === 0) return []
  const weekday = now.getDay()
  const bucket = hourBucketFor(now.getHours())
  const nowMs = now.getTime()
  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))]
  const out: ContextualSignal[] = []

  for (const region of regions) {
    const hist = rows.filter((r) => r.region === region)
    const same = slotStat(hist, weekday, bucket.start)
    if (same.days < MIN_SAME_SLOT) continue

    const peerDays = new Set<string>()
    let peerCount = 0
    let recent72h = 0
    for (const row of hist) {
      const p = localParts(row.openedAt)
      if (nowMs - p.time <= 72 * 3_600_000) recent72h += 1
      if (p.weekday === weekday && hourBucketFor(p.hour).start === bucket.start) continue
      peerCount += 1
      peerDays.add(`${p.day}|${p.weekday}|${hourBucketFor(p.hour).start}`)
    }
    const peerMean = peerDays.size > 0 ? peerCount / peerDays.size : 0
    if (same.mean < 0.8) continue
    if (peerDays.size >= 4 && peerMean > 0 && same.mean < peerMean * 1.25) continue

    const predicted = Math.round(same.mean * 10) / 10
    const baseline = Math.round(peerMean * 10) / 10
    const lift = baseline > 0 ? same.mean / baseline : 1.4
    let probability = Math.min(0.88, 0.32 + lift * 0.2 + Math.min(recent72h, 6) * 0.03)
    if (rainProbability != null && Number.isFinite(rainProbability) && rainProbability >= 50) {
      probability = Math.min(0.92, probability + 0.06)
    }

    const weekdayLabel = WEEKDAY_PT[weekday] ?? 'dia'
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const rainWhen = formatWhenSpokenPtBr(rainStart)
    out.push({
      ruleKey: `context:${region}:${weekday}:${bucket.start}:${ymd}`,
      region,
      weekday,
      weekdayLabel,
      bucket,
      periodStart: now.toISOString(),
      periodEnd: new Date(nowMs + 6 * 3_600_000).toISOString(),
      historicalMean: predicted,
      peerMean: baseline,
      sampleDays: same.days,
      recent72h,
      rainProbability,
      predictedValue: predicted,
      baselineValue: baseline,
      probability: Math.round(probability * 100) / 100,
      explanation:
        rainProbability != null && rainProbability >= 50
          ? `Devido à chuva prevista${rainWhen ? ` para ${rainWhen}` : ''}, há risco de alagamento e via lenta em ${region}.`
          : `Devido ao padrão deste horário, ${region} tende a ter mais ocorrências de via.`,
      evidence: {
        weekday,
        weekdayLabel,
        hourBucket: bucket.label,
        sameSlotCount: same.count,
        sampleDays: same.days,
        peerSlots: peerDays.size,
        recent72h,
        rainProbability,
        rainStart,
        caveat: 'correlação observada, sem causalidade comprovada',
      },
    })
  }
  return out
}
