import type { AlertSeverity, OperationalAlert, UrbanAsset } from '@/types'

const CLOSED = new Set(['resolvido', 'falso positivo', 'os_aberta'])

export type AssetAlertSummary = {
  count: number
  label: string
  severity: AlertSeverity
}

export function isOpenAlert(alert: OperationalAlert): boolean {
  return !CLOSED.has(alert.state)
}

function severityRank(s: AlertSeverity): number {
  if (s === 'crítica') return 5
  if (s === 'alta') return 4
  if (s === 'média') return 3
  if (s === 'baixa') return 2
  return 1
}

export function summarizeAssetAlerts(alerts: OperationalAlert[]): Map<string, AssetAlertSummary> {
  const grouped = new Map<string, OperationalAlert[]>()
  for (const alert of alerts) {
    if (!isOpenAlert(alert) || !alert.relatedAssetId) continue
    const list = grouped.get(alert.relatedAssetId) ?? []
    list.push(alert)
    grouped.set(alert.relatedAssetId, list)
  }
  const out = new Map<string, AssetAlertSummary>()
  for (const [id, list] of grouped) {
    const top = [...list].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]!
    out.set(id, {
      count: list.length,
      label: top.title,
      severity: top.severity,
    })
  }
  return out
}

export function alertSummaryForAsset(
  asset: UrbanAsset,
  byAsset: Map<string, AssetAlertSummary>,
): AssetAlertSummary | undefined {
  const fromAlerts = byAsset.get(asset.id)
  if (fromAlerts) return fromAlerts
  if (asset.status === 'alerta') {
    return { count: 1, label: 'Ativo em alerta', severity: 'alta' }
  }
  return undefined
}
