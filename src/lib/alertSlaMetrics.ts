import type { AlertState, OperationalAlert } from '../types'

import { isOccurrencePending, isOccurrenceSlaClosed } from './occurrenceState'

const OPEN_STATES: AlertState[] = ['novo', 'reconhecido', 'em atendimento', 'em observação']

export function isAlertOpen(state: AlertState): boolean {
  return OPEN_STATES.includes(state) && isOccurrencePending(state)
}

export function msBetween(fromIso: string, toIso: string | null | undefined, nowMs = Date.now()): number {
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : nowMs
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, to - from)
}

/** Relógio até a primeira ação: congela quando a ação ocorre; segue correndo se o alerta ainda está aberto. */
export function slaClock(
  detectedAt: string,
  actionAt: string | undefined,
  nowMs: number,
  closed: boolean,
): { ms: number | null; pending: boolean } {
  if (actionAt) return { ms: msBetween(detectedAt, actionAt, nowMs), pending: false }
  if (closed) return { ms: null, pending: false }
  return { ms: msBetween(detectedAt, undefined, nowMs), pending: true }
}

export function firstResponseOverdue(alert: Pick<OperationalAlert, 'responseDueAt' | 'claimedAt' | 'state'>, nowMs = Date.now()): boolean {
  if (!alert.responseDueAt) return false
  const closed = isOccurrenceSlaClosed(alert.state)
  const checkpoint = alert.claimedAt ? new Date(alert.claimedAt).getTime() : nowMs
  if (closed && !alert.claimedAt) return false
  return checkpoint > new Date(alert.responseDueAt).getTime()
}
