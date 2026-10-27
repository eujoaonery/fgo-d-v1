import type { AlertState, Incident, OperationalAlert } from '../types'
import { isAlertOpen } from './alertSlaMetrics'
import { isOccurrenceFinal, isOccurrenceSlaClosed } from './occurrenceState'

export function isAlertPending(state: AlertState): boolean {
  return isAlertOpen(state)
}

export function isAlertResolved(state: AlertState): boolean {
  return isOccurrenceFinal(state)
}

export function alertKpiTotals(alerts: OperationalAlert[]) {
  return {
    total: alerts.length,
    pending: alerts.filter((a) => isAlertPending(a.state)).length,
    resolved: alerts.filter((a) => isAlertResolved(a.state)).length,
  }
}

function incidentsById(incidents: Incident[]): Map<string, Incident> {
  return new Map(incidents.map((i) => [i.id, i]))
}

/** Alerta assumido pelo operador e ainda pendente. */
export function operatorAssumedCount(alerts: OperationalAlert[], userId: string | undefined): number {
  if (!userId) return 0
  return alerts.filter((a) => a.claimedBy === userId && isAlertPending(a.state)).length
}

/**
 * Solucionado pelo operador: alerta resolvido sem OS, ou OS agendada e finalizada
 * vinculada ao alerta que ele assumiu.
 */
export function operatorSolvedCount(
  alerts: OperationalAlert[],
  incidents: Incident[],
  userId: string | undefined,
): number {
  if (!userId) return 0
  const os = incidentsById(incidents)
  return alerts.filter((a) => isSolvedForOperator(a, userId, os)).length
}

export function isSolvedForOperator(
  alert: OperationalAlert,
  userId: string,
  incidents: Map<string, Incident>,
): boolean {
  if (alert.claimedBy !== userId) return false
  if (alert.incidentId) {
    const order = incidents.get(alert.incidentId)
    return order?.status === 'resolvida' && Boolean(order.scheduledStart)
  }
  return isOccurrenceSlaClosed(alert.state)
}

export function operatorAlertKpis(
  alerts: OperationalAlert[],
  incidents: Incident[],
  userId: string | undefined,
) {
  const totals = alertKpiTotals(alerts)
  return {
    ...totals,
    assumed: operatorAssumedCount(alerts, userId),
    solved: operatorSolvedCount(alerts, incidents, userId),
  }
}
