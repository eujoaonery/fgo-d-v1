import type { ChartPeriod, Incident, OperationalAlert, UrbanAsset } from '@/types'
import { isOpenAlert } from '@/lib/mapAlerts'
import { plottableAssetPoint } from '@/lib/mariliaAddresses'

export type HeatVariable = 'alertas' | 'os' | 'risco'
export type HeatPoint = { lat: number; lng: number; weight: number; id: string }

const SEV_W: Record<string, number> = {
  crítica: 1,
  alta: 0.8,
  média: 0.55,
  baixa: 0.35,
  informativa: 0.2,
}

const PRI_W: Record<string, number> = {
  crítica: 1,
  alta: 0.8,
  média: 0.5,
  baixa: 0.3,
}

export const HEAT_VARIABLE_LABEL: Record<HeatVariable, string> = {
  alertas: 'Alertas abertos',
  os: 'Ordens de serviço',
  risco: 'Ativos em alerta',
}

export const HEAT_PERIOD_LABEL: Record<ChartPeriod, string> = {
  '24h': 'últimas 24 h',
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
}

export function periodStart(period: ChartPeriod, now = Date.now()): number {
  const hours = period === '24h' ? 24 : period === '7d' ? 24 * 7 : 24 * 30
  return now - hours * 3600_000
}

function locOfAsset(
  asset: UrbanAsset | undefined,
  bounds?: { south: number; north: number; west: number; east: number },
): { lat: number; lng: number } | null {
  if (!asset) return null
  return plottableAssetPoint(asset, bounds)
}

export function buildHeatPoints(opts: {
  variable: HeatVariable
  period: ChartPeriod
  assets: UrbanAsset[]
  alerts: OperationalAlert[]
  incidents: Incident[]
  now?: number
  bounds?: { south: number; north: number; west: number; east: number }
}): HeatPoint[] {
  const from = periodStart(opts.period, opts.now)
  const byId = new Map(opts.assets.map((a) => [a.id, a]))
  const bounds = opts.bounds

  if (opts.variable === 'alertas') {
    return opts.alerts
      .filter((a) => isOpenAlert(a) && Date.parse(a.detectedAt) >= from)
      .map((a) => {
        const loc = locOfAsset(byId.get(a.relatedAssetId ?? ''), bounds)
        if (!loc) return null
        return { ...loc, weight: SEV_W[a.severity] ?? 0.4, id: a.id }
      })
      .filter((p): p is HeatPoint => p != null)
  }

  if (opts.variable === 'os') {
    return opts.incidents
      .filter((i) => Date.parse(i.openedAt) >= from)
      .map((i) => {
        const loc = locOfAsset(byId.get(i.relatedAssetId ?? ''), bounds)
        if (!loc) return null
        return { ...loc, weight: PRI_W[i.priority] ?? 0.4, id: i.id }
      })
      .filter((p): p is HeatPoint => p != null)
  }

  return opts.assets
    .filter((a) => a.status === 'alerta')
    .map((a) => {
      const loc = locOfAsset(a, bounds)
      if (!loc) return null
      return { ...loc, weight: 0.7, id: a.id }
    })
    .filter((p): p is HeatPoint => p != null)
}
