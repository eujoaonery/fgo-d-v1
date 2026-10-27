import type { FogoDb } from '../db.js'
import { listAlerts, listAssets, listIncidents } from '../repository.js'
import { computeAvailability } from '../../../src/lib/assetAvailability.js'
import { isOccurrencePending } from '../../../src/lib/occurrenceState.js'

export type ChartPeriod = '24h' | '7d' | '30d'

export type AnalyticsPeriod = ChartPeriod

export interface TimeSeriesPoint {
  label: string
  total: number
  resolved: number
}

export interface HourlyDemandPoint {
  hour: string
  hoje: number
  semana: number
  projecao: number
}

export interface AnalyticsPayload {
  period: AnalyticsPeriod
  from: string
  to: string
  incidentsTimeSeries: TimeSeriesPoint[]
  incidentsByCategory: { category: string; count: number }[]
  incidentsByRegion: { region: string; count: number }[]
  alertsBySeverity: { severity: string; count: number }[]
  hourlyDemand: HourlyDemandPoint[]
  assetAvailability: number
  assetAvailabilityEligible: number
  assetAvailabilityExcluded: number
  assetStatusDistribution: { name: string; value: number }[]
  totals: {
    incidents: number
    incidentsResolved: number
    alerts: number
    assets: number
    assetsOperational: number
    assetsAlert: number
    assetsEligible: number
    assetsExcluded: number
  }
  insights: { title: string; body: string; tone: 'neutral' | 'warning' | 'critical' }[]
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function startOfHour(d: Date) {
  const x = new Date(d)
  x.setMinutes(0, 0, 0)
  return x
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function periodBounds(period: AnalyticsPeriod, now = new Date()) {
  const to = now
  const from = new Date(now)
  if (period === '24h') from.setHours(from.getHours() - 24)
  else if (period === '7d') from.setDate(from.getDate() - 6)
  else from.setDate(from.getDate() - 29)
  return { from, to }
}

export function buildTimeAxis(
  period: AnalyticsPeriod,
  from: Date,
  to: Date,
): { key: string; label: string }[] {
  const axis: { key: string; label: string }[] = []
  if (period === '24h') {
    const cursor = startOfHour(from)
    while (cursor <= to) {
      axis.push({
        key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}T${pad(cursor.getHours())}`,
        label: `${pad(cursor.getDate())} ${pad(cursor.getHours())}h`,
      })
      cursor.setHours(cursor.getHours() + 1)
    }
    return axis
  }
  const cursor = startOfDay(from)
  const end = startOfDay(to)
  const weekday = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    const label =
      period === '7d'
        ? `${weekday[cursor.getDay()]} ${pad(cursor.getDate())}/${pad(cursor.getMonth() + 1)}`
        : `${pad(cursor.getDate())}/${pad(cursor.getMonth() + 1)}`
    axis.push({ key, label })
    cursor.setDate(cursor.getDate() + 1)
  }
  return axis
}

export function pointKey(d: Date, period: AnalyticsPeriod): string {
  if (period === '24h') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function inRange(iso: string, from: Date, to: Date) {
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

function buildHourlyDemand(
  incidents: { openedAt: string }[],
  now = new Date(),
): HourlyDemandPoint[] {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: `${pad(h)}h`,
    hoje: 0,
    semana: 0,
    projecao: 0,
  }))
  const todayStart = startOfDay(now).getTime()
  const weekStart = todayStart - 6 * 86_400_000
  for (const i of incidents) {
    const t = new Date(i.openedAt)
    if (Number.isNaN(t.getTime()) || t.getTime() < weekStart) continue
    const slot = hours[t.getHours()]
    if (!slot) continue
    slot.semana += 1
    if (t.getTime() >= todayStart) slot.hoje += 1
  }
  const todayTotal = hours.reduce((s, h) => s + h.hoje, 0)
  const weekTotal = hours.reduce((s, h) => s + h.semana, 0)
  const dailyAvg = weekTotal / 7
  const factor = dailyAvg > 0 ? Math.min(2.5, Math.max(0.6, todayTotal / Math.max(0.4, dailyAvg))) : 1
  return hours.map((h) => {
    const semana = Math.round((h.semana / 7) * 10) / 10
    return {
      hour: h.hour,
      hoje: h.hoje,
      semana,
      projecao: Math.round(semana * factor * 10) / 10,
    }
  })
}

export async function computeAnalytics(
  db: FogoDb,
  period: AnalyticsPeriod,
  regionFilter?: string,
): Promise<AnalyticsPayload> {
  const { from, to } = periodBounds(period)
  const [incidents, alerts, assets] = await Promise.all([
    listIncidents(db),
    listAlerts(db),
    listAssets(db),
  ])

  let inc = incidents.filter((i) => inRange(i.openedAt, from, to))
  let al = alerts.filter((a) => inRange(a.detectedAt, from, to))
  let ast = assets
  if (regionFilter) {
    inc = inc.filter((i) => i.region === regionFilter)
    al = al.filter((a) => a.region === regionFilter)
    ast = ast.filter((a) => a.region === regionFilter)
  }

  const axis = buildTimeAxis(period, from, to)
  const buckets = new Map(axis.map((p) => [p.key, { total: 0, resolved: 0 }]))
  for (const i of inc) {
    const key = pointKey(new Date(i.openedAt), period)
    const b = buckets.get(key)
    if (!b) continue
    b.total += 1
    if (i.status === 'resolvida') b.resolved += 1
  }

  const incidentsTimeSeries: TimeSeriesPoint[] = axis.map((p) => {
    const b = buckets.get(p.key) ?? { total: 0, resolved: 0 }
    return { label: p.label, total: b.total, resolved: b.resolved }
  })

  const catMap = new Map<string, number>()
  for (const i of inc) {
    catMap.set(i.type, (catMap.get(i.type) ?? 0) + 1)
  }
  const incidentsByCategory = [...catMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const regMap = new Map<string, number>()
  for (const i of inc) {
    regMap.set(i.region, (regMap.get(i.region) ?? 0) + 1)
  }
  const incidentsByRegion = [...regMap.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count)

  const sevMap = new Map<string, number>()
  for (const a of al) {
    sevMap.set(a.severity, (sevMap.get(a.severity) ?? 0) + 1)
  }
  const alertsBySeverity = [...sevMap.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count)

  const availability = computeAvailability(ast)
  const operational = availability.operational
  const alertCount = availability.alert
  const inativo = availability.inactive
  const totalAssets = availability.total
  const assetAvailability = availability.percent

  const resolved = inc.filter((i) => i.status === 'resolvida')
  const resolutionRate = inc.length ? Math.round((resolved.length / inc.length) * 100) : 0
  const mttrSamples = resolved
    .filter((i) => i.resolvedAt)
    .map((i) => (new Date(i.resolvedAt!).getTime() - new Date(i.openedAt).getTime()) / 60_000)
  const avgMttr =
    mttrSamples.length > 0 ? Math.round(mttrSamples.reduce((a, b) => a + b, 0) / mttrSamples.length) : null
  const openAlerts = al.filter((a) => isOccurrencePending(a.state)).length
  const weekFrom = periodBounds('7d').from
  const hourlyDemand = buildHourlyDemand(
    incidents.filter((i) => inRange(i.openedAt, weekFrom, to) && (!regionFilter || i.region === regionFilter)),
  )

  const insights: AnalyticsPayload['insights'] = []
  const topRegion = incidentsByRegion[0]
  if (topRegion && topRegion.count > 0) {
    insights.push({
      title: `${topRegion.region} concentra ocorrências`,
      body: `${topRegion.count} ocorrência(s) no período ${period} — ${Math.round((topRegion.count / Math.max(1, inc.length)) * 100)}% do volume.`,
      tone: 'warning',
    })
  }
  const topCat = incidentsByCategory[0]
  if (topCat) {
    insights.push({
      title: `${topCat.category} lidera volume`,
      body: `${topCat.count} registro(s) no período selecionado.`,
      tone: 'neutral',
    })
  }
  if (inc.length > 0) {
    insights.push({
      title: `Taxa de resolução ${resolutionRate}%`,
      body:
        avgMttr != null
          ? `${resolved.length} de ${inc.length} ocorrências encerradas · MTTR médio ${avgMttr} min.`
          : `${resolved.length} de ${inc.length} ocorrências encerradas no período.`,
      tone: resolutionRate < 50 ? 'critical' : 'neutral',
    })
  }
  if (openAlerts > 0) {
    insights.push({
      title: `${openAlerts} alerta(s) ainda abertos`,
      body: `${al.length} alerta(s) no período · ${openAlerts} sem resolução ou falso positivo.`,
      tone: openAlerts > 8 ? 'critical' : 'warning',
    })
  }
  if (alertCount > 0) {
    insights.push({
        title: 'Ativos em alerta operacional',
        body: `${alertCount} ativo(s) com status alerta entre ${availability.eligible} elegíveis (${assetAvailability}% disponíveis; ${availability.excluded} não instalado/baixado fora da conta).`,
      tone: 'critical',
    })
  }
  if (inc.length === 0 && totalAssets > 0) {
    insights.push({
      title: 'Período estável',
      body: 'Nenhuma ocorrência aberta no intervalo — indicadores refletem cadastro e alertas reais.',
      tone: 'neutral',
    })
  }

  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    incidentsTimeSeries,
    incidentsByCategory,
    incidentsByRegion,
    alertsBySeverity,
    hourlyDemand,
    assetAvailability,
    assetAvailabilityEligible: availability.eligible,
    assetAvailabilityExcluded: availability.excluded,
    assetStatusDistribution: [
      { name: 'Operacional', value: operational },
      { name: 'Alerta', value: alertCount },
      { name: 'Inativo', value: inativo },
      { name: 'Fora da conta (não instalado/baixado)', value: availability.excluded },
    ].filter((s) => s.value > 0),
    totals: {
      incidents: inc.length,
      incidentsResolved: resolved.length,
      alerts: al.length,
      assets: totalAssets,
      assetsOperational: operational,
      assetsAlert: alertCount,
      assetsEligible: availability.eligible,
      assetsExcluded: availability.excluded,
    },
    insights,
  }
}
