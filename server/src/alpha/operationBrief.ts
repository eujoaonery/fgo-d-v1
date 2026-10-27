import type { FogoDb } from '../db.js'
import type { AlphaClaim } from '../../../src/lib/prometheusAlpha.js'
import { listAlertForecastSamples } from '../repository.js'
import { getPredictiveControls } from '../predictive/controls.js'
import { MIN_OBSERVATIONS } from '../predictive/demand.js'
import { buildAlertForecast } from '../predictive/alertModel.js'
import { activeAlerts, openIncidents, scheduledOps, type AlphaContext } from './context.js'

type OsRow = {
  id: string
  type: string
  status: string
  region: string
  subjectLabel?: string
}

function tally(values: string[]): string {
  const map = new Map<string, number>()
  for (const value of values) {
    const key = value.trim() || 'sem classificação'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const parts = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  return parts.map(([key, count]) => `${count} ${key}`).join(', ') || 'nenhuma'
}

export function openWorkOrdersClaim(ctx: AlphaContext): AlphaClaim {
  const open = openIncidents(ctx) as OsRow[]
  const scheduled = scheduledOps(ctx, ctx.today).length
  const listed = open.slice(0, 8).map((row) => {
    const subject = row.subjectLabel?.trim()
    return [row.id, row.type, row.status, row.region, subject].filter(Boolean).join(' · ')
  })
  const summary = `${open.length} OS em aberto. Por status: ${tally(open.map((row) => row.status))}. Por região: ${tally(open.map((row) => row.region))}. Agendadas para hoje: ${scheduled}.`
  const body = listed.length ? `${summary} Em aberto: ${listed.join('; ')}.` : summary
  return {
    kind: 'fact',
    title: 'Ordens de serviço em aberto',
    body,
    sourceKeys: ['incidents'],
  }
}

export function activeAlertsClaim(ctx: AlphaContext): AlphaClaim {
  const alerts = activeAlerts(ctx)
  const listed = alerts.slice(0, 8).map((row) => [row.id, row.state, row.region, row.title].filter(Boolean).join(' · '))
  const summary = `${alerts.length} alerta(s) ativo(s). Por estado: ${tally(alerts.map((row) => row.state))}.`
  return {
    kind: 'fact',
    title: 'Alertas ativos',
    body: listed.length ? `${summary} Na mesa: ${listed.join('; ')}.` : summary,
    sourceKeys: ['alerts'],
  }
}

export function alertForecastSentence(input: {
  enabled: boolean
  predictedToday: number | null
  observedToday: number | null
  hours: { label: string; predicted: number | null }[]
  sampleSize: number
}): string {
  if (!input.enabled) return 'A previsão de alertas está desligada nesta cidade.'
  const today =
    input.predictedToday == null
      ? 'O Prevision Engine ainda não sustenta um número de alertas para hoje.'
      : `Para hoje o Prevision Engine prevê ${input.predictedToday} alerta(s). Já entraram ${input.observedToday ?? 0}.`
  const hours = input.hours
    .map((hour) => `${hour.label}: ${hour.predicted == null ? 'sem número' : hour.predicted}`)
    .join('; ')
  const sample =
    input.sampleSize < MIN_OBSERVATIONS ? ` Amostra curta (${input.sampleSize} alertas).` : ''
  return `${today} ${hours}.${sample}`.replace(/\s+/g, ' ').trim()
}

export async function alertForecastClaim(db: FogoDb): Promise<AlphaClaim> {
  const controls = await getPredictiveControls(db)
  if (!controls.forecastsEnabled) {
    return {
      kind: 'model',
      title: 'Previsão de alertas para hoje',
      body: alertForecastSentence({
        enabled: false,
        predictedToday: null,
        observedToday: null,
        hours: [],
        sampleSize: 0,
      }),
      sourceKeys: ['predictive-rules'],
    }
  }
  const samples = await listAlertForecastSamples(db)
  const used = samples.filter(
    (alert) =>
      alert.state !== 'falso positivo' &&
      alert.category !== 'Preditiva' &&
      (controls.includeSimulated || alert.dataOrigin !== 'simulado'),
  )
  const forecast = buildAlertForecast(
    used.map((alert) => alert.detectedAt),
    new Date(),
  )
  const today = forecast.days[0]
  return {
    kind: 'model',
    title: 'Previsão de alertas para hoje',
    body: alertForecastSentence({
      enabled: true,
      predictedToday: today?.predicted ?? null,
      observedToday: today?.observed ?? null,
      hours: forecast.hours.map((hour) => ({ label: hour.label, predicted: hour.predicted })),
      sampleSize: used.length,
    }),
    sourceKeys: ['alerts', 'predictive-rules'],
    confidenceNote: forecast.modelNote,
  }
}
