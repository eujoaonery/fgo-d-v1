import type { AlertSeverity, AlertState, OperationalAlert } from '../types'
import type { CcoMemberRole } from './ccoPermissions'
import { normalizeMemberRole } from './ccoPermissions'

export const DEFAULT_SLA_MINUTES = 60

export const DEFAULT_SLA_CATEGORIES = [
  'Comunicação',
  'CFTV',
  'Tráfego',
  'Ambiental',
  'Conectividade',
  'Operação',
  'Manutenção',
  'Semáforos',
  'Câmeras',
  'Sensores',
  'Painéis',
  'Trânsito',
] as const

const SETTINGS_KEY = 'slaByCategory'

export function parseSlaByCategory(settings: Record<string, unknown> | null | undefined): Record<string, number> {
  const raw = settings?.[SETTINGS_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    const minutes = typeof value === 'number' ? value : Number(value)
    if (!name || !Number.isFinite(minutes) || minutes <= 0) continue
    out[name] = Math.min(24 * 60, Math.max(1, Math.round(minutes)))
  }
  return out
}

export function slaMinutesForCategory(
  category: string,
  settings: Record<string, unknown> | null | undefined,
  fallbackMinutes = DEFAULT_SLA_MINUTES,
): number {
  const map = parseSlaByCategory(settings)
  const exact = map[category]
  if (exact) return exact
  const lower = category.trim().toLowerCase()
  for (const [key, minutes] of Object.entries(map)) {
    if (key.toLowerCase() === lower) return minutes
  }
  return fallbackMinutes
}

export function slaWindowMs(minutes: number): number {
  return Math.max(60_000, minutes * 60_000)
}

/**
 * Percentual da janela alerta → conclusão da OS (ou resolução sem OS).
 * Permanece 100% até o último minuto; daí cai linearmente e pode ficar negativo.
 * Ex.: SLA de 60 min — até 59 min = 100%; no minuto 60 = 0%; depois negativo.
 */
export function slaPercent(windowMs: number, elapsedMs: number): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) return elapsedMs > 0 ? -100 : 100
  const decayStart = Math.max(0, windowMs - 60_000)
  if (elapsedMs <= decayStart) return 100
  return Math.round(((windowMs - elapsedMs) / 60_000) * 1000) / 10
}

export function slaElapsedMs(alert: Pick<OperationalAlert, 'detectedAt' | 'completedAt' | 'state'>, nowMs = Date.now()): number {
  const start = Date.parse(alert.detectedAt)
  if (!Number.isFinite(start)) return 0
  const closed = alert.state === 'resolvido' || alert.state === 'falso positivo'
  const end = alert.completedAt && closed ? Date.parse(alert.completedAt) : nowMs
  const to = Number.isFinite(end) ? end : nowMs
  return Math.max(0, to - start)
}

export function slaWindowFromAlert(alert: Pick<OperationalAlert, 'detectedAt' | 'responseDueAt'>, fallbackMinutes = DEFAULT_SLA_MINUTES): number {
  if (alert.responseDueAt) {
    const due = Date.parse(alert.responseDueAt)
    const start = Date.parse(alert.detectedAt)
    if (Number.isFinite(due) && Number.isFinite(start) && due > start) return due - start
  }
  return slaWindowMs(fallbackMinutes)
}

export function slaPercentForAlert(alert: Pick<OperationalAlert, 'detectedAt' | 'responseDueAt' | 'completedAt' | 'state'>, nowMs = Date.now()): number {
  return slaPercent(slaWindowFromAlert(alert), slaElapsedMs(alert, nowMs))
}

export function formatSlaPercent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}%`
}

export function slaTone(value: number): 'ok' | 'warn' | 'critical' {
  if (value < 0) return 'critical'
  if (value < 50) return 'warn'
  return 'ok'
}

export function canSeeCategorySla(opts: { isPlatformSuperAdmin?: boolean; memberRole?: CcoMemberRole | string | null }): boolean {
  if (opts.isPlatformSuperAdmin) return true
  const role = normalizeMemberRole(opts.memberRole)
  return role === 'admin' || role === 'manager'
}

export function slaSettingsPayload(minutesByCategory: Record<string, number>): Record<string, unknown> {
  return { [SETTINGS_KEY]: parseSlaByCategory({ [SETTINGS_KEY]: minutesByCategory }) }
}

/** Fallback por severidade só quando a categoria não tem SLA configurado. */
export function fallbackMinutesForSeverity(severity: AlertSeverity): number {
  switch (severity) {
    case 'crítica':
      return 15
    case 'alta':
      return 30
    case 'média':
      return 60
    case 'baixa':
      return 120
    default:
      return 240
  }
}

export function isClosedAlert(state: AlertState): boolean {
  return state === 'resolvido' || state === 'falso positivo' || state === 'os_aberta'
}
