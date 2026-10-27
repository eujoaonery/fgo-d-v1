import type { FogoDb } from '../db.js'
import { listAlerts, listAssets, listIncidents, listTeams } from '../repository.js'
import { listPredictions } from '../predictive/engine.js'
import { computeAvailability } from '../../../src/lib/assetAvailability.js'
import { isOsOpen, isMaintenanceOsType } from '../../../src/lib/workOrders.js'
import type { SourceMeta } from '../../../src/lib/strategy.js'
import type { AlphaCityGeo } from '../../../src/lib/prometheusAlpha.js'
import { resolveCityGeo } from './geoConfig.js'
import { holidaysInRange } from './holidays.js'
import { addLocalDays, zonedParts } from './period.js'
import { loadArchiveWeather, loadForecast } from './weather.js'
import { loadTraffic } from './traffic.js'
import { computePredictiveMetrics } from '../predictive/metrics.js'
import { ALPHA_MODEL_VERSION } from './forecast.js'
import { resolvePreventiveDue } from '../../../src/lib/assetLifecycle.js'

const ACTIVE_ALERT = new Set(['novo', 'reconhecido', 'em atendimento', 'em observação'])

export type AlphaContext = {
  generatedAt: string
  city: AlphaCityGeo
  region: string | null
  incidents: Awaited<ReturnType<typeof listIncidents>>
  alerts: Awaited<ReturnType<typeof listAlerts>>
  assets: Awaited<ReturnType<typeof listAssets>>
  teams: Awaited<ReturnType<typeof listTeams>>
  predictions: Awaited<ReturnType<typeof listPredictions>>
  weather: Awaited<ReturnType<typeof loadForecast>>
  archive: Awaited<ReturnType<typeof loadArchiveWeather>>
  traffic: Awaited<ReturnType<typeof loadTraffic>>
  holidays: ReturnType<typeof holidaysInRange>
  availability: ReturnType<typeof computeAvailability>
  metrics: ReturnType<typeof computePredictiveMetrics>
  today: string
  sources: SourceMeta[]
}

function fogoSource(key: string, label: string, count: number, lastUpdatedAt: string | null, emptyNote: string): SourceMeta {
  return {
    key,
    label,
    status: count ? 'ok' : 'empty',
    origin: 'FOGO (registros da cidade)',
    lastUpdatedAt,
    note: count ? `${count} registro(s).` : emptyNote,
  }
}

export async function buildAlphaContext(db: FogoDb, opts: { region?: string | null; forecastDays?: number } = {}): Promise<AlphaContext> {
  const city = resolveCityGeo(db)
  const today = zonedParts(new Date(), city.timezone).isoDate
  const region = opts.region?.trim() || null
  const [incidents, alerts, assets, teams, predictions, weather, traffic] = await Promise.all([
    listIncidents(db),
    listAlerts(db),
    listAssets(db),
    listTeams(db),
    listPredictions(db, 80),
    loadForecast(city, opts.forecastDays ?? 7),
    loadTraffic(city),
  ])
  const archive = await loadArchiveWeather(city, addLocalDays(today, -30), today)
  const inRegion = <T extends { region?: string }>(rows: T[]) =>
    region ? rows.filter((r) => r.region === region) : rows
  const incR = inRegion(incidents)
  const alertR = inRegion(alerts)
  const assetR = inRegion(assets)
  const teamR = inRegion(teams)
  const holidays = holidaysInRange({
    from: today,
    to: addLocalDays(today, 8),
    uf: city.uf,
    municipal: city.municipalHolidays,
  })
  const lastIncident = incR.map((i) => i.openedAt).sort().at(-1) ?? null
  const lastAlert = alertR.map((a) => a.detectedAt).sort().at(-1) ?? null
  const sources: SourceMeta[] = [
    fogoSource('incidents', 'Ordens de serviço', incR.length, lastIncident, 'Nenhuma OS nesta seleção.'),
    fogoSource(
      'alerts',
      'Alertas',
      alertR.filter((a) => ACTIVE_ALERT.has(a.state)).length,
      lastAlert,
      'Nenhum alerta ativo nesta seleção.',
    ),
    fogoSource('assets', 'Ativos', assetR.length, null, 'Nenhum ativo nesta seleção.'),
    fogoSource('teams', 'Agentes', teamR.length, null, 'Nenhum agente nesta seleção.'),
    weather.source,
    archive.source,
    traffic.source,
    {
      key: 'calendar',
      label: 'Calendário (feriados)',
      status: 'ok',
      origin: 'Calendário civil BR/SP + feriados municipais configurados',
      lastUpdatedAt: today,
      note: holidays.length ? `${holidays.length} feriado(s) até 8 dias.` : 'Nenhum feriado no horizonte de 8 dias.',
    },
    {
      key: 'predictive-rules',
      label: 'Modelo preditivo FOGO',
      status: predictions.length ? 'ok' : 'empty',
      origin: ALPHA_MODEL_VERSION,
      lastUpdatedAt: predictions[0]?.calculatedAt ?? null,
      note: predictions.length
        ? `${predictions.length} previsão(ões) de regras. Métricas só com pares observado×previsto.`
        : 'Ainda não há previsões de regras nesta cidade.',
    },
  ]
  return {
    generatedAt: new Date().toISOString(),
    city,
    region,
    incidents: incR,
    alerts: alertR,
    assets: assetR,
    teams: teamR,
    predictions,
    weather,
    archive,
    traffic,
    holidays,
    availability: computeAvailability(assetR),
    metrics: computePredictiveMetrics(predictions),
    today,
    sources,
  }
}

export function openIncidents(ctx: AlphaContext) {
  return ctx.incidents.filter((i) => isOsOpen(i.status))
}

export function activeAlerts(ctx: AlphaContext) {
  return ctx.alerts.filter((a) => ACTIVE_ALERT.has(a.state))
}

export function maintenanceDue(ctx: AlphaContext, untilDate: string) {
  return ctx.assets.filter((a) => {
    const due = resolvePreventiveDue(a)
    return due != null && due <= untilDate
  })
}

export function scheduledOps(ctx: AlphaContext, date: string) {
  return ctx.incidents.filter((i) => {
    const start = i.scheduledStart?.slice(0, 10)
    return start === date && isOsOpen(i.status)
  })
}

export function maintenanceOpen(ctx: AlphaContext) {
  return ctx.incidents.filter((i) => isMaintenanceOsType(i.type) && isOsOpen(i.status))
}
