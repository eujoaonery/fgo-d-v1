export const MONITORING_TICK_MIN_SEC = 5
export const MONITORING_TICK_MAX_SEC = 3600

export function clampMonitoringIntervalSec(seconds: number): number {
  if (!Number.isFinite(seconds)) return 60
  return Math.min(MONITORING_TICK_MAX_SEC, Math.max(MONITORING_TICK_MIN_SEC, Math.round(seconds)))
}

export function formatMonitoringInterval(seconds: number): string {
  const s = clampMonitoringIntervalSec(seconds)
  if (s < 60) return `${s} s`
  if (s % 60 === 0) return `${s / 60} min`
  return `${(s / 60).toFixed(1).replace('.', ',')} min`
}
