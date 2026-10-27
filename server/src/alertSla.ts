import type { AlertSeverity } from './types.js'
import {
  fallbackMinutesForSeverity,
  slaMinutesForCategory,
  slaWindowMs,
} from '../../src/lib/categorySla.js'

export function responseDueAtForSeverity(severity: AlertSeverity, from = new Date()): string {
  return new Date(from.getTime() + slaWindowMs(fallbackMinutesForSeverity(severity))).toISOString()
}

export function responseDueAtForAlert(
  category: string,
  severity: AlertSeverity,
  from = new Date(),
  settings?: Record<string, unknown> | null,
): string {
  const minutes = slaMinutesForCategory(category, settings, fallbackMinutesForSeverity(severity))
  return new Date(from.getTime() + slaWindowMs(minutes)).toISOString()
}

export function isAlertOverdue(dueAt: string | undefined | null, state: string): boolean {
  if (!dueAt) return false
  if (state === 'resolvido' || state === 'falso positivo' || state === 'os_aberta') return false
  return Date.now() > new Date(dueAt).getTime()
}
